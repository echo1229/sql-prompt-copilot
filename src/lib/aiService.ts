import type { AIResponse, QueryMode } from "@/types";
import type { AIConfig } from "@/data/config";
import { getPreset, type ProviderFormat } from "@/data/providers";
import { searchSchema } from "./schemaRAG";
import { buildMessages } from "./promptBuilder";

function extractJSON(text: string): string {
  const match = text.match(/```json\s*([\s\S]*?)```/);
  if (match) return match[1].trim();
  const braceMatch = text.match(/\{[\s\S]*\}/);
  if (braceMatch) return braceMatch[0];
  return text;
}

function validateResponse(data: unknown): AIResponse {
  const d = data as Record<string, unknown>;
  if (typeof d.optimized_prompt !== "string") {
    throw new Error("AI 返回缺少 optimized_prompt 字段");
  }
  if (!Array.isArray(d.modifications)) {
    throw new Error("AI 返回缺少 modifications 数组");
  }
  if (!Array.isArray(d.dag_nodes) || !Array.isArray(d.dag_edges)) {
    throw new Error("AI 返回缺少 dag_nodes 或 dag_edges");
  }
  return d as unknown as AIResponse;
}

async function callOpenAI(
  config: AIConfig,
  messages: Array<{ role: string; content: string }>
): Promise<string> {
  const response = await fetch(config.apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      temperature: 0.1,
      max_tokens: 2048,
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(`API 请求失败 (${response.status}): ${errText}`);
  }

  const json = await response.json();
  const content = json.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("AI 返回内容为空");
  }
  return content;
}

async function callAnthropic(
  config: AIConfig,
  messages: Array<{ role: string; content: string }>
): Promise<string> {
  const systemMsg = messages.find((m) => m.role === "system");
  const userMessages = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role, content: m.content }));

  const response = await fetch(config.apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": config.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: 2048,
      system: systemMsg?.content || "",
      messages: userMessages,
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(`Claude API 请求失败 (${response.status}): ${errText}`);
  }

  const json = await response.json();
  const content = json.content?.[0]?.text;
  if (!content) {
    throw new Error("Claude 返回内容为空");
  }
  return content;
}

export async function generateSQLPrompt(
  query: string,
  config: AIConfig,
  mode: QueryMode = "generate"
): Promise<AIResponse> {
  if (!config.apiKey) {
    throw new Error("请先在设置中配置 API Key");
  }

  const schemaMatches = searchSchema(query);
  const messages = buildMessages(query, schemaMatches, mode);

  const preset = getPreset(config.provider);
  const format: ProviderFormat = preset.format;

  const content =
    format === "anthropic"
      ? await callAnthropic(config, messages)
      : await callOpenAI(config, messages);

  const parsed = JSON.parse(extractJSON(content));
  return validateResponse(parsed);
}
