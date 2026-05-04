pub mod commands;
pub mod schema;

use sqlx::mysql::MySqlPool;
use sqlx::postgres::PgPool;
use sqlx::sqlite::SqlitePool;
use std::sync::Mutex;

pub enum DbPool {
    MySql(MySqlPool),
    Postgres(PgPool),
    Sqlite(SqlitePool),
}

pub struct DbManager {
    pub pool: Mutex<Option<DbPool>>,
}

impl DbManager {
    pub fn new() -> Self {
        Self {
            pool: Mutex::new(None),
        }
    }
}
