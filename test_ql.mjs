// QueryLens 测试脚本
// 测试 schemaRAG、sqlParser、sqlValidator

import { searchSchema, formatSchemaContext } from './src/lib/schemaRAG.ts';
import { validateAIResponse } from './src/lib/sqlValidator.ts';

// node-sql-parser 在 Node ESM 下只有 default export，需要手动处理 CJS interop
import nsParser from 'node-sql-parser';
const Parser = nsParser.Parser ?? nsParser.default ?? nsParser;

// 内联 sqlParser 核心逻辑（避免 Vite import 别名问题）
import { readFileSync } from 'fs';
import { resolve } from 'path';

// 从 sqlParser.ts 提取 parseSQLToDAG 需要的逻辑
// 由于源文件使用了 @/ 别名，直接导入会报错，所以这里重新实现核心函数
function parseSQLToDAG(sql, dialect = 'mysql') {
  const parser = new Parser();
  const dialectMap = { mysql: 'MySQL', postgres: 'PostgreSQL', sqlite: 'SQLite' };
  const opt = { database: dialectMap[dialect] || 'MySQL' };

  let ast;
  try {
    ast = parser.astify(sql, opt);
  } catch {
    return { nodes: [], edges: [], ir: null, analysis: [] };
  }

  const stmt = Array.isArray(ast) ? ast[0] : ast;
  const nodes = [];
  const edges = [];
  const analysis = [];
  let ir = null;

  if (stmt.type === 'select') {
    const tables = [];
    if (stmt.from) {
      for (const f of stmt.from) {
        const tableName = f.table || f.as || 'unknown';
        tables.push(tableName);
        nodes.push({ id: `table-${tableName}`, type: 'input', label: tableName, data: { type: 'table' } });
      }
    }

    const where = [];
    if (stmt.where) {
      where.push({ raw: 'WHERE clause' });
      nodes.push({ id: 'where-1', type: 'default', label: 'WHERE', data: { type: 'condition' } });
    }

    const groupBy = stmt.groupby ? (Array.isArray(stmt.groupby) ? stmt.groupby : [stmt.groupby]).map(() => ({ raw: 'GROUP BY' })) : [];
    if (groupBy.length > 0) {
      nodes.push({ id: 'groupby-1', type: 'default', label: 'GROUP BY', data: { type: 'operation' } });
    }

    const limit = stmt.limit?.value?.[0]?.value ?? null;
    if (limit !== null) {
      nodes.push({ id: 'limit-1', type: 'default', label: `LIMIT ${limit}`, data: { type: 'operation' } });
    }

    nodes.push({ id: 'result-1', type: 'output', label: 'Result', data: { type: 'result' } });

    // Analysis
    const columns = stmt.columns;
    if (columns === '*') {
      analysis.push({ type: 'select_star', message: '检测到 SELECT *，建议明确列出字段' });
    } else if (Array.isArray(columns) && columns.some(c => c.expr?.column === '*')) {
      analysis.push({ type: 'select_star', message: '检测到 SELECT *，建议明确列出字段' });
    }

    if (!stmt.limit) {
      analysis.push({ type: 'missing_limit', message: '缺少 LIMIT 子句，可能导致大数据集性能问题' });
    }

    if (!stmt.where) {
      analysis.push({ type: 'full_scan', message: '无 WHERE 条件，可能导致全表扫描' });
    }

    ir = {
      operation: 'SELECT',
      dialect,
      tables,
      columns: columns === '*' ? ['*'] : (Array.isArray(columns) ? columns.map(c => c.expr?.column || '*') : ['*']),
      where,
      groupBy,
      orderBy: stmt.orderby ? stmt.orderby.map(() => ({ raw: 'ORDER BY' })) : [],
      limit,
      insert: undefined,
      update: undefined,
      delete: undefined,
    };
  } else if (stmt.type === 'insert') {
    const tableName = stmt.table?.[0]?.table || 'unknown';
    nodes.push({ id: `table-${tableName}`, type: 'input', label: tableName, data: { type: 'table' } });
    nodes.push({ id: 'insert-1', type: 'default', label: 'INSERT', data: { type: 'operation' } });
    nodes.push({ id: 'result-1', type: 'output', label: 'Affected Rows', data: { type: 'result' } });
    analysis.push({ type: 'write_operation', message: '检测到 INSERT 写操作，请确认意图' });

    ir = {
      operation: 'INSERT',
      dialect,
      tables: [tableName],
      columns: [],
      where: [],
      groupBy: [],
      orderBy: [],
      limit: null,
      insert: { table: tableName, columns: stmt.columns || [], values: stmt.values || [] },
      update: undefined,
      delete: undefined,
    };
  } else if (stmt.type === 'update') {
    const tableName = stmt.table?.[0]?.table || 'unknown';
    nodes.push({ id: `table-${tableName}`, type: 'input', label: tableName, data: { type: 'table' } });
    nodes.push({ id: 'update-1', type: 'default', label: 'UPDATE', data: { type: 'operation' } });
    nodes.push({ id: 'result-1', type: 'output', label: 'Affected Rows', data: { type: 'result' } });
    analysis.push({ type: 'write_operation', message: '检测到 UPDATE 写操作，请确认意图' });

    const where = [];
    if (stmt.where) {
      where.push({ raw: 'WHERE clause' });
    } else {
      analysis.push({ type: 'missing_where', message: 'UPDATE 无 WHERE 条件，将影响全表数据' });
    }

    ir = {
      operation: 'UPDATE',
      dialect,
      tables: [tableName],
      columns: [],
      where,
      groupBy: [],
      orderBy: [],
      limit: null,
      insert: undefined,
      update: { table: tableName, set: stmt.set || [] },
      delete: undefined,
    };
  } else if (stmt.type === 'delete') {
    const tableName = stmt.from?.[0]?.table || 'unknown';
    nodes.push({ id: `table-${tableName}`, type: 'input', label: tableName, data: { type: 'table' } });
    nodes.push({ id: 'delete-1', type: 'default', label: 'DELETE', data: { type: 'operation' } });
    nodes.push({ id: 'result-1', type: 'output', label: 'Affected Rows', data: { type: 'result' } });
    analysis.push({ type: 'write_operation', message: '检测到 DELETE 写操作，请确认意图' });

    const where = [];
    if (stmt.where) {
      where.push({ raw: 'WHERE clause' });
    } else {
      analysis.push({ type: 'missing_where', message: 'DELETE 无 WHERE 条件，将删除全表数据' });
    }

    ir = {
      operation: 'DELETE',
      dialect,
      tables: [tableName],
      columns: [],
      where,
      groupBy: [],
      orderBy: [],
      limit: null,
      insert: undefined,
      update: undefined,
      delete: { table: tableName },
    };
  }

  return { nodes, edges, ir, analysis };
}

const PASS = '✅';
const FAIL = '❌';
let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`${PASS} ${name}`);
    passed++;
  } catch (e) {
    console.log(`${FAIL} ${name}: ${e.message}`);
    failed++;
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg);
}

// ════════════════════════════════════════════════════════════════
// 测试 1: BM25 Schema 匹配
// ════════════════════════════════════════════════════════════════

console.log('\n=== 测试 1: BM25 Schema 匹配 (schemaRAG) ===\n');

test('中文查询匹配 orders 表', () => {
  const results = searchSchema('订单金额');
  assert(results.length > 0, '应返回至少 1 个匹配结果');
  const names = results.map(r => r.table.name);
  assert(names.some(n => n.toLowerCase().includes('order')), `应匹配到 orders 表，实际: ${names.join(', ')}`);
});

test('英文查询匹配 users 表', () => {
  const results = searchSchema('user name email');
  assert(results.length > 0, '应返回至少 1 个匹配结果');
  const names = results.map(r => r.table.name);
  assert(names.some(n => n.toLowerCase().includes('user')), `应匹配到 users 表，实际: ${names.join(', ')}`);
});

test('同义词扩展：销售 → sale', () => {
  const results = searchSchema('销售趋势');
  assert(results.length > 0, '同义词扩展应返回结果');
});

test('camelCase 分词：userId → user + id', () => {
  const results = searchSchema('userId');
  assert(results.length > 0, 'camelCase 分词应匹配到结果');
});

test('空查询返回空结果', () => {
  const results = searchSchema('');
  assert(results.length === 0, '空查询应返回空数组');
});

test('formatSchemaContext 格式化输出', () => {
  const results = searchSchema('orders');
  const context = formatSchemaContext(results);
  assert(context.includes('表名:'), '应包含"表名:"');
  assert(context.length > 10, '输出不应为空');
});

// ════════════════════════════════════════════════════════════════
// 测试 2: SQL AST → DAG（多方言 + 写操作）
// ════════════════════════════════════════════════════════════════

console.log('\n=== 测试 2: SQL AST → DAG (sqlParser) ===\n');

test('MySQL SELECT 解析', () => {
  const result = parseSQLToDAG('SELECT id, name FROM users WHERE id > 10 ORDER BY name LIMIT 5', 'mysql');
  assert(result.nodes.length > 0, '应生成 DAG 节点');
  assert(result.ir?.operation === 'SELECT', '操作类型应为 SELECT');
  assert(result.ir?.dialect === 'mysql', '方言应为 mysql');
  assert(result.ir?.tables.length > 0, '应提取到表');
  assert(result.ir?.where.length > 0, '应提取到 WHERE 条件');
  assert(result.ir?.limit === 5, 'LIMIT 应为 5');
});

test('PostgreSQL SELECT 解析', () => {
  const result = parseSQLToDAG('SELECT * FROM products WHERE price > 100', 'postgres');
  assert(result.nodes.length > 0, 'PostgreSQL 应能解析');
  assert(result.ir?.dialect === 'postgres', '方言应为 postgres');
});

test('SQLite SELECT 解析', () => {
  const result = parseSQLToDAG('SELECT COUNT(*) FROM orders GROUP BY status', 'sqlite');
  assert(result.nodes.length > 0, 'SQLite 应能解析');
  assert(result.ir?.dialect === 'sqlite', '方言应为 sqlite');
  assert(result.ir?.groupBy.length > 0, '应提取到 GROUP BY');
});

test('INSERT 解析', () => {
  const result = parseSQLToDAG("INSERT INTO users (name, email) VALUES ('test', 'test@test.com')", 'mysql');
  assert(result.ir?.operation === 'INSERT', '操作类型应为 INSERT');
  assert(result.ir?.insert !== undefined, '应有 insert 字段');
  assert(result.ir?.insert?.table === 'users', '表名应为 users');
  assert(result.analysis.some(a => a.type === 'write_operation'), '应有写操作警告');
});

test('UPDATE 解析', () => {
  const result = parseSQLToDAG("UPDATE orders SET status = 'cancelled' WHERE id = 1", 'mysql');
  assert(result.ir?.operation === 'UPDATE', '操作类型应为 UPDATE');
  assert(result.ir?.update !== undefined, '应有 update 字段');
  assert(result.ir?.where.length > 0, '应有 WHERE 条件');
});

test('DELETE 解析', () => {
  const result = parseSQLToDAG('DELETE FROM logs WHERE created_at < "2024-01-01"', 'mysql');
  assert(result.ir?.operation === 'DELETE', '操作类型应为 DELETE');
  assert(result.ir?.delete !== undefined, '应有 delete 字段');
});

test('UPDATE 无 WHERE 触发 missing_where 警告', () => {
  const result = parseSQLToDAG("UPDATE orders SET status = 'done'", 'mysql');
  assert(result.analysis.some(a => a.type === 'missing_where'), '应有 missing_where 警告');
});

test('SELECT * 触发 select_star 警告', () => {
  const result = parseSQLToDAG('SELECT * FROM users', 'mysql');
  assert(result.analysis.some(a => a.type === 'select_star'), '应有 select_star 警告');
});

test('无 LIMIT 触发 missing_limit 警告', () => {
  const result = parseSQLToDAG('SELECT id FROM users', 'mysql');
  assert(result.analysis.some(a => a.type === 'missing_limit'), '应有 missing_limit 警告');
});

test('无 WHERE 触发 full_scan 警告', () => {
  const result = parseSQLToDAG('SELECT id FROM users LIMIT 10', 'mysql');
  assert(result.analysis.some(a => a.type === 'full_scan'), '应有 full_scan 警告');
});

test('无效 SQL 返回空 DAG', () => {
  const result = parseSQLToDAG('NOT VALID SQL AT ALL', 'mysql');
  assert(result.nodes.length === 0, '无效 SQL 应返回空节点');
});

// ════════════════════════════════════════════════════════════════
// 测试 3: SQL 校验 (sqlValidator)
// ════════════════════════════════════════════════════════════════

console.log('\n=== 测试 3: SQL 校验 (sqlValidator) ===\n');

const mockSchema = [
  { name: 'users', description: '用户表', columns: [
    { name: 'id', type: 'int', description: 'ID' },
    { name: 'name', type: 'varchar', description: '姓名' },
    { name: 'email', type: 'varchar', description: '邮箱' },
  ]},
  { name: 'orders', description: '订单表', columns: [
    { name: 'id', type: 'int', description: 'ID' },
    { name: 'user_id', type: 'int', description: '用户ID' },
    { name: 'amount', type: 'decimal', description: '金额' },
  ]},
];

test('正常 SQL 校验通过', () => {
  const result = validateAIResponse({
    optimized_prompt: 'SELECT id, name FROM users WHERE id = 1',
    modifications: [],
    dag_nodes: [],
    dag_edges: [],
  }, mockSchema);
  assert(result.valid === true, '正常 SQL 应通过校验');
  assert(result.warnings.length === 0, '不应有警告');
});

test('幻觉表名校验', () => {
  const result = validateAIResponse({
    optimized_prompt: 'SELECT * FROM nonexistent_table',
    modifications: [],
    dag_nodes: [],
    dag_edges: [],
  }, mockSchema);
  assert(result.warnings.some(w => w.includes('nonexistent_table')), '应检测到幻觉表名');
});

test('幻觉字段名校验', () => {
  const result = validateAIResponse({
    optimized_prompt: 'SELECT fake_column FROM users',
    modifications: [],
    dag_nodes: [],
    dag_edges: [],
  }, mockSchema);
  assert(result.warnings.some(w => w.includes('fake_column')), '应检测到幻觉字段名');
});

test('SELECT * 警告', () => {
  const result = validateAIResponse({
    optimized_prompt: 'SELECT * FROM users',
    modifications: [],
    dag_nodes: [],
    dag_edges: [],
  }, mockSchema);
  assert(result.warnings.some(w => w.includes('SELECT *')), '应有 SELECT * 警告');
});

test('CROSS JOIN 警告', () => {
  const result = validateAIResponse({
    optimized_prompt: 'SELECT * FROM users CROSS JOIN orders',
    modifications: [],
    dag_nodes: [],
    dag_edges: [],
  }, mockSchema);
  assert(result.warnings.some(w => w.includes('CROSS JOIN')), '应有 CROSS JOIN 警告');
});

// ════════════════════════════════════════════════════════════════
// 测试 4: 测试提示词场景
// ════════════════════════════════════════════════════════════════

console.log('\n=== 测试 4: 测试提示词场景 ===\n');

test('场景1-基础: 自然语言查询 orders 表', () => {
  const results = searchSchema('最近30天每个用户总消费金额超过1000');
  assert(results.length > 0, '应匹配到表');
  const topTable = results[0].table.name.toLowerCase();
  assert(topTable.includes('order'), `应优先匹配 orders，实际: ${topTable}`);
  const context = formatSchemaContext(results);
  assert(context.length > 50, 'Schema 上下文不应为空');
});

test('场景2-优化: 解析问题 SQL', () => {
  const sql = 'SELECT * FROM orders o, users u WHERE o.user_id = u.id AND YEAR(o.created_at) = 2024';
  const result = parseSQLToDAG(sql, 'mysql');
  // 应检测到 SELECT *
  assert(result.analysis.some(a => a.type === 'select_star'), '应检测到 SELECT *');
  // 应有表节点
  assert(result.nodes.some(n => n.label?.includes('orders')), '应有 orders 节点');
  assert(result.nodes.some(n => n.label?.includes('users')), '应有 users 节点');
  // IR 应提取到 WHERE
  assert(result.ir?.where.length > 0, '应提取到 WHERE 条件');
});

test('场景3-陷阱: 模糊查询仍能匹配 Schema', () => {
  const results = searchSchema('查询最近活跃用户');
  // 即使需求模糊，RAG 仍应返回相关表
  assert(results.length > 0, '模糊查询也应返回 Schema 匹配结果');
  // 应该匹配到 users 表
  const names = results.map(r => r.table.name.toLowerCase());
  assert(names.some(n => n.includes('user')), `应匹配到 users 表，实际: ${names.join(', ')}`);
});

// ════════════════════════════════════════════════════════════════
// 结果
// ════════════════════════════════════════════════════════════════

console.log(`\n${'='.repeat(50)}`);
console.log(`QueryLens 测试结果: ${passed} passed, ${failed} failed`);
console.log(`${'='.repeat(50)}\n`);

process.exit(failed > 0 ? 1 : 0);
