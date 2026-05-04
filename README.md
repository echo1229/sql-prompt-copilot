# SQL Prompt Copilot

[![Tauri](https://img.shields.io/badge/Tauri-v2-blue)](https://tauri.app)
[![React](https://img.shields.io/badge/React-19-61dafb)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6)](https://www.typescriptlang.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

基于 SQL AST 的查询理解与审查工具。将自然语言转换为 SQL，通过 DAG 可视化执行逻辑，降低查询错误率。

---

## 功能

| 功能 | 说明 |
|------|------|
| 自然语言 → SQL | 输入描述，AI 自动生成严谨 SQL |
| SQL 优化 | 粘贴已有 SQL，获得优化建议 |
| SQL 解释 | 复杂查询的中文逐步拆解 |
| DAG 可视化 | SQL AST 解析为执行流程图 |
| 校验警告 | 自动检测全表扫描、SELECT *、缺失 LIMIT 等问题 |
| 多模型支持 | OpenAI / Claude / DeepSeek / 通义千问 / Kimi / 智谱 GLM |
| 数据库连接 | 直连 MySQL / PostgreSQL / SQLite，自动拉取表结构 |

### DAG 可视化

通过 `SQL Parser → AST → DAG` 编译级处理：

- 紫色节点 — 数据源表
- 绿色节点 — SQL 操作（WHERE / JOIN / ORDER BY）
- 黄色节点 — 查询结果

### 防幻觉工程

```
Prompt 层 → 时间边界 / 禁止 SELECT * / JOIN 限制 / Schema 绑定
输出层   → JSON 强制格式 / 结构化解析
校验层   → 表名字段名校验 / AST 解析 / DAG 分析 / 警告提示
```

---

## 快速开始

### 环境要求

| 依赖 | 版本 |
|------|------|
| Node.js | 18+ |
| Rust | 1.77.2+ |
| Visual Studio Build Tools | "使用 C++ 的桌面开发"工作负载 |

### 安装与运行

```bash
git clone https://github.com/your-username/sql-prompt-copilot.git
cd sql-prompt-copilot
npm install
npm run tauri dev
```

### 打包

```bash
npm run tauri build
```

产物位于 `src-tauri/target/release/bundle/`：
- `nsis/` — Windows 安装程序 (.exe)
- `msi/` — Windows 安装包 (.msi)

---

## 使用

| 操作 | 方式 |
|------|------|
| 呼出/隐藏窗口 | `Alt+Space` 或点击系统托盘 |
| 选择模式 | 点击按钮右侧箭头下拉 |
| 生成结果 | 输入后按回车或点击按钮 |
| 复制 SQL | 点击"复制"按钮 |
| 配置 AI | 右上角齿轮 → AI 模型 |
| 连接数据库 | 右上角齿轮 → 数据库 |

---

## 技术栈

| 层 | 技术 | 用途 |
|----|------|------|
| 框架 | Tauri v2 | 原生桌面，~6MB 安装包 |
| 前端 | React 19 + TypeScript + Vite | UI |
| 样式 | Tailwind CSS v4 + Shadcn UI | 深色毛玻璃主题 |
| 动画 | Framer Motion | 过渡效果 |
| 可视化 | React Flow | DAG 流程图 |
| SQL 解析 | node-sql-parser | AST → DAG |
| DB 驱动 | sqlx (Rust) | MySQL / PostgreSQL / SQLite |
| AI 接口 | 统一适配层 | OpenAI / Anthropic 格式 |

---

## 项目结构

```
sql-prompt-copilot/
├── src/                            # 前端源码
│   ├── components/
│   │   ├── SearchInput.tsx         # 搜索 + 模式下拉
│   │   ├── ResultPanel.tsx         # 结果面板 + 校验警告
│   │   ├── DAGVisualization.tsx    # DAG 可视化
│   │   ├── SettingsPanel.tsx       # 设置（AI / 数据库）
│   │   ├── DatabasePanel.tsx       # 数据库连接
│   │   └── Toast.tsx               # Toast 通知
│   ├── lib/
│   │   ├── aiService.ts            # AI API 适配层
│   │   ├── promptBuilder.ts        # 提示词构建
│   │   ├── schemaRAG.ts            # Schema 检索匹配
│   │   ├── sqlParser.ts            # SQL AST → DAG
│   │   └── sqlValidator.ts         # SQL 校验
│   ├── hooks/
│   │   ├── useAI.ts                # AI + 校验流程
│   │   ├── useDatabase.ts          # 数据库连接
│   │   └── useTauri.ts             # Tauri 快捷键 / 剪贴板
│   ├── data/
│   │   ├── providers.ts            # 模型提供商预设
│   │   ├── config.ts               # 配置管理
│   │   └── schema.json             # 示例 Schema
│   └── types/index.ts              # 类型定义
├── src-tauri/                      # Rust 后端
│   ├── src/
│   │   ├── lib.rs                  # 入口 + 命令注册
│   │   └── db/
│   │       ├── mod.rs              # 连接池管理
│   │       ├── schema.rs           # Schema 类型
│   │       └── commands.rs         # 数据库命令
│   ├── icons/                      # 应用图标
│   ├── capabilities/               # Tauri 权限配置
│   └── tauri.conf.json             # 窗口 / 打包配置
└── public/
    └── icon.png                    # 网页图标
```

---

## Roadmap

- [ ] SQL EXPLAIN 执行计划可视化
- [ ] 查询历史记录
- [ ] 数据血缘分析
- [ ] PostgreSQL / SQLite AST 支持
- [ ] 插件系统（自定义校验规则）
- [ ] VS Code 集成

---

## 贡献

欢迎提交 Issue 和 Pull Request。详见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 许可证

[MIT](LICENSE)
