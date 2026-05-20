use super::schema::SchemaTable;
use super::{DbManager, DbPool};
use sqlx::mysql::MySqlConnection;
use sqlx::postgres::PgConnection;
use sqlx::sqlite::SqliteConnection;
use sqlx::{Connection, Row};
use tauri::State;

// ════════════════════════════════════════════════════════════════
// 系统 Keychain 凭据管理
// ════════════════════════════════════════════════════════════════

const KEYRING_SERVICE: &str = "sql-prompt-copilot";

fn keyring_entry(account: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new(KEYRING_SERVICE, account).map_err(|e| format!("Keychain 访问失败: {}", e))
}

#[tauri::command]
pub fn save_credential(account: String, secret: String) -> Result<(), String> {
    let entry = keyring_entry(&account)?;
    entry.set_password(&secret).map_err(|e| format!("保存凭据失败: {}", e))
}

#[tauri::command]
pub fn get_credential(account: String) -> Result<Option<String>, String> {
    let entry = keyring_entry(&account)?;
    match entry.get_password() {
        Ok(pwd) => Ok(Some(pwd)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(format!("读取凭据失败: {}", e)),
    }
}

#[tauri::command]
pub fn delete_credential(account: String) -> Result<(), String> {
    let entry = keyring_entry(&account)?;
    match entry.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()), // 已经不存在也算成功
        Err(e) => Err(format!("删除凭据失败: {}", e)),
    }
}

/// 从 localStorage 迁移密码到 Keychain（前端调用一次后删除 localStorage）
#[tauri::command]
pub fn migrate_credential(account: String, password: String) -> Result<(), String> {
    save_credential(account, password)
}

#[derive(Debug, serde::Deserialize)]
pub enum DbType {
    #[serde(rename = "mysql")]
    MySql,
    #[serde(rename = "postgres")]
    Postgres,
    #[serde(rename = "sqlite")]
    Sqlite,
}

fn build_url(db_type: &DbType, host: &str, port: u16, user: &str, password: &str, database: &str) -> String {
    let encoded_pwd = urlencoding::encode(password);
    let encoded_user = urlencoding::encode(user);
    match db_type {
        DbType::MySql => format!("mysql://{}:{}@{}:{}/{}", encoded_user, encoded_pwd, host, port, database),
        DbType::Postgres => format!("postgres://{}:{}@{}:{}/{}", encoded_user, encoded_pwd, host, port, database),
        DbType::Sqlite => format!("sqlite://{}", database),
    }
}

#[tauri::command]
pub async fn db_test_connection(
    db_type: DbType,
    host: String,
    port: u16,
    user: String,
    password: String,
    database: String,
) -> Result<String, String> {
    let url = build_url(&db_type, &host, port, &user, &password, &database);

    match db_type {
        DbType::MySql => {
            MySqlConnection::connect(&url)
                .await
                .map_err(|e| format!("MySQL 连接失败: {}", e))?;
        }
        DbType::Postgres => {
            PgConnection::connect(&url)
                .await
                .map_err(|e| format!("PostgreSQL 连接失败: {}", e))?;
        }
        DbType::Sqlite => {
            SqliteConnection::connect(&url)
                .await
                .map_err(|e| format!("SQLite 连接失败: {}", e))?;
        }
    }

    Ok("连接成功".to_string())
}

async fn fetch_mysql_schema(pool: &sqlx::MySqlPool) -> Result<Vec<SchemaTable>, String> {
    let rows = sqlx::query(
        "SELECT TABLE_NAME, TABLE_COMMENT FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()"
    )
    .fetch_all(pool)
    .await
    .map_err(|e| format!("查询表信息失败: {}", e))?;

    let mut tables = Vec::new();
    for row in rows {
        let name: String = row.get("TABLE_NAME");
        let comment: String = row.try_get("TABLE_COMMENT").unwrap_or_default();
        let mut table = SchemaTable::new(name.clone(), if comment.is_empty() { name } else { comment });

        let col_rows = sqlx::query(
            "SELECT COLUMN_NAME, COLUMN_TYPE, COLUMN_COMMENT, COLUMN_KEY, COLUMN_KEY = 'PRI' as IS_PK
             FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?"
        )
        .bind(&table.name)
        .fetch_all(pool)
        .await
        .map_err(|e| format!("查询列信息失败: {}", e))?;

        for col in col_rows {
            let col_name: String = col.get("COLUMN_NAME");
            let col_type: String = col.get("COLUMN_TYPE");
            let col_comment: String = col.try_get("COLUMN_COMMENT").unwrap_or_default();
            let is_pk: bool = col.try_get::<bool, _>("IS_PK").unwrap_or(false);

            table.columns.push(super::schema::SchemaColumn {
                name: col_name,
                col_type,
                description: col_comment,
                is_primary_key: is_pk,
                is_foreign_key: false,
                references: None,
            });
        }
        tables.push(table);
    }
    Ok(tables)
}

async fn fetch_pg_schema(pool: &sqlx::PgPool) -> Result<Vec<SchemaTable>, String> {
    let rows = sqlx::query(
        "SELECT table_name, obj_description((quote_ident(table_schema)||'.'||quote_ident(table_name))::regclass, 'pg_class') as table_comment
         FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'"
    )
    .fetch_all(pool)
    .await
    .map_err(|e| format!("查询表信息失败: {}", e))?;

    let mut tables = Vec::new();
    for row in rows {
        let name: String = row.get("table_name");
        let comment: Option<String> = row.try_get("table_comment").ok().flatten();
        let mut table = SchemaTable::new(name.clone(), comment.unwrap_or(name));

        let col_rows = sqlx::query(
            "SELECT c.column_name, c.data_type, pgd.description as column_comment,
                    CASE WHEN pk.column_name IS NOT NULL THEN true ELSE false END as is_pk
             FROM information_schema.columns c
             LEFT JOIN pg_catalog.pg_statio_all_tables st ON c.table_schema = st.schemaname AND c.table_name = st.relname
             LEFT JOIN pg_catalog.pg_description pgd ON pgd.objoid = st.relid AND pgd.objsubid = c.ordinal_position
             LEFT JOIN (
                 SELECT ku.column_name, ku.table_name FROM information_schema.table_constraints tc
                 JOIN information_schema.key_column_usage ku ON tc.constraint_name = ku.constraint_name
                 WHERE tc.constraint_type = 'PRIMARY KEY'
             ) pk ON pk.column_name = c.column_name AND pk.table_name = c.table_name
             WHERE c.table_schema = 'public' AND c.table_name = $1"
        )
        .bind(&table.name)
        .fetch_all(pool)
        .await
        .map_err(|e| format!("查询列信息失败: {}", e))?;

        for col in col_rows {
            let col_name: String = col.get("column_name");
            let col_type: String = col.get("data_type");
            let col_comment: Option<String> = col.try_get("column_comment").ok().flatten();
            let is_pk: bool = col.try_get("is_pk").unwrap_or(false);

            table.columns.push(super::schema::SchemaColumn {
                name: col_name,
                col_type,
                description: col_comment.unwrap_or_default(),
                is_primary_key: is_pk,
                is_foreign_key: false,
                references: None,
            });
        }
        tables.push(table);
    }
    Ok(tables)
}

async fn fetch_sqlite_schema(pool: &sqlx::SqlitePool) -> Result<Vec<SchemaTable>, String> {
    let rows = sqlx::query("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
        .fetch_all(pool)
        .await
        .map_err(|e| format!("查询表信息失败: {}", e))?;

    let mut tables = Vec::new();
    for row in rows {
        let name: String = row.get("name");
        let mut table = SchemaTable::new(name.clone(), name.clone());

        let col_rows = sqlx::query(&format!("PRAGMA table_info('{}')", table.name.replace('\'', "''")))
            .fetch_all(pool)
            .await
            .map_err(|e| format!("查询列信息失败: {}", e))?;

        for col in col_rows {
            let col_name: String = col.get("name");
            let col_type: String = col.get("type");
            let is_pk: bool = col.get("pk");

            table.columns.push(super::schema::SchemaColumn {
                name: col_name,
                col_type,
                description: String::new(),
                is_primary_key: is_pk,
                is_foreign_key: false,
                references: None,
            });
        }
        tables.push(table);
    }
    Ok(tables)
}

#[tauri::command]
pub async fn db_connect(
    manager: State<'_, DbManager>,
    db_type: DbType,
    host: String,
    port: u16,
    user: String,
    password: String,
    database: String,
) -> Result<Vec<SchemaTable>, String> {
    let url = build_url(&db_type, &host, port, &user, &password, &database);

    let tables = match db_type {
        DbType::MySql => {
            let pool = sqlx::MySqlPool::connect(&url)
                .await
                .map_err(|e| format!("MySQL 连接失败: {}", e))?;
            let schema = fetch_mysql_schema(&pool).await;
            let mut guard = manager.pool.lock().map_err(|e| e.to_string())?;
            *guard = Some(DbPool::MySql(pool));
            schema?
        }
        DbType::Postgres => {
            let pool = sqlx::PgPool::connect(&url)
                .await
                .map_err(|e| format!("PostgreSQL 连接失败: {}", e))?;
            let schema = fetch_pg_schema(&pool).await;
            let mut guard = manager.pool.lock().map_err(|e| e.to_string())?;
            *guard = Some(DbPool::Postgres(pool));
            schema?
        }
        DbType::Sqlite => {
            let pool = sqlx::SqlitePool::connect(&url)
                .await
                .map_err(|e| format!("SQLite 连接失败: {}", e))?;
            let schema = fetch_sqlite_schema(&pool).await;
            let mut guard = manager.pool.lock().map_err(|e| e.to_string())?;
            *guard = Some(DbPool::Sqlite(pool));
            schema?
        }
    };

    Ok(tables)
}

#[tauri::command]
pub async fn db_disconnect(manager: State<'_, DbManager>) -> Result<(), String> {
    let pool = {
        let mut guard = manager.pool.lock().map_err(|e| e.to_string())?;
        guard.take()
    };
    if let Some(pool) = pool {
        match pool {
            DbPool::MySql(p) => p.close().await,
            DbPool::Postgres(p) => p.close().await,
            DbPool::Sqlite(p) => p.close().await,
        }
    }
    Ok(())
}
