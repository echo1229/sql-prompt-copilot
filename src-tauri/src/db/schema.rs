use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SchemaColumn {
    pub name: String,
    #[serde(rename = "type")]
    pub col_type: String,
    pub description: String,
    #[serde(rename = "isPrimaryKey")]
    pub is_primary_key: bool,
    #[serde(rename = "isForeignKey")]
    pub is_foreign_key: bool,
    pub references: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SchemaTable {
    pub name: String,
    pub description: String,
    pub columns: Vec<SchemaColumn>,
}

impl SchemaTable {
    pub fn new(name: String, description: String) -> Self {
        Self {
            name,
            description,
            columns: Vec::new(),
        }
    }
}
