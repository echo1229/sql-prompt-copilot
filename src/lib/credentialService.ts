import { invoke } from "@tauri-apps/api/core";

const MIGRATION_KEY = "sql-copilot-keyring-migrated";

/**
 * 保存凭据到系统 Keychain（macOS Keychain / Windows Credential Manager / Linux Secret Service）
 */
export async function saveCredential(account: string, secret: string): Promise<void> {
  await invoke("save_credential", { account, secret });
}

/**
 * 从系统 Keychain 读取凭据
 */
export async function getCredential(account: string): Promise<string | null> {
  return await invoke<string | null>("get_credential", { account });
}

/**
 * 从系统 Keychain 删除凭据
 */
export async function deleteCredential(account: string): Promise<void> {
  await invoke("delete_credential", { account });
}

/**
 * 将 localStorage 中的旧密码迁移到 Keychain（仅执行一次）
 */
export async function migratePasswordIfNeeded(): Promise<void> {
  if (localStorage.getItem(MIGRATION_KEY) === "done") return;

  try {
    const raw = localStorage.getItem("sql-copilot-db-config");
    if (!raw) return;

    const config = JSON.parse(raw);
    if (config?.password) {
      const account = `db-${config.host}-${config.port}-${config.database}`;
      await saveCredential(account, config.password);
      // 迁移成功，清除 localStorage 中的密码
      delete config.password;
      localStorage.setItem("sql-copilot-db-config", JSON.stringify(config));
    }
  } catch {
    // 迁移失败不阻塞启动
  }

  localStorage.setItem(MIGRATION_KEY, "done");
}

/**
 * 生成数据库连接对应的 Keychain account 名
 */
export function dbAccountKey(host: string, port: number, database: string): string {
  return `db-${host}-${port}-${database}`;
}
