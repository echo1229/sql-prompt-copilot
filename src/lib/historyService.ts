import Database from "@tauri-apps/plugin-sql";

const DB_NAME = "sqlite:history.db";

let _db: Database | null = null;

async function getDB(): Promise<Database> {
  if (_db) return _db;
  _db = await Database.load(DB_NAME);
  await _db.execute(`
    CREATE TABLE IF NOT EXISTS query_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sql_text TEXT NOT NULL,
      connection_name TEXT NOT NULL DEFAULT '',
      mode TEXT NOT NULL DEFAULT 'generate',
      status TEXT NOT NULL DEFAULT 'success',
      duration_ms INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      is_favorite INTEGER NOT NULL DEFAULT 0,
      tags TEXT NOT NULL DEFAULT '[]'
    )
  `);
  await _db.execute(`CREATE INDEX IF NOT EXISTS idx_history_created ON query_history(created_at DESC)`);
  await _db.execute(`CREATE INDEX IF NOT EXISTS idx_history_favorite ON query_history(is_favorite) WHERE is_favorite = 1`);
  return _db;
}

export interface QueryHistoryRecord {
  id: number;
  sql_text: string;
  connection_name: string;
  mode: string;
  status: string;
  duration_ms: number | null;
  created_at: string;
  is_favorite: boolean;
  tags: string[];
}

function rowToRecord(row: Record<string, unknown>): QueryHistoryRecord {
  return {
    id: row.id as number,
    sql_text: row.sql_text as string,
    connection_name: row.connection_name as string,
    mode: row.mode as string,
    status: row.status as string,
    duration_ms: row.duration_ms as number | null,
    created_at: row.created_at as string,
    is_favorite: (row.is_favorite as number) === 1,
    tags: JSON.parse((row.tags as string) || "[]"),
  };
}

export async function addHistory(record: {
  sql_text: string;
  connection_name?: string;
  mode?: string;
  status?: string;
  duration_ms?: number;
}): Promise<number> {
  const db = await getDB();
  const result = await db.execute(
    `INSERT INTO query_history (sql_text, connection_name, mode, status, duration_ms) VALUES ($1, $2, $3, $4, $5)`,
    [record.sql_text, record.connection_name || "", record.mode || "generate", record.status || "success", record.duration_ms ?? null]
  );
  return result.lastInsertId;
}

export async function getHistory(options?: {
  limit?: number;
  offset?: number;
  search?: string;
  favoritesOnly?: boolean;
  connectionName?: string;
}): Promise<QueryHistoryRecord[]> {
  const db = await getDB();
  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIdx = 1;

  if (options?.search) {
    conditions.push(`(sql_text LIKE $${paramIdx} OR connection_name LIKE $${paramIdx})`);
    params.push(`%${options.search}%`);
    paramIdx++;
  }
  if (options?.favoritesOnly) {
    conditions.push(`is_favorite = 1`);
  }
  if (options?.connectionName) {
    conditions.push(`connection_name = $${paramIdx}`);
    params.push(options.connectionName);
    paramIdx++;
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = options?.limit ?? 50;
  const offset = options?.offset ?? 0;

  const rows = await db.select(
    `SELECT * FROM query_history ${where} ORDER BY created_at DESC LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
    [...params, limit, offset]
  );

  return (rows as Record<string, unknown>[]).map(rowToRecord);
}

export async function toggleFavorite(id: number): Promise<boolean> {
  const db = await getDB();
  await db.execute(`UPDATE query_history SET is_favorite = 1 - is_favorite WHERE id = $1`, [id]);
  const rows = await db.select(`SELECT is_favorite FROM query_history WHERE id = $1`, [id]);
  return (rows[0] as Record<string, unknown>)?.is_favorite === 1;
}

export async function deleteHistory(id: number): Promise<void> {
  const db = await getDB();
  await db.execute(`DELETE FROM query_history WHERE id = $1`, [id]);
}

export async function clearHistory(keepFavorites: boolean = true): Promise<void> {
  const db = await getDB();
  if (keepFavorites) {
    await db.execute(`DELETE FROM query_history WHERE is_favorite = 0`);
  } else {
    await db.execute(`DELETE FROM query_history`);
  }
}
