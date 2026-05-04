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

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w一-鿿]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 0);
}

function matchScore(tableName: string, columns: { name: string; description: string }[], tokens: string[]): number {
  let score = 0;
  const nameLower = tableName.toLowerCase();

  for (const token of tokens) {
    if (nameLower.includes(token) || token.includes(nameLower)) {
      score += 10;
    }
    for (const col of columns) {
      if (col.name.toLowerCase().includes(token)) {
        score += 5;
      }
      if (col.description.toLowerCase().includes(token)) {
        score += 3;
      }
    }
  }
  return score;
}

export interface SchemaMatch {
  table: SchemaTable;
  score: number;
  matchedColumns: SchemaTable["columns"];
}

export function searchSchema(query: string): SchemaMatch[] {
  const tokens = tokenize(query);
  if (tokens.length === 0) return [];

  const tables = getAllTables();
  const results: SchemaMatch[] = [];

  for (const table of tables) {
    const score = matchScore(table.name, table.columns, tokens);
    if (score > 0) {
      const matchedColumns = table.columns.filter((col) =>
        tokens.some(
          (token) =>
            col.name.toLowerCase().includes(token) ||
            col.description.toLowerCase().includes(token) ||
            table.name.toLowerCase().includes(token)
        )
      );
      results.push({
        table,
        score,
        matchedColumns: matchedColumns.length > 0 ? matchedColumns : table.columns,
      });
    }
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
