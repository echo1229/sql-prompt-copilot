export interface SchemaTable {
  name: string;
  description: string;
  columns: SchemaColumn[];
}

export interface SchemaColumn {
  name: string;
  type: string;
  description: string;
  isPrimaryKey?: boolean;
  isForeignKey?: boolean;
  references?: string;
}

export interface Modification {
  original: string;
  modified: string;
  reason: string;
}

export interface DAGNode {
  id: string;
  type: "table" | "operation" | "output";
  label: string;
  data?: Record<string, unknown>;
}

export interface DAGEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
}

export interface AIResponse {
  optimized_prompt: string;
  modifications: Modification[];
  dag_nodes: DAGNode[];
  dag_edges: DAGEdge[];
}

export type AppState = "idle" | "loading" | "result" | "error";

export type QueryMode = "generate" | "optimize" | "explain";

export type DbDbType = "mysql" | "postgres" | "sqlite";

export interface DbConnectionConfig {
  dbType: DbDbType;
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

export interface DbState {
  connected: boolean;
  schema: SchemaTable[] | null;
  config: DbConnectionConfig | null;
}
