import { Parser } from "node-sql-parser";
import type { DAGNode, DAGEdge } from "@/types";

// ════════════════════════════════════════════════════════════════
// 统一中间表示 (IR) —— 归一化不同方言的 AST
// ════════════════════════════════════════════════════════════════

export type IROperationType = "SELECT" | "INSERT" | "UPDATE" | "DELETE";
export type IRDialect = "mysql" | "postgres" | "sqlite";

export interface IRTable {
  name: string;
  alias?: string;
  joinType?: "INNER" | "LEFT" | "RIGHT" | "CROSS";
  joinCondition?: string;
}

export interface IRColumn {
  name: string;
  table?: string;
  alias?: string;
  aggregation?: "COUNT" | "SUM" | "AVG" | "MAX" | "MIN";
  isStar: boolean;
}

export interface IRCondition {
  column: string;
  operator: string;
  value: unknown;
  logic?: "AND" | "OR";
}

export interface IRInsertTarget {
  table: string;
  columns: string[];
  values: unknown[][];
}

export interface IRUpdateTarget {
  table: string;
  assignments: { column: string; value: unknown }[];
}

export interface IRDeleteTarget {
  table: string;
}

export interface IRIntermediate {
  operation: IROperationType;
  dialect: IRDialect;
  tables: IRTable[];
  columns: IRColumn[];
  where: IRCondition[];
  groupBy: string[];
  orderBy: { column: string; direction: "ASC" | "DESC" }[];
  limit: number | null;
  insert?: IRInsertTarget;
  update?: IRUpdateTarget;
  delete?: IRDeleteTarget;
  rawSQL: string;
}

// ════════════════════════════════════════════════════════════════
// DAG 输出
// ════════════════════════════════════════════════════════════════

export interface AnalysisWarning {
  nodeId: string;
  type: "full_scan" | "select_star" | "missing_limit" | "cross_join" | "subquery_heavy" | "write_operation" | "missing_where";
  message: string;
}

export interface ParseResult {
  nodes: DAGNode[];
  edges: DAGEdge[];
  analysis: AnalysisWarning[];
  ir?: IRIntermediate;
}

// ════════════════════════════════════════════════════════════════
// 解析器
// ════════════════════════════════════════════════════════════════

const DIALECT_MAP: Record<string, string> = {
  mysql: "MySQL",
  postgres: "PostgreSQL",
  sqlite: "SQLite",
};

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

// ── AST 提取辅助函数 ────────────────────────────────────────────

function extractTables(ast: Record<string, unknown>): IRTable[] {
  const tables: IRTable[] = [];
  const from = ast.from as Array<Record<string, unknown>> | undefined;
  if (from) {
    for (const item of from) {
      if (item.table) {
        tables.push({ name: item.table as string, alias: item.as as string | undefined });
      }
      if (item.join) {
        const joins = Array.isArray(item.join) ? item.join : [item.join];
        for (const j of joins) {
          if (typeof j === "object" && j !== null && "table" in j) {
            tables.push({
              name: (j as Record<string, unknown>).table as string,
              joinType: ((j as Record<string, unknown>).join as string)?.replace(" JOIN", "") as IRTable["joinType"] || "INNER",
            });
          }
        }
      }
    }
  }
  return tables;
}

function extractColumns(columns: unknown): IRColumn[] {
  if (columns === "*" || columns === undefined) return [{ name: "*", isStar: true }];
  if (!Array.isArray(columns)) return [{ name: "*", isStar: true }];
  return columns.map((c: Record<string, unknown>) => {
    const expr = c.expr as Record<string, unknown> | undefined;
    if (expr?.type === "star") return { name: "*", isStar: true };
    const name = (expr?.column as string) || (expr?.value as string) || String(c);
    const aggregation = expr?.type === "aggr_func" ? (expr.name as string)?.toUpperCase() as IRColumn["aggregation"] : undefined;
    return {
      name,
      table: expr?.table as string | undefined,
      alias: c.as as string | undefined,
      aggregation,
      isStar: false,
    };
  });
}

function extractWhere(where: Record<string, unknown> | null): IRCondition[] {
  if (!where) return [];
  const conditions: IRCondition[] = [];
  function walk(node: Record<string, unknown>, logic?: "AND" | "OR") {
    if (node.type === "binary_expr") {
      const left = node.left as Record<string, unknown>;
      const right = node.right as Record<string, unknown>;
      if (left?.column && right?.value !== undefined) {
        conditions.push({ column: left.column as string, operator: node.operator as string, value: right.value, logic });
      }
      if (node.left) walk(node.left as Record<string, unknown>, logic);
      if (node.right) walk(node.right as Record<string, unknown>, logic);
    }
  }
  walk(where);
  return conditions;
}

function extractOrderBy(orderBy: Array<Record<string, unknown>> | null): IRIntermediate["orderBy"] {
  if (!orderBy) return [];
  return orderBy.map((o) => ({
    column: ((o.expr as Record<string, unknown>)?.column as string) || "?",
    direction: ((o.type as string) || "ASC").toUpperCase() as "ASC" | "DESC",
  }));
}

function extractGroupBy(groupBy: Array<Record<string, unknown>> | null): string[] {
  if (!groupBy) return [];
  return groupBy.map((g) => (g.column as string) || (g.value as string) || "?");
}

function extractLimit(limit: Record<string, unknown> | null): number | null {
  if (!limit) return null;
  const val = limit.value;
  if (Array.isArray(val)) return val[0]?.value as number;
  return val as number;
}

function hasSelectStar(columns: unknown): boolean {
  if (columns === "*") return true;
  if (Array.isArray(columns)) {
    return columns.some((c: unknown) => {
      const col = c as Record<string, unknown>;
      return (col.expr as Record<string, unknown>)?.type === "star" || String(col) === "*";
    });
  }
  return false;
}

// ── AST → IR 转换 ────────────────────────────────────────────────

function astToIR(ast: Record<string, unknown>, dialect: IRDialect, rawSQL: string): IRIntermediate {
  const astType = String(ast.type || "").toUpperCase();

  const base: Omit<IRIntermediate, "operation" | "insert" | "update" | "delete"> = {
    dialect,
    tables: [],
    columns: [],
    where: extractWhere(ast.where as Record<string, unknown> | null),
    groupBy: extractGroupBy(ast.groupby as Array<Record<string, unknown>> | null),
    orderBy: extractOrderBy(ast.orderby as Array<Record<string, unknown>> | null),
    limit: extractLimit(ast.limit as Record<string, unknown> | null),
    rawSQL,
  };

  if (astType === "SELECT") {
    return {
      ...base,
      operation: "SELECT",
      tables: extractTables(ast),
      columns: extractColumns(ast.columns),
    };
  }

  if (astType === "INSERT") {
    const into = ast.into as Record<string, unknown> | undefined;
    const table = (into?.table as string) || (ast.table as string) || "?";
    const cols = (ast.columns as string[]) || [];
    const values = (ast.values as unknown[][]) || [[]];
    return {
      ...base,
      operation: "INSERT",
      tables: [{ name: table }],
      columns: [],
      insert: { table, columns: cols, values },
    };
  }

  if (astType === "UPDATE") {
    const tableExpr = ast.table as Array<Record<string, unknown>> | undefined;
    const tableName = tableExpr?.[0]?.table as string || "?";
    const sets = ast.set as Array<Record<string, unknown>> | undefined;
    const assignments = (sets || []).map((s) => ({
      column: (s.column as string) || "?",
      value: s.value,
    }));
    return {
      ...base,
      operation: "UPDATE",
      tables: [{ name: tableName }],
      columns: [],
      update: { table: tableName, assignments },
    };
  }

  if (astType === "DELETE") {
    const from = ast.from as Array<Record<string, unknown>> | undefined;
    const tableName = from?.[0]?.table as string || "?";
    return {
      ...base,
      operation: "DELETE",
      tables: [{ name: tableName }],
      columns: [],
      delete: { table: tableName },
    };
  }

  // 未知类型，返回 SELECT 默认值
  return { ...base, operation: "SELECT", tables: extractTables(ast), columns: extractColumns(ast.columns) };
}

// ── IR → DAG 转换 ────────────────────────────────────────────────

function irToDAG(ir: IRIntermediate): { nodes: DAGNode[]; edges: DAGEdge[]; analysis: AnalysisWarning[] } {
  const nodes: DAGNode[] = [];
  const edges: DAGEdge[] = [];
  const analysis: AnalysisWarning[] = [];

  // 1. 表节点
  const tableNodeIds = new Map<string, string>();
  for (const table of ir.tables) {
    const id = nextNodeId();
    const nodeType: DAGNode["type"] = "table";
    nodes.push({ id, type: nodeType, label: table.alias ? `${table.name} AS ${table.alias}` : table.name });
    tableNodeIds.set(table.name, id);
  }

  if (ir.operation === "SELECT") {
    // 2. WHERE 节点
    let whereNodeId: string | null = null;
    if (ir.where.length > 0) {
      whereNodeId = nextNodeId();
      nodes.push({ id: whereNodeId, type: "operation", label: "WHERE" });
    }

    // 3. GROUP BY 节点
    let groupByNodeId: string | null = null;
    if (ir.groupBy.length > 0) {
      groupByNodeId = nextNodeId();
      nodes.push({ id: groupByNodeId, type: "operation", label: "GROUP BY" });
    }

    // 4. ORDER BY 节点
    let orderByNodeId: string | null = null;
    if (ir.orderBy.length > 0) {
      orderByNodeId = nextNodeId();
      nodes.push({ id: orderByNodeId, type: "operation", label: "ORDER BY" });
    }

    // 5. LIMIT 节点
    let limitNodeId: string | null = null;
    if (ir.limit !== null) {
      limitNodeId = nextNodeId();
      nodes.push({ id: limitNodeId, type: "operation", label: `LIMIT ${ir.limit}` });
    }

    // 6. 结果节点
    const resultNodeId = nextNodeId();
    nodes.push({ id: resultNodeId, type: "output", label: "Result" });

    // 7. 构建边
    const firstOp = whereNodeId || groupByNodeId || orderByNodeId || limitNodeId || resultNodeId;
    for (const [, tableId] of tableNodeIds) {
      edges.push({ id: nextEdgeId(), source: tableId, target: firstOp });
    }

    const chain = [whereNodeId, groupByNodeId, orderByNodeId, limitNodeId, resultNodeId].filter(Boolean) as string[];
    for (let i = 0; i < chain.length - 1; i++) {
      edges.push({ id: nextEdgeId(), source: chain[i], target: chain[i + 1] });
    }

    // 8. 分析警告
    if (hasSelectStar(ir.columns)) {
      analysis.push({ nodeId: resultNodeId, type: "select_star", message: "使用了 SELECT *，建议明确列出需要的字段" });
    }
    if (ir.limit === null) {
      analysis.push({ nodeId: resultNodeId, type: "missing_limit", message: "未设置 LIMIT，大数据集可能导致性能问题" });
    }
    if (ir.where.length === 0 && ir.tables.length > 0) {
      for (const table of ir.tables) {
        const tid = tableNodeIds.get(table.name);
        if (tid) analysis.push({ nodeId: tid, type: "full_scan", message: `"${table.name}" 无 WHERE 条件，可能全表扫描` });
      }
    }
  } else {
    // 写操作 DAG
    const opLabel = ir.operation === "INSERT" ? "INSERT"
      : ir.operation === "UPDATE" ? "UPDATE" : "DELETE";
    const opNodeId = nextNodeId();
    nodes.push({ id: opNodeId, type: "operation", label: opLabel });

    const resultNodeId = nextNodeId();
    nodes.push({ id: resultNodeId, type: "output", label: "Affected Rows" });

    for (const [, tableId] of tableNodeIds) {
      edges.push({ id: nextEdgeId(), source: tableId, target: opNodeId });
    }
    edges.push({ id: nextEdgeId(), source: opNodeId, target: resultNodeId });

    analysis.push({ nodeId: opNodeId, type: "write_operation", message: `检测到 ${opLabel} 写操作，请确认意图` });

    if (ir.where.length === 0 && ir.operation !== "INSERT") {
      analysis.push({ nodeId: opNodeId, type: "missing_where", message: `${opLabel} 无 WHERE 条件，将影响全表数据！` });
    }
  }

  return { nodes, edges, analysis };
}

// ════════════════════════════════════════════════════════════════
// 对外入口
// ════════════════════════════════════════════════════════════════

export function parseSQLToDAG(sql: string, dialect: IRDialect = "mysql"): ParseResult {
  resetCounters();

  const parser = new Parser();
  let ast: Record<string, unknown>;
  try {
    const result = parser.astify(sql, { database: DIALECT_MAP[dialect] || "MySQL" });
    const raw = Array.isArray(result) ? result[0] : result;
    ast = raw as unknown as Record<string, unknown>;
  } catch {
    return { nodes: [], edges: [], analysis: [] };
  }

  const ir = astToIR(ast, dialect, sql);
  const { nodes, edges, analysis } = irToDAG(ir);

  return { nodes, edges, analysis, ir };
}

export type { IRIntermediate };
