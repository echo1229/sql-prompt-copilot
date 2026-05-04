import { Parser } from "node-sql-parser";
import type { DAGNode, DAGEdge } from "@/types";

export interface ParseResult {
  nodes: DAGNode[];
  edges: DAGEdge[];
  analysis: AnalysisWarning[];
}

export interface AnalysisWarning {
  nodeId: string;
  type: "full_scan" | "select_star" | "missing_limit" | "cross_join" | "subquery_heavy";
  message: string;
}

const parser = new Parser();

let nodeIdCounter = 0;
let edgeIdCounter = 0;

function nextNodeId(): string {
  return `n${++nodeIdCounter}`;
}

function nextEdgeId(): string {
  return `e${++edgeIdCounter}`;
}

function resetCounters() {
  nodeIdCounter = 0;
  edgeIdCounter = 0;
}

// Extract tables from AST
function extractTables(ast: Record<string, unknown>): string[] {
  const tables: string[] = [];
  const from = ast.from as Array<Record<string, unknown>> | undefined;
  if (from) {
    for (const item of from) {
      if (item.table) {
        tables.push(item.table as string);
      }
      // Handle JOINs
      if (item.join) {
        const joins = Array.isArray(item.join) ? item.join : [item.join];
        for (const j of joins) {
          if (typeof j === "object" && j !== null && "table" in j) {
            tables.push((j as Record<string, unknown>).table as string);
          }
        }
      }
    }
  }
  return [...new Set(tables)];
}

// Extract WHERE conditions
function extractWhere(where: Record<string, unknown> | null): string[] {
  if (!where) return [];
  const conditions: string[] = [];

  function walk(node: Record<string, unknown>) {
    if (node.type === "binary_expr") {
      const left = node.left as Record<string, unknown>;
      const right = node.right as Record<string, unknown>;
      if (left?.column && right?.value !== undefined) {
        conditions.push(`${left.column} ${node.operator} ${right.value}`);
      }
      if (node.left) walk(node.left as Record<string, unknown>);
      if (node.right) walk(node.right as Record<string, unknown>);
    }
  }

  walk(where);
  return conditions;
}

// Extract ORDER BY
function extractOrderBy(orderBy: Array<Record<string, unknown>> | null): string[] {
  if (!orderBy) return [];
  return orderBy.map((o) => {
    const expr = o.expr as Record<string, unknown>;
    const dir = (o.type as string) || "ASC";
    return `${expr?.column || expr?.value || "?"} ${dir}`;
  });
}

// Extract GROUP BY
function extractGroupBy(groupBy: Array<Record<string, unknown>> | null): string[] {
  if (!groupBy) return [];
  return groupBy.map((g) => {
    const expr = g as Record<string, unknown>;
    return (expr?.column as string) || (expr?.value as string) || "?";
  });
}

// Extract LIMIT
function extractLimit(limit: Record<string, unknown> | null): number | null {
  if (!limit) return null;
  const val = limit.value;
  if (Array.isArray(val)) return val[0]?.value as number;
  return val as number;
}

// Check for SELECT *
function hasSelectStar(columns: unknown): boolean {
  if (columns === "*") return true;
  if (Array.isArray(columns)) {
    return columns.some((c: unknown) => {
      const col = c as Record<string, unknown>;
      const expr = col.expr as Record<string, unknown> | undefined;
      return expr?.type === "star" || String(col) === "*";
    });
  }
  return false;
}

export function parseSQLToDAG(sql: string): ParseResult {
  resetCounters();
  const nodes: DAGNode[] = [];
  const edges: DAGEdge[] = [];
  const analysis: AnalysisWarning[] = [];

  let ast: Record<string, unknown>;
  try {
    const result = parser.astify(sql, { database: "MySQL" });
    const raw = Array.isArray(result) ? result[0] : result;
    ast = raw as unknown as Record<string, unknown>;
  } catch {
    return { nodes: [], edges: [], analysis: [] };
  }

  const astType = String(ast.type || "").toLowerCase();
  if (astType !== "select") {
    return { nodes: [], edges: [], analysis: [] };
  }

  // 1. Table nodes
  const tables = extractTables(ast);
  const tableNodeIds = new Map<string, string>();
  for (const table of tables) {
    const id = nextNodeId();
    nodes.push({ id, type: "table", label: table });
    tableNodeIds.set(table, id);
  }

  // 2. WHERE node
  const whereConditions = extractWhere(ast.where as Record<string, unknown> | null);
  let whereNodeId: string | null = null;
  if (whereConditions.length > 0) {
    whereNodeId = nextNodeId();
    nodes.push({ id: whereNodeId, type: "operation", label: "WHERE" });
  }

  // 3. GROUP BY node
  const groupByCols = extractGroupBy(ast.groupby as Array<Record<string, unknown>> | null);
  let groupByNodeId: string | null = null;
  if (groupByCols.length > 0) {
    groupByNodeId = nextNodeId();
    nodes.push({ id: groupByNodeId, type: "operation", label: `GROUP BY` });
  }

  // 4. ORDER BY node
  const orderByCols = extractOrderBy(ast.orderby as Array<Record<string, unknown>> | null);
  let orderByNodeId: string | null = null;
  if (orderByCols.length > 0) {
    orderByNodeId = nextNodeId();
    nodes.push({ id: orderByNodeId, type: "operation", label: `ORDER BY` });
  }

  // 5. LIMIT node
  const limitVal = extractLimit(ast.limit as Record<string, unknown> | null);
  let limitNodeId: string | null = null;
  if (limitVal !== null) {
    limitNodeId = nextNodeId();
    nodes.push({ id: limitNodeId, type: "operation", label: `LIMIT ${limitVal}` });
  }

  // 6. Result node
  const resultNodeId = nextNodeId();
  nodes.push({ id: resultNodeId, type: "output", label: "Result" });

  // 7. Build edges
  // Tables → WHERE or first operation or result
  const firstOp = whereNodeId || groupByNodeId || orderByNodeId || limitNodeId || resultNodeId;

  for (const [, tableId] of tableNodeIds) {
    edges.push({
      id: nextEdgeId(),
      source: tableId,
      target: firstOp,
      label: tables[Array.from(tableNodeIds.values()).indexOf(tableId)],
    });
  }

  // Chain: WHERE → GROUP BY → ORDER BY → LIMIT → Result
  const chain = [whereNodeId, groupByNodeId, orderByNodeId, limitNodeId, resultNodeId].filter(Boolean) as string[];
  for (let i = 0; i < chain.length - 1; i++) {
    const label =
      chain[i + 1] === groupByNodeId ? "group" :
      chain[i + 1] === orderByNodeId ? "sort" :
      chain[i + 1] === limitNodeId ? "limit" :
      chain[i + 1] === resultNodeId ? "output" : "";
    edges.push({ id: nextEdgeId(), source: chain[i], target: chain[i + 1], label });
  }

  // 8. Analysis warnings
  // SELECT * check
  if (hasSelectStar(ast.columns)) {
    analysis.push({
      nodeId: resultNodeId,
      type: "select_star",
      message: "使用了 SELECT *，建议明确列出需要的字段",
    });
  }

  // Missing LIMIT
  if (limitVal === null) {
    analysis.push({
      nodeId: resultNodeId,
      type: "missing_limit",
      message: "未设置 LIMIT，大数据集可能导致性能问题",
    });
  }

  // Full table scan warning (no WHERE on a table)
  if (whereConditions.length === 0 && tables.length > 0) {
    for (const table of tables) {
      const tableId = tableNodeIds.get(table)!;
      analysis.push({
        nodeId: tableId,
        type: "full_scan",
        message: `"${table}" 无 WHERE 条件，可能全表扫描`,
      });
    }
  }

  return { nodes, edges, analysis };
}
