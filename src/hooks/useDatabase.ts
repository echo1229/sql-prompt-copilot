import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { SchemaTable, DbConnectionConfig, DbState } from "@/types";

const DB_CONFIG_KEY = "sql-copilot-db-config";

export function useDatabase() {
  const [state, setState] = useState<DbState>(() => {
    try {
      const saved = localStorage.getItem(DB_CONFIG_KEY);
      if (saved) {
        const config = JSON.parse(saved) as DbConnectionConfig;
        return { connected: false, schema: null, config };
      }
    } catch { /* ignore */ }
    return { connected: false, schema: null, config: null };
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const testConnection = useCallback(async (config: DbConnectionConfig): Promise<string> => {
    return await invoke<string>("db_test_connection", {
      dbType: config.dbType,
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      database: config.database,
    });
  }, []);

  const connect = useCallback(async (config: DbConnectionConfig) => {
    setLoading(true);
    setError(null);
    try {
      const schema = await invoke<SchemaTable[]>("db_connect", {
        dbType: config.dbType,
        host: config.host,
        port: config.port,
        user: config.user,
        password: config.password,
        database: config.database,
      });
      setState({ connected: true, schema, config });
      localStorage.setItem(DB_CONFIG_KEY, JSON.stringify(config));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setState((s) => ({ ...s, connected: false }));
    } finally {
      setLoading(false);
    }
  }, []);

  const disconnect = useCallback(async () => {
    try {
      await invoke("db_disconnect");
    } catch { /* ignore */ }
    setState((s) => ({ ...s, connected: false, schema: null }));
  }, []);

  const setConfig = useCallback((config: DbConnectionConfig | null) => {
    if (config) {
      localStorage.setItem(DB_CONFIG_KEY, JSON.stringify(config));
    }
    setState((s) => ({ ...s, config }));
  }, []);

  return { ...state, loading, error, testConnection, connect, disconnect, setConfig };
}
