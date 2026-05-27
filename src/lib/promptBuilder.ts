import type { QueryMode } from "@/types";
import { formatSchemaContext, type SchemaMatch } from "./schemaRAG";
import { searchCorrections } from "./correctionKB";

const TODAY = new Date().toISOString().slice(0, 10);

const MODE_INSTRUCTIONS: Record<QueryMode, string> = {
  generate: `你是一个专业的数据分析任务规划助手。你的任务是根据用户的自然语言需求和数据库真实表结构，生成一份飞书数据分析 Agent 可直接使用的任务提示词。

输出格式要求：
1. 先输出自然语言的任务描述（给用户看的）
2. 然后输出一个 [TASK_PLAN] 结构化块（给 Data Agent 解析用），包含建议的 SQL 和分析目标

[TASK_PLAN] 块的格式（严格遵守）：
[TASK_PLAN]
SQL: <建议的 SQL 语句，基于真实 schema>
GOAL: <分析目标，一句话描述>
TABLES: <涉及的表名，逗号分隔>
[/TASK_PLAN]

注意：
- SQL 必须使用下方表结构中的真实表名和列名
- [TASK_PLAN] 块是必须的，Data Agent 会解析它来直接执行 SQL
- 自然语言描述部分写清楚分析目标和输出要求即可`,

  optimize: `你是一个专业的 SQL 优化专家。你的任务是分析用户提供的 SQL 语句，找出性能问题和不规范写法，输出优化后的 SQL。`,

  explain: `你是一个专业的 SQL 教学助手。你的任务是用通俗易懂的中文详细解释用户提供的 SQL 语句，包括每一步的逻辑和数据流向。`,
};

const MODE_OUTPUT_HINTS: Record<QueryMode, string> = {
  generate: `optimized_prompt 为飞书数据分析 Agent 任务提示词，包含自然语言描述 + [TASK_PLAN] 结构化块（含 SQL、分析目标、涉及表名）`,

  optimize: `optimized_prompt 为优化后的 SQL（纯 SQL + 中文注释，说明每个优化点）`,

  explain: `optimized_prompt 为对 SQL 的详细中文解释，按执行顺序逐步说明逻辑。modifications 列出每一步的关键点。dag_nodes/edges 展示数据流向（可选，仅在有表结构信息时生成）`,
};

function getSystemPrompt(schemaContext: string, mode: QueryMode): string {
  const isGenerate = mode === "generate";
  const isExplain = mode === "explain";

  const rules = isGenerate
    ? `## 规则
1. 当前日期: ${TODAY}。相对时间转绝对日期。
2. 必须使用下方表结构中的真实表名和列名，不要猜测或编造。
3. 提示词应详细、具体，包含完整的分析步骤和输出格式要求。
4. 输出的提示词是给飞书数据分析 Agent 使用的，用自然语言描述，不要写 SQL。`
    : `## 规则
1. 当前日期: ${TODAY}。相对时间转绝对日期，注意时区（UTC vs UTC+8 用 CONVERT_TZ）。
2. 禁止 SELECT *，明确列出字段。JOIN 只用 INNER/LEFT，禁止 FULL OUTER/CROSS。
3. 只用下方表结构中的表名和列名。!= 时考虑 NULL。VARCHAR 用字符串比较。
4. 聚合加 HAVING COUNT。深翻页用游标分页。检查逻辑矛盾。`;

  const dagHint = isGenerate
    ? `dag_nodes 和 dag_edges 为空数组 []`
    : isExplain
    ? `dag_nodes/edges 展示数据流向（可选，仅在有表结构时生成，否则为空数组）`
    : `dag_nodes: [{"id":"1","type":"table","label":"表名"}]。dag_edges: [{"id":"e1","source":"1","target":"2","label":"说明"}]。type 为 table/operation/output，最终节点 type=output label=Result`;

  return `${MODE_INSTRUCTIONS[mode]}

${rules}

## 表结构
${schemaContext}

## 输出 JSON（仅输出 JSON，无其他内容）
\`\`\`json
{
  "optimized_prompt": "${MODE_OUTPUT_HINTS[mode]}",
  "modifications": [{"original":"原片段","modified":"修改后","reason":"原因"}],
  "dag_nodes": [],
  "dag_edges": []
}
\`\`\`

${dagHint}`;
}

export function buildMessages(
  query: string,
  schemaMatches: SchemaMatch[],
  mode: QueryMode
) {
  const schemaContext = formatSchemaContext(schemaMatches);
  let systemPrompt = getSystemPrompt(schemaContext, mode);

  // 注入纠错知识库：如果匹配到历史纠错，提醒 LLM 避免重复错误
  const correction = searchCorrections(query);
  if (correction) {
    systemPrompt += `\n\n## 历史纠错（必须遵守）
之前用户反馈过类似问题：
- 用户输入：${correction.query}
- 错误原因：${correction.error}
- 正确做法：${correction.correction}
请确保不要重复同样的错误。`;
  }

  return [
    { role: "system", content: systemPrompt },
    { role: "user", content: query },
  ];
}
