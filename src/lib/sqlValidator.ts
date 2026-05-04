import type { SchemaTable, AIResponse } from "@/types";

export interface ValidationResult {
  valid: boolean;
  warnings: string[];
}

function extractTablesFromSQL(sql: string): string[] {
  const tables: string[] = [];
  // Match FROM and JOIN clauses
  const fromPattern = /\b(?:FROM|JOIN)\s+([`"']?\w+[`"']?)/gi;
  let match;
  while ((match = fromPattern.exec(sql)) !== null) {
    tables.push(match[1].replace(/[`"']/g, "").toLowerCase());
  }
  return [...new Set(tables)];
}

function extractColumnsFromSQL(sql: string): string[] {
  const columns: string[] = [];
  // Match SELECT columns (rough extraction)
  const selectMatch = sql.match(/\bSELECT\b([\s\S]*?)\bFROM\b/i);
  if (selectMatch) {
    const cols = selectMatch[1].split(",");
    for (const col of cols) {
      const cleaned = col
        .trim()
        .replace(/\bAS\b.*$/i, "")
        .trim();
      // Extract column name (table.column or just column)
      const parts = cleaned.split(".");
      const colName = parts[parts.length - 1].trim().replace(/[`"']/g, "").toLowerCase();
      if (colName && colName !== "*" && !colName.match(/^\d+$/)) {
        columns.push(colName);
      }
    }
  }
  return [...new Set(columns)];
}

export function validateAIResponse(
  response: AIResponse,
  schema: SchemaTable[] | null
): ValidationResult {
  const warnings: string[] = [];
  const sql = response.optimized_prompt;

  if (!schema || schema.length === 0) {
    return { valid: true, warnings: [] };
  }

  const knownTables = new Set(schema.map((t) => t.name.toLowerCase()));
  const knownColumns = new Set<string>();
  for (const table of schema) {
    for (const col of table.columns) {
      knownColumns.add(col.name.toLowerCase());
    }
  }

  // Validate tables
  const usedTables = extractTablesFromSQL(sql);
  for (const table of usedTables) {
    if (!knownTables.has(table)) {
      warnings.push(`表 "${table}" 不在当前 Schema 中，可能是幻觉`);
    }
  }

  // Validate columns (only warn for explicitly SELECTed columns)
  const usedColumns = extractColumnsFromSQL(sql);
  for (const col of usedColumns) {
    if (!knownColumns.has(col) && !col.includes("count") && !col.includes("sum") && !col.includes("avg") && !col.includes("max") && !col.includes("min")) {
      warnings.push(`字段 "${col}" 未在 Schema 中找到，请确认`);
    }
  }

  // Check for SELECT *
  if (/\bSELECT\s+\*\b/i.test(sql)) {
    warnings.push("检测到 SELECT *，建议明确列出字段");
  }

  // Check for forbidden JOIN types
  if (/\b(FULL\s+OUTER|CROSS)\s+JOIN\b/i.test(sql)) {
    warnings.push("检测到 FULL OUTER JOIN 或 CROSS JOIN，建议使用 INNER/LEFT JOIN");
  }

  return {
    valid: warnings.length === 0,
    warnings,
  };
}
