import type { SchemaTable } from "@/types";
import schemaData from "@/data/schema.json";

const localTables: SchemaTable[] = schemaData;
let externalTables: SchemaTable[] = [];

export function setExternalSchema(tables: SchemaTable[] | null) {
  externalTables = tables || [];
}

function getAllTables(): SchemaTable[] {
  if (externalTables.length > 0) return externalTables;
  return localTables;
}

export function getCurrentSchema(): SchemaTable[] {
  return getAllTables();
}

// ════════════════════════════════════════════════════════════════
// 改进的分词器：处理 camelCase / snake_case / 中文
// ════════════════════════════════════════════════════════════════

function tokenize(text: string): string[] {
  const tokens: string[] = [];
  // 中文逐字拆分 + 英文按 camelCase/snake_case 拆分
  const segments = text.split(/[^一-鿿a-zA-Z0-9]+/).filter(Boolean);
  for (const seg of segments) {
    // 中文字符逐字
    const chinese = seg.match(/[一-鿿]/g);
    if (chinese) tokens.push(...chinese);
    // camelCase 拆分
    const camel = seg.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2");
    // snake_case 拆分
    const snake = camel.replace(/_/g, " ");
    const words = snake.toLowerCase().split(/\s+/).filter(Boolean);
    tokens.push(...words);
  }
  return [...new Set(tokens)];
}

// ════════════════════════════════════════════════════════════════
// 同义词表（中英文常见数据库术语）
// ════════════════════════════════════════════════════════════════

const SYNONYMS: Record<string, string[]> = {
  "用户": ["user", "customer", "account", "member"],
  "user": ["用户", "customer", "account", "member"],
  "订单": ["order", "purchase", "transaction"],
  "order": ["订单", "purchase", "transaction"],
  "销售": ["sale", "sell", "revenue"],
  "sale": ["销售", "sell", "revenue"],
  "产品": ["product", "item", "goods"],
  "product": ["产品", "item", "goods"],
  "价格": ["price", "cost", "amount"],
  "price": ["价格", "cost", "amount"],
  "数量": ["quantity", "count", "num", "qty"],
  "quantity": ["数量", "count", "num", "qty"],
  "日期": ["date", "time", "created", "updated"],
  "date": ["日期", "time"],
  "名称": ["name", "title"],
  "name": ["名称", "title"],
  "状态": ["status", "state"],
  "status": ["状态", "state"],
  "分类": ["category", "type", "class"],
  "category": ["分类", "type", "class"],
  "金额": ["amount", "total", "sum", "money"],
  "amount": ["金额", "total", "sum", "money"],
  "部门": ["department", "dept", "division"],
  "department": ["部门", "dept"],
  "地址": ["address", "location", "addr"],
  "address": ["地址", "location", "addr"],
  "电话": ["phone", "tel", "mobile"],
  "phone": ["电话", "tel", "mobile"],
  "邮箱": ["email", "mail"],
  "email": ["邮箱", "mail"],
};

function expandSynonyms(tokens: string[]): string[] {
  const expanded = new Set(tokens);
  for (const token of tokens) {
    const synonyms = SYNONYMS[token];
    if (synonyms) synonyms.forEach((s) => expanded.add(s));
  }
  return [...expanded];
}

// ════════════════════════════════════════════════════════════════
// BM25 参数
// ════════════════════════════════════════════════════════════════

const BM25_K1 = 1.5;
const BM25_B = 0.75;

interface BM25Doc {
  tableName: string;
  tokens: string[];
  tokenFreq: Map<string, number>;
  docLen: number;
}

function buildCorpus(tables: SchemaTable[]): { docs: BM25Doc[]; avgDl: number; df: Map<string, number> } {
  const docs: BM25Doc[] = [];
  const df = new Map<string, number>();
  let totalLen = 0;

  for (const table of tables) {
    // 表名 + 列名 + 描述拼接为文档
    const allText = [
      table.name,
      table.description,
      ...table.columns.map((c) => `${c.name} ${c.description}`),
    ].join(" ");

    const tokens = tokenize(allText);
    const tokenFreq = new Map<string, number>();
    for (const t of tokens) {
      tokenFreq.set(t, (tokenFreq.get(t) || 0) + 1);
    }

    // 文档频率
    const uniqueTokens = new Set(tokens);
    for (const t of uniqueTokens) {
      df.set(t, (df.get(t) || 0) + 1);
    }

    docs.push({ tableName: table.name, tokens, tokenFreq, docLen: tokens.length });
    totalLen += tokens.length;
  }

  return { docs, avgDl: totalLen / Math.max(docs.length, 1), df };
}

function bm25Score(doc: BM25Doc, queryTokens: string[], avgDl: number, df: Map<string, number>, N: number): number {
  let score = 0;
  for (const qt of queryTokens) {
    const tf = doc.tokenFreq.get(qt) || 0;
    if (tf === 0) continue;
    const docFreq = df.get(qt) || 0;
    const idf = Math.log((N - docFreq + 0.5) / (docFreq + 0.5) + 1);
    const tfNorm = (tf * (BM25_K1 + 1)) / (tf + BM25_K1 * (1 - BM25_B + BM25_B * (doc.docLen / avgDl)));
    score += idf * tfNorm;
  }
  return score;
}

// ════════════════════════════════════════════════════════════════
// 对外接口
// ════════════════════════════════════════════════════════════════

export interface SchemaMatch {
  table: SchemaTable;
  score: number;
  matchedColumns: SchemaTable["columns"];
}

export function searchSchema(query: string): SchemaMatch[] {
  const rawTokens = tokenize(query);
  if (rawTokens.length === 0) return [];

  const queryTokens = expandSynonyms(rawTokens);
  const tables = getAllTables();
  const { docs, avgDl, df } = buildCorpus(tables);
  const N = docs.length;

  const results: SchemaMatch[] = [];

  for (let i = 0; i < docs.length; i++) {
    const doc = docs[i];
    const table = tables[i];

    // BM25 基础分
    let score = bm25Score(doc, queryTokens, avgDl, df, N);

    // 表名精确匹配加分
    const nameLower = table.name.toLowerCase();
    for (const token of rawTokens) {
      if (nameLower.includes(token) || token.includes(nameLower)) {
        score += 10;
      }
    }

    if (score <= 0) continue;

    // 匹配的列
    const matchedColumns = table.columns.filter((col) => {
      const colTokens = tokenize(`${col.name} ${col.description}`);
      return queryTokens.some((qt) => colTokens.includes(qt));
    });

    results.push({
      table,
      score,
      matchedColumns: matchedColumns.length > 0 ? matchedColumns : table.columns,
    });
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, 5);
}

export function formatSchemaContext(matches: SchemaMatch[]): string {
  if (matches.length === 0) {
    return "未匹配到相关表结构。请根据通用 SQL 最佳实践生成。";
  }

  return matches
    .map((m) => {
      const cols = m.matchedColumns
        .map((c) => {
          const flags = [
            c.isPrimaryKey ? "PK" : "",
            c.isForeignKey ? `FK->${c.references}` : "",
          ]
            .filter(Boolean)
            .join(", ");
          return `  - ${c.name} (${c.type})${flags ? " [" + flags + "]" : ""}: ${c.description}`;
        })
        .join("\n");
      return `表名: ${m.table.name}\n说明: ${m.table.description}\n列:\n${cols}`;
    })
    .join("\n\n");
}
