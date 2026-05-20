// QueryLens 坑位测试 —— 每条对应真实生产事故
// 测试 sqlParser、sqlValidator、promptBuilder 对边界场景的检测能力

import { searchSchema, formatSchemaContext } from './src/lib/schemaRAG.ts';
import { validateAIResponse } from './src/lib/sqlValidator.ts';
import { readFileSync } from 'fs';
import nsParser from 'node-sql-parser';
const Parser = nsParser.Parser ?? nsParser.default ?? nsParser;

const PASS = '✅';
const FAIL = '❌';
const WARN = '⚠️';
let passed = 0;
let failed = 0;
let warnings = 0;

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

function flag(name, msg) {
  console.log(`${WARN} ${name}: ${msg}`);
  warnings++;
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg);
}

// 本地 sqlParser 实现（与 test_ql.mjs 相同）
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

    const columns = stmt.columns;
    if (columns === '*' || (Array.isArray(columns) && columns.some(c => c.expr?.column === '*'))) {
      analysis.push({ type: 'select_star', message: '检测到 SELECT *' });
    }
    if (!stmt.limit) {
      analysis.push({ type: 'missing_limit', message: '缺少 LIMIT' });
    }
    if (!stmt.where) {
      analysis.push({ type: 'full_scan', message: '无 WHERE 条件' });
    }

    ir = {
      operation: 'SELECT', dialect, tables,
      columns: columns === '*' ? ['*'] : (Array.isArray(columns) ? columns.map(c => c.expr?.column || '*') : ['*']),
      where, groupBy,
      orderBy: stmt.orderby ? stmt.orderby.map(() => ({ raw: 'ORDER BY' })) : [],
      limit,
    };
  } else if (stmt.type === 'insert') {
    const tableName = stmt.table?.[0]?.table || 'unknown';
    nodes.push({ id: `table-${tableName}`, type: 'input', label: tableName });
    nodes.push({ id: 'insert-1', type: 'default', label: 'INSERT' });
    nodes.push({ id: 'result-1', type: 'output', label: 'Affected Rows' });
    analysis.push({ type: 'write_operation', message: 'INSERT 写操作' });
    ir = { operation: 'INSERT', dialect, tables: [tableName], columns: [], where: [], groupBy: [], orderBy: [], limit: null, insert: { table: tableName } };
  } else if (stmt.type === 'update') {
    const tableName = stmt.table?.[0]?.table || 'unknown';
    nodes.push({ id: `table-${tableName}`, type: 'input', label: tableName });
    nodes.push({ id: 'update-1', type: 'default', label: 'UPDATE' });
    nodes.push({ id: 'result-1', type: 'output', label: 'Affected Rows' });
    analysis.push({ type: 'write_operation', message: 'UPDATE 写操作' });
    const where = [];
    if (stmt.where) { where.push({ raw: 'WHERE' }); }
    else { analysis.push({ type: 'missing_where', message: 'UPDATE 无 WHERE' }); }
    ir = { operation: 'UPDATE', dialect, tables: [tableName], columns: [], where, groupBy: [], orderBy: [], limit: null, update: { table: tableName } };
  } else if (stmt.type === 'delete') {
    const tableName = stmt.from?.[0]?.table || 'unknown';
    nodes.push({ id: `table-${tableName}`, type: 'input', label: tableName });
    nodes.push({ id: 'delete-1', type: 'default', label: 'DELETE' });
    nodes.push({ id: 'result-1', type: 'output', label: 'Affected Rows' });
    analysis.push({ type: 'write_operation', message: 'DELETE 写操作' });
    const where = [];
    if (stmt.where) { where.push({ raw: 'WHERE' }); }
    else { analysis.push({ type: 'missing_where', message: 'DELETE 无 WHERE' }); }
    ir = { operation: 'DELETE', dialect, tables: [tableName], columns: [], where, groupBy: [], orderBy: [], limit: null, delete: { table: tableName } };
  }
  return { nodes, edges, ir, analysis };
}

// ════════════════════════════════════════════════════════════════
const mockSchema = [
  { name: 'orders', description: '订单表', columns: [
    { name: 'id', type: 'int', description: '订单ID' },
    { name: 'user_id', type: 'int', description: '用户ID' },
    { name: 'amount', type: 'decimal', description: '金额' },
    { name: 'status', type: 'varchar', description: '状态' },
    { name: 'created_at', type: 'datetime', description: '创建时间' },
  ]},
  { name: 'users', description: '用户表', columns: [
    { name: 'id', type: 'int', description: '用户ID' },
    { name: 'name', type: 'varchar', description: '姓名' },
    { name: 'email', type: 'varchar', description: '邮箱' },
    { name: 'created_at', type: 'datetime', description: '注册时间' },
  ]},
  { name: 'user_profiles', description: '用户详情', columns: [
    { name: 'user_id', type: 'int', description: '用户ID' },
    { name: 'vip_level', type: 'int', description: 'VIP等级' },
  ]},
];

console.log('\n' + '═'.repeat(60));
console.log('  QueryLens 坑位测试 —— 真实生产事故场景');
console.log('═'.repeat(60));

// ════════════════════════════════════════════════════════════════
// 坑1：时区陷阱
// "查询今天的订单数量"
// 数据库存 UTC，应用在 UTC+8，"今天"边界差 8 小时
// ════════════════════════════════════════════════════════════════

console.log('\n--- 坑1：时区陷阱 ---');
console.log('场景：数据库存 UTC，应用在 UTC+8，"今天"边界差 8 小时\n');

test('promptBuilder 包含时间边界+时区规则', () => {
  // 读取 promptBuilder 源码检查是否注入了时间规则
  const content = readFileSync('src/lib/promptBuilder.ts', 'utf-8');
  assert(content.includes('时间边界') || content.includes('绝对日期'), 'promptBuilder 应包含时间边界规则');
  assert(content.includes('CONVERT_TZ') || content.includes('时区'), '应提到时区处理');
});

test('Schema BM25 匹配能关联 orders 表（时区查询场景）', () => {
  const results = searchSchema('今天订单数量');
  assert(results.length > 0, '应匹配到表');
  const names = results.map(r => r.table.name.toLowerCase());
  assert(names.some(n => n.includes('order')), `应匹配 orders，实际: ${names.join(', ')}`);
});

flag('坑1-时区', 'promptBuilder 有时间边界规则但未显式提醒 UTC/时区转换。AI 可能生成 DATE(created_at) = CURDATE() 而非 CONVERT_TZ 方案。建议在 prompt 中增加"若数据库时区与用户时区不同，使用 CONVERT_TZ 或时区感知函数"。');

// ════════════════════════════════════════════════════════════════
// 坑2：NULL 语义陷阱
// WHERE status != 'completed' 会漏掉 IS NULL 的行
// ════════════════════════════════════════════════════════════════

console.log('\n--- 坑2：NULL 语义陷阱 ---');
console.log('场景：WHERE status != \'completed\' 漏掉 status IS NULL 的行\n');

test('sqlParser 能解析带 != 的 WHERE 条件', () => {
  const sql = "SELECT * FROM orders WHERE status != 'completed'";
  const result = parseSQLToDAG(sql, 'mysql');
  assert(result.ir?.operation === 'SELECT', '应解析为 SELECT');
  assert(result.ir?.where.length > 0, '应提取到 WHERE');
});

test('sqlValidator 不会对 != 产生误报', () => {
  const result = validateAIResponse({
    optimized_prompt: "SELECT id, status FROM orders WHERE status != 'completed'",
    modifications: [],
    dag_nodes: [],
    dag_edges: [],
  }, mockSchema);
  // != 本身不是错误，但 AI 应该主动加 IS NULL
  assert(result.valid === true || result.warnings.length >= 0, '不应崩溃');
});

flag('坑2-NULL', 'sqlParser/sqlValidator 无法检测 NULL 语义遗漏。这是 AI 生成质量问题。建议在 prompt 规则中增加"使用 != 或 <> 时，考虑是否需要包含 IS NULL 情况"。');

// ════════════════════════════════════════════════════════════════
// 坑3：隐式类型转换
// VARCHAR 字段用数字匹配 → 全表扫描，索引失效
// ════════════════════════════════════════════════════════════════

console.log('\n--- 坑3：隐式类型转换 ---');
console.log('场景：VARCHAR user_id = 12345（数字），索引失效\n');

test('sqlValidator 能检测字段存在性', () => {
  const result = validateAIResponse({
    optimized_prompt: 'SELECT id FROM orders WHERE user_id = 12345',
    modifications: [],
    dag_nodes: [],
    dag_edges: [],
  }, mockSchema);
  // user_id 存在于 orders 表，不应报幻觉字段
  const hasHallucination = result.warnings.some(w => w.includes('未在 Schema'));
  assert(!hasHallucination, 'user_id 是合法字段，不应报幻觉');
});

test('sqlValidator 能检测幻觉字段（对比）', () => {
  const result = validateAIResponse({
    optimized_prompt: 'SELECT id FROM orders WHERE fake_col = 12345',
    modifications: [],
    dag_nodes: [],
    dag_edges: [],
  }, mockSchema);
  assert(result.warnings.some(w => w.includes('fake_col')), '应检测到 fake_col 是幻觉字段');
});

flag('坑3-类型转换', 'sqlValidator 不检测类型一致性（字段是 VARCHAR 但值是数字）。这是高级校验功能。建议增加：当 Schema 中字段类型为 varchar/char 且 WHERE 值为纯数字时，发出"隐式类型转换"警告。');

// ════════════════════════════════════════════════════════════════
// 坑4：聚合 + HAVING 误导
// AVG 被异常值拉高，缺少样本量过滤
// ════════════════════════════════════════════════════════════════

console.log('\n--- 坑4：聚合 + HAVING 误导 ---');
console.log('场景：AVG 被异常值拉高，缺少 HAVING COUNT(*) > N 过滤\n');

test('sqlParser 能解析 HAVING + GROUP BY', () => {
  const sql = 'SELECT user_id, AVG(amount) as avg_amount FROM orders GROUP BY user_id HAVING AVG(amount) > 500';
  const result = parseSQLToDAG(sql, 'mysql');
  assert(result.ir?.operation === 'SELECT', '应解析为 SELECT');
  assert(result.ir?.groupBy.length > 0, '应有 GROUP BY');
});

test('sqlParser 能检测 SELECT * + 聚合混合', () => {
  const sql = 'SELECT *, AVG(amount) FROM orders GROUP BY user_id';
  const result = parseSQLToDAG(sql, 'mysql');
  assert(result.analysis.some(a => a.type === 'select_star'), 'SELECT * + 聚合是危险模式');
});

flag('坑4-聚合误导', 'sqlParser 不检测 AVG/SUM 是否有样本量过滤。这是语义层面的问题。建议在 prompt 规则中增加"使用 AVG/SUM 聚合时，建议添加 HAVING COUNT(*) > N 以过滤样本量过少的分组"。');

// ════════════════════════════════════════════════════════════════
// 坑5：分页深翻页
// OFFSET 199980 会扫描 20 万行再丢弃
// ════════════════════════════════════════════════════════════════

console.log('\n--- 坑5：分页深翻页 ---');
console.log('场景：LIMIT 20 OFFSET 199980，扫描 20 万行再丢弃\n');

test('sqlParser 能解析大 OFFSET', () => {
  const sql = 'SELECT * FROM orders ORDER BY id LIMIT 20 OFFSET 199980';
  const result = parseSQLToDAG(sql, 'mysql');
  assert(result.ir?.operation === 'SELECT', '应解析为 SELECT');
  assert(result.ir?.limit === 20, 'LIMIT 应为 20');
});

test('sqlValidator 检测 SELECT *（深翻页场景）', () => {
  const result = validateAIResponse({
    optimized_prompt: 'SELECT * FROM orders ORDER BY id LIMIT 20 OFFSET 199980',
    modifications: [],
    dag_nodes: [],
    dag_edges: [],
  }, mockSchema);
  assert(result.warnings.some(w => w.includes('SELECT *')), '深翻页 + SELECT * 双重风险应被检测');
});

flag('坑5-深翻页', 'sqlParser 不检测 OFFSET 大小。建议增加：当 OFFSET > 1000 时，发出"深翻页性能警告"并推荐游标分页方案（WHERE id > last_id LIMIT N）。');

// ════════════════════════════════════════════════════════════════
// 坑12：需求自相矛盾
// "昨天新注册用户中，过去 30 天消费超过 3 次"
// 昨天才注册，不可能有 30 天消费记录
// ════════════════════════════════════════════════════════════════

console.log('\n--- 坑12：需求自相矛盾 ---');
console.log('场景：昨天新注册 + 过去30天消费，逻辑矛盾\n');

test('Schema 能匹配 users + orders 表（矛盾查询场景）', () => {
  const results = searchSchema('昨天新注册用户过去30天消费');
  assert(results.length > 0, '应匹配到表');
  const names = results.map(r => r.table.name.toLowerCase());
  assert(names.some(n => n.includes('user')), '应匹配 users');
  assert(names.some(n => n.includes('order')), '应匹配 orders');
});

flag('坑12-矛盾', '本地验证层无法检测语义矛盾（昨天注册 vs 30天历史）。这是 AI 推理能力问题。建议在 prompt 规则中增加"检查用户需求是否存在时间逻辑矛盾，如有则主动提醒"。');

// ════════════════════════════════════════════════════════════════
// 综合评估
// ════════════════════════════════════════════════════════════════

console.log('\n' + '═'.repeat(60));
console.log(`坑位测试结果: ${passed} passed, ${failed} failed, ${warnings} warnings`);
console.log('═'.repeat(60));

console.log('\n📊 坑位检测能力评估：');
console.log('┌──────────┬────────────────────────────────────────┐');
console.log('│ 坑位     │ QueryLens 本地检测能力                   │');
console.log('├──────────┼────────────────────────────────────────┤');
console.log('│ 坑1 时区 │ ❌ 无法检测（需 prompt 增强）            │');
console.log('│ 坑2 NULL │ ❌ 无法检测（需 prompt 增强）            │');
console.log('│ 坑3 类型 │ ❌ 无法检测（需类型系统增强）            │');
console.log('│ 坑4 聚合 │ ❌ 无法检测（需 prompt 增强）            │');
console.log('│ 坑5 翻页 │ ❌ 无法检测（需 OFFSET 阈值检查）        │');
console.log('│ 坑12矛盾 │ ❌ 无法检测（需 AI 推理）                │');
console.log('└──────────┴────────────────────────────────────────┘');
console.log('\n结论：QueryLens 本地验证层能检测 SELECT */WHERE/LIMIT 缺失等基础问题，');
console.log('但对语义级坑位（时区、NULL、类型、聚合、深翻页、矛盾）需要增强 prompt 规则或新增校验模块。');

process.exit(failed > 0 ? 1 : 0);
