export type ProviderFormat = "openai" | "anthropic";

export interface ProviderPreset {
  id: string;
  name: string;
  format: ProviderFormat;
  apiUrl: string;
  models: string[];
  defaultModel: string;
}

export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: "openai",
    name: "OpenAI",
    format: "openai",
    apiUrl: "https://api.openai.com/v1/chat/completions",
    models: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo"],
    defaultModel: "gpt-4o",
  },
  {
    id: "anthropic",
    name: "Claude",
    format: "anthropic",
    apiUrl: "https://api.anthropic.com/v1/messages",
    models: ["claude-sonnet-4-20250514", "claude-haiku-4-5-20251001"],
    defaultModel: "claude-sonnet-4-20250514",
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    format: "openai",
    apiUrl: "https://api.deepseek.com/v1/chat/completions",
    models: ["deepseek-chat", "deepseek-coder"],
    defaultModel: "deepseek-chat",
  },
  {
    id: "qwen",
    name: "通义千问",
    format: "openai",
    apiUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
    models: ["qwen-max", "qwen-plus", "qwen-turbo"],
    defaultModel: "qwen-plus",
  },
  {
    id: "moonshot",
    name: "Kimi",
    format: "openai",
    apiUrl: "https://api.moonshot.cn/v1/chat/completions",
    models: ["moonshot-v1-8k", "moonshot-v1-32k", "moonshot-v1-128k"],
    defaultModel: "moonshot-v1-8k",
  },
  {
    id: "zhipu",
    name: "智谱 GLM",
    format: "openai",
    apiUrl: "https://open.bigmodel.cn/api/paas/v4/chat/completions",
    models: ["glm-4", "glm-4-flash", "glm-4v"],
    defaultModel: "glm-4-flash",
  },
  {
    id: "custom",
    name: "自定义",
    format: "openai",
    apiUrl: "",
    models: [],
    defaultModel: "",
  },
];

export function getPreset(id: string): ProviderPreset {
  return PROVIDER_PRESETS.find((p) => p.id === id) || PROVIDER_PRESETS[PROVIDER_PRESETS.length - 1];
}
