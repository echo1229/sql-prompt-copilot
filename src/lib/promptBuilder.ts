import type { QueryMode } from "@/types";
import { formatSchemaContext, type SchemaMatch } from "./schemaRAG";

const TODAY = new Date().toISOString().slice(0, 10);

const MODE_INSTRUCTIONS: Record<QueryMode, string> = {
  generate: `你是一个专业的 SQL 提示词优化助手。你的任务是将用户的模糊自然语言描述转化为严谨、可执行的 SQL 查询提示词。`,

  optimize: `你是一个专业的 SQL 优化专家。你的任务是分析用户提供的 SQL 语句，找出性能问题和不规范写法，输出优化后的 SQL。`,

  explain: `你是一个专业的 SQL 教学助手。你的任务是用通俗易懂的中文详细解释用户提供的 SQL 语句，包括每一步的逻辑和数据流向。`,
};

const MODE_OUTPUT_HINTS: Record<QueryMode, string> = {
  generate: `optimized_prompt 为注入了表结构且绝对严谨的 SQL 提示词（纯 SQL + 中文注释）`,

  optimize: `optimized_prompt 为优化后的 SQL（纯 SQL + 中文注释，说明每个优化点）`,

  explain: `optimized_prompt 为对 SQL 的详细中文解释，按执行顺序逐步说明逻辑。modifications 列出每一步的关键点。dag_nodes/edges 展示数据流向`,
};

function getSystemPrompt(schemaContext: string, mode: QueryMode): string {
  return `${MODE_INSTRUCTIONS[mode]}

## 严格规则（必须遵守）
1. **时间边界**：当前日期为 ${TODAY}。所有相对时间（如"上个月"、"最近一周"）必须转换为精确的绝对日期范围。
2. **禁止 SELECT ***：必须明确列出所有需要的字段。
3. **JOIN 限制**：只能使用 INNER JOIN 或 LEFT JOIN，禁止 FULL OUTER JOIN 和 CROSS JOIN。每次 JOIN 必须明确 ON 条件。
4. **基于 Schema**：只能使用下方提供的表结构中存在的表名和列名，不得臆造不存在的表或字段。
5. **输出格式**：必须严格输出以下 JSON 格式，不要输出任何其他内容。

## 可用表结构
${schemaContext}

## 输出 JSON 格式
\`\`\`json
{
  "optimized_prompt": "${MODE_OUTPUT_HINTS[mode]}",
  "modifications": [
    {
      "original": "原始表述或原 SQL 片段",
      "modified": "你的修改",
      "reason": "修改原因"
    }
  ],
  "dag_nodes": [
    { "id": "1", "type": "table", "label": "表名" },
    { "id": "2", "type": "operation", "label": "操作名" },
    { "id": "3", "type": "output", "label": "Result" }
  ],
  "dag_edges": [
    { "id": "e1", "source": "1", "target": "2", "label": "关联说明" }
  ]
}
\`\`\`

## dag 生成规则
- type 可选: "table"（数据源表）, "operation"（SQL 操作如 JOIN/WHERE/ORDER BY/GROUP BY/LIMIT）, "output"（最终结果）
- edges 描述数据流向，label 说明关联条件或操作细节
- 最终节点固定为 type="output", label="Result"`;
}

export function buildMessages(
  query: string,
  schemaMatches: SchemaMatch[],
  mode: QueryMode
) {
  const schemaContext = formatSchemaContext(schemaMatches);
  const systemPrompt = getSystemPrompt(schemaContext, mode);

  return [
    { role: "system", content: systemPrompt },
    { role: "user", content: query },
  ];
}
