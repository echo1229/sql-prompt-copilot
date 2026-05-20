import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { SchemaTable, DbConnectionConfig, DbState } from "@/types";
import { saveCredential, getCredential, dbAccountKey } from "@/lib/credentialService";

const DB_CONFIG_KEY = "sql-copilot-db-config";

/** 从 localStorage 读取配置（不含密码） */
function loadSavedConfig(): DbConnectionConfig | null {
  try {
    const saved = localStorage.getItem(DB_CONFIG_KEY);
    if (saved) return JSON.parse(saved) as DbConnectionConfig;
  } catch { /* ignore */ }
  return null;
}

export function useDatabase() {
  const [state, setState] = useState<DbState>(() => {
    const config = loadSavedConfig();
    return { connected: false, schema: null, config };
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

      // 密码存 Keychain，localStorage 只存非敏感配置
      const account = dbAccountKey(config.host, config.port, config.database);
      await saveCredential(account, config.password);

      const { password: _, ...safeConfig } = config;
      localStorage.setItem(DB_CONFIG_KEY, JSON.stringify(safeConfig));

      setState({ connected: true, schema, config: safeConfig as DbConnectionConfig });
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
      const { password: _, ...safeConfig } = config;
      localStorage.setItem(DB_CONFIG_KEY, JSON.stringify(safeConfig));
    }
    setState((s) => ({ ...s, config }));
  }, []);

  /**
   * 从 Keychain 恢复密码（用于重连场景）
   */
  const resolvePassword = useCallback(async (config: DbConnectionConfig): Promise<string> => {
    const account = dbAccountKey(config.host, config.port, config.database);
    const pwd = await getCredential(account);
    if (!pwd) throw new Error("未找到保存的密码，请重新连接数据库");
    return pwd;
  }, []);

  return { ...state, loading, error, testConnection, connect, disconnect, setConfig, resolvePassword };
}
