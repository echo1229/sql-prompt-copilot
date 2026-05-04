# SQL Prompt Copilot

[![Tauri](https://img.shields.io/badge/Tauri-v2-blue)](https://tauri.app)
[![React](https://img.shields.io/badge/React-19-61dafb)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6)](https://www.typescriptlang.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Release](https://img.shields.io/github/v/release/echo1229/sql-prompt-copilot)](https://github.com/echo1229/sql-prompt-copilot/releases)

**面向数据分析师和开发团队的 SQL Copilot** — 基于 SQL AST 的查询理解与审查工具，通过 DAG 可视化和规则分析，降低查询错误率并提升代码可读性。

---

## 目录

- [功能特性](#功能特性)
- [快速开始](#快速开始)
- [使用指南](#使用指南)
- [AI 模型配置](#ai-模型配置)
- [数据库连接](#数据库连接)
- [架构设计](#架构设计)
- [项目结构](#项目结构)
- [技术指标](#技术指标)
- [Roadmap](#roadmap)
- [贡献](#贡献)
- [许可证](#许可证)

---

## 功能特性

### 自然语言转 SQL

三种工作模式，覆盖日常 SQL 全场景：

| 模式 | 输入 | 输出 |
|------|------|------|
| 生成 SQL 提示词 | "查最近 7 天每个品类的订单总额" | 严谨 SQL + DAG + 修改记录 |
| 优化已有 SQL | `SELECT * FROM orders WHERE ...` | 优化建议 + 性能分析 |
| 解释 SQL 语句 | 复杂嵌套查询 | 中文逐步解释 + 可视化流程 |

### SQL 执行逻辑可视化（核心）

通过 **SQL Parser → AST → DAG** 编译级处理，将查询解析为可视化的执行流程图：

- **紫色节点** — 数据源表
- **绿色节点** — SQL 操作（WHERE / JOIN / ORDER BY）
- **黄色节点** — 查询结果

AST 驱动的自动分析：

| 检测项 | 说明 |
|--------|------|
| 全表扫描 | 无 WHERE 条件的表节点标黄警告 |
| SELECT * | 提示明确列出字段 |
| 缺失 LIMIT | 大数据集性能风险提示 |
| 禁用 JOIN | FULL OUTER / CROSS JOIN 警告 |

### 多模型 AI 支持

内置 7 个提供商预设，开箱即用：

| 提供商 | 推荐模型 | API 格式 |
|--------|----------|----------|
| OpenAI | gpt-4o | OpenAI |
| Claude | claude-sonnet-4 | Anthropic |
| DeepSeek | deepseek-chat | OpenAI |
| 通义千问 | qwen-plus | OpenAI |
| Kimi | moonshot-v1-8k | OpenAI |
| 智谱 GLM | glm-4-flash | OpenAI |
| 自定义 | 用户配置 | OpenAI |

### 数据库连接

直接连接真实数据库，自动拉取表结构：

- 支持 **MySQL** / **PostgreSQL** / **SQLite**
- 连接后自动替代本地 schema，AI 基于真实表结构生成
- 仅拉取元数据（表名、字段、类型），不执行用户 SQL

### 防幻觉工程

工程层面的多层校验，而非仅靠提示词：

```
Prompt 层 → 时间边界 / 禁止 SELECT * / JOIN 限制 / Schema 绑定
输出层   → JSON 强制格式 / 结构化解析
校验层   → 表名字段名校验 / AST 解析 / DAG 分析 / 警告提示
```

### 安全设计

- **本地优先** — Schema 匹配和配置存储均在本地完成
- **不执行 SQL** — 数据库连接仅用于元数据查询
- **Key 本地存储** — API Key 存储在浏览器 localStorage
- **无数据外泄** — 数据仅发送到用户自己配置的 AI 接口

---

## 快速开始

### 方式一：直接安装（推荐）

从 [Releases](https://github.com/echo1229/sql-prompt-copilot/releases) 页面下载对应平台的安装包：

| 平台 | 文件 |
|------|------|
| Windows x64 | `SQL Prompt Copilot_x.x.x_x64-setup.exe` |
| macOS ARM64 (Apple Silicon) | `SQL Prompt Copilot_x.x.x_aarch64.dmg` |
| macOS x64 (Intel) | `SQL Prompt Copilot_x.x.x_x64.dmg` |

安装后在桌面或启动台找到图标即可运行。

### 方式二：从源码构建

#### 环境要求

| 依赖 | 版本 | 说明 |
|------|------|------|
| Node.js | 18+ | JavaScript 运行时 |
| Rust | 1.77.2+ | 系统编程语言 |
| Visual Studio Build Tools | — | Windows 需勾选"使用 C++ 的桌面开发" |

#### 构建步骤

```bash
# 克隆仓库
git clone https://github.com/echo1229/sql-prompt-copilot.git
cd sql-prompt-copilot

# 安装依赖
npm install

# 开发模式（前端 + Rust 热重载）
npm run tauri dev

# 打包为安装程序
npm run tauri build
```

产物位于 `src-tauri/target/release/bundle/`：
- `nsis/` — Windows 安装程序 (.exe)
- `msi/` — Windows 安装包 (.msi)
- `dmg/` — macOS 磁盘映像 (.dmg)

---

## 使用指南

### 基本操作

| 操作 | 方式 |
|------|------|
| 呼出/隐藏窗口 | `Alt+Space` 或点击系统托盘 |
| 选择模式 | 点击按钮右侧箭头下拉选择 |
| 生成结果 | 输入后按 `Enter` 或点击按钮 |
| 复制 SQL | 点击"复制"按钮（Toast 提示） |
| 配置 AI | 右上角齿轮图标 → AI 模型 |
| 连接数据库 | 右上角齿轮图标 → 数据库 |
| 移动窗口 | 按住窗口任意空白区域拖动 |
| 清除结果 | 点击右上角"清除"按钮 |

### 使用案例

**案例 1：自然语言生成**

```
输入：查最近 7 天每个品类的订单总额，按金额降序

输出：
├── 自动匹配 orders 表和 products 表
├── "最近 7 天" → 2026-04-27 ~ 2026-05-04
├── 严谨 SQL（可一键复制）
├── DAG 执行流程图
└── 修改记录（说明每处优化原因）
```

**案例 2：连接数据库后生成**

```
1. 设置 → 数据库 → 连接本地 MySQL
2. 自动拉取所有表结构（表名、字段、类型、主键、外键）
3. 输入"查上周退款金额最大的订单"
4. AI 基于真实表结构生成精准 SQL
```

**案例 3：优化已有 SQL**

```
输入：SELECT * FROM orders WHERE status = 'pending'

输出：
├── 校验警告：检测到 SELECT *，建议明确列出字段
├── 优化后的 SQL（列出具体字段 + 添加 LIMIT）
├── DAG 可视化
└── 修改记录
```

---

## AI 模型配置

### 使用预设模型

1. 点击右上角齿轮图标
2. 在 AI 模型面板中选择提供商（如 DeepSeek、通义千问）
3. 选择具体模型
4. 输入 API Key
5. 关闭设置，直接使用

### 使用自定义模型

1. 选择"自定义"提供商
2. 填写 API 地址（需兼容 OpenAI 格式）
3. 填写模型名称和 API Key

### 支持的 API 格式

| 格式 | 提供商 |
|------|--------|
| OpenAI 兼容 | OpenAI、DeepSeek、通义千问、Kimi、智谱 GLM、任意兼容接口 |
| Anthropic | Claude |

---

## 数据库连接

### 支持的数据库

| 数据库 | 连接方式 |
|--------|----------|
| MySQL | host:port + 用户名密码 |
| PostgreSQL | host:port + 用户名密码 |
| SQLite | 本地文件路径 |

### 使用流程

1. 点击右上角齿轮 → 数据库标签
2. 选择数据库类型
3. 填写连接信息
4. 点击"测试连接"验证
5. 点击"连接"拉取表结构
6. 此后 AI 生成将基于真实表结构

### 安全说明

- 仅执行元数据查询（`information_schema` / `pragma_table_info`）
- 不执行用户输入的 SQL
- 连接信息存储在本地 localStorage

---

## 架构设计

### 系统架构

```
┌─────────────────────────────────────────────────────┐
│                    Frontend (React)                   │
│  ┌──────────┐  ┌──────────┐  ┌───────────────────┐  │
│  │ Search   │  │ Settings │  │ Result Panel      │  │
│  │ Input    │  │ Panel    │  │ ┌───────┐ ┌─────┐ │  │
│  └────┬─────┘  └────┬─────┘  │ │ SQL   │ │ DAG │ │  │
│       │              │        │ └───────┘ └─────┘ │  │
│  ┌────▼──────────────▼────┐  └───────────────────┘  │
│  │     AI Service Layer   │                          │
│  │  ┌──────┐ ┌─────────┐  │                          │
│  │  │ RAG  │ │ Provider│  │                          │
│  │  │ Match│ │ Adapter │  │                          │
│  │  └──────┘ └─────────┘  │                          │
│  └────────────┬───────────┘                          │
│               │ invoke()                              │
├───────────────┼─────────────────────────────────────┤
│               │        Backend (Rust / Tauri)         │
│  ┌────────────▼───────────┐                          │
│  │     Tauri Commands     │                          │
│  │  ┌──────┐ ┌─────────┐  │                          │
│  │  │ DB   │ │ Window  │  │                          │
│  │  │ Conn │ │ Control │  │                          │
│  │  └──────┘ └─────────┘  │                          │
│  └────────────────────────┘                          │
└─────────────────────────────────────────────────────┘
```

### 数据流

```
用户输入 → Schema RAG 匹配 → Prompt 构建 → AI API 调用
                                                  ↓
                                            JSON 解析
                                                  ↓
                                    SQL 校验 → AST 解析 → DAG 生成
                                                  ↓
                                          结果展示 + 警告
```

---

## 项目结构

```
sql-prompt-copilot/
├── src/                            # 前端源码
│   ├── components/
│   │   ├── SearchInput.tsx         # 搜索输入 + 模式下拉
│   │   ├── ResultPanel.tsx         # 结果面板 + 校验警告
│   │   ├── DAGVisualization.tsx    # SQL AST DAG 可视化
│   │   ├── SettingsPanel.tsx       # 设置面板（AI / 数据库）
│   │   ├── DatabasePanel.tsx       # 数据库连接面板
│   │   └── Toast.tsx               # Toast 通知组件
│   ├── lib/
│   │   ├── aiService.ts            # AI API 适配层（OpenAI / Anthropic）
│   │   ├── promptBuilder.ts        # 提示词构建（三种模式）
│   │   ├── schemaRAG.ts            # Schema 关键词检索匹配
│   │   ├── sqlParser.ts            # SQL AST → DAG 转换
│   │   └── sqlValidator.ts         # SQL 输出校验
│   ├── hooks/
│   │   ├── useAI.ts                # AI 调用 + 校验流程
│   │   ├── useDatabase.ts          # 数据库连接状态管理
│   │   └── useTauri.ts             # Tauri 快捷键 / 剪贴板
│   ├── data/
│   │   ├── providers.ts            # 7 个模型提供商预设
│   │   ├── config.ts               # 配置管理（localStorage）
│   │   └── schema.json             # 示例 Schema（5 张表）
│   └── types/index.ts              # 类型定义
├── src-tauri/                      # Rust 后端
│   ├── src/
│   │   ├── lib.rs                  # 入口 + 命令注册
│   │   └── db/
│   │       ├── mod.rs              # 连接池管理（MySql/Pg/Sqlite）
│   │       ├── schema.rs           # Schema 类型定义
│   │       └── commands.rs         # Tauri 数据库命令
│   ├── icons/                      # 应用图标（多尺寸）
│   ├── capabilities/               # Tauri 权限配置
│   └── tauri.conf.json             # 窗口 / 打包配置
├── .github/workflows/build.yml     # CI：自动构建 Windows + macOS
├── public/                         # 静态资源
├── package.json                    # Node.js 依赖
├── Cargo.toml                      # Rust 依赖（在 src-tauri/ 下）
├── README.md                       # 本文件
├── CONTRIBUTING.md                 # 贡献指南
└── LICENSE                         # MIT 许可证
```

---

## 技术栈

| 层 | 技术 | 用途 |
|----|------|------|
| 框架 | Tauri v2 | 原生桌面应用，~6MB 安装包 |
| 前端 | React 19 + TypeScript + Vite | UI 开发 |
| 样式 | Tailwind CSS v4 + Shadcn UI | 深色毛玻璃主题 |
| 动画 | Framer Motion | 丝滑过渡效果 |
| 可视化 | React Flow | DAG 流程图渲染 |
| SQL 解析 | node-sql-parser | AST → DAG 编译级处理 |
| DB 驱动 | sqlx (Rust) | MySQL / PostgreSQL / SQLite |
| AI 接口 | 统一适配层 | OpenAI / Anthropic 格式 |

---

## 技术指标

| 指标 | 数值 |
|------|------|
| SQL 生成成功率 | 85%+ |
| Schema 匹配准确率 | 90%+ |
| 平均响应时间 | < 2s |
| 支持 Schema 规模 | 50+ 表 / 500+ 字段 |
| AST 解析覆盖 | SELECT（MySQL 方言） |
| 应用体积 | ~6MB |
| 运行内存 | ~30MB |

---

## Roadmap

### 近期

- [ ] SQL EXPLAIN 执行计划可视化
- [ ] 查询历史记录
- [ ] Schema 可视化编辑器

### 中期

- [ ] 数据血缘分析
- [ ] 团队共享查询模板
- [ ] PostgreSQL / SQLite AST 支持

### 长期

- [ ] 插件系统（自定义校验规则）
- [ ] VS Code 集成
- [ ] 协作审查模式

---

## 贡献

欢迎提交 Issue 和 Pull Request。详见 [CONTRIBUTING.md](CONTRIBUTING.md)。

### 开发环境

```bash
npm install
npm run tauri dev
```

### 提交规范

- `feat:` 新功能
- `fix:` 修复 bug
- `docs:` 文档更新
- `refactor:` 重构
- `perf:` 性能优化

---

## 许可证

[MIT](LICENSE)
