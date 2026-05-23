import { describe, it, expect } from "vitest";
import { validateAIResponse } from "../sqlValidator";
import type { SchemaTable } from "@/types";

const mockSchema: SchemaTable[] = [
  {
    name: "users",
    description: "用户表",
    columns: [
      { name: "id", type: "int", description: "ID" },
      { name: "name", type: "varchar", description: "姓名" },
      { name: "email", type: "varchar", description: "邮箱" },
    ],
  },
  {
    name: "orders",
    description: "订单表",
    columns: [
      { name: "id", type: "int", description: "ID" },
      { name: "user_id", type: "int", description: "用户ID" },
      { name: "amount", type: "decimal", description: "金额" },
      { name: "status", type: "varchar", description: "状态" },
    ],
  },
];

function makeResponse(sql: string) {
  return {
    optimized_prompt: sql,
    modifications: [],
    dag_nodes: [],
    dag_edges: [],
  };
}

describe("sqlValidator - SQL 输出校验", () => {
  describe("基础校验", () => {
    it("正常 SQL + 匹配 Schema → valid", () => {
      const result = validateAIResponse(
        makeResponse("SELECT id, name FROM users WHERE id = 1"),
        mockSchema
      );
      expect(result.valid).toBe(true);
      expect(result.warnings.length).toBe(0);
    });

    it("schema=null 跳过校验", () => {
      const result = validateAIResponse(
        makeResponse("SELECT * FROM nonexistent"),
        null
      );
      expect(result.valid).toBe(true);
      expect(result.warnings.length).toBe(0);
    });

    it("空 schema 数组跳过校验", () => {
      const result = validateAIResponse(
        makeResponse("SELECT * FROM nonexistent"),
        []
      );
      expect(result.valid).toBe(true);
    });
  });

  describe("幻觉检测", () => {
    it("幻觉表名", () => {
      const result = validateAIResponse(
        makeResponse("SELECT * FROM nonexistent_table"),
        mockSchema
      );
      expect(result.warnings.some((w) => w.includes("nonexistent_table"))).toBe(true);
    });

    it("SELECT 列幻觉字段", () => {
      const result = validateAIResponse(
        makeResponse("SELECT fake_column FROM users"),
        mockSchema
      );
      expect(result.warnings.some((w) => w.includes("fake_column"))).toBe(true);
    });

    it("WHERE 列幻觉字段", () => {
      const result = validateAIResponse(
        makeResponse("SELECT id FROM orders WHERE fake_col = 12345"),
        mockSchema
      );
      expect(result.warnings.some((w) => w.includes("fake_col"))).toBe(true);
    });

    it("合法字段不误报", () => {
      const result = validateAIResponse(
        makeResponse("SELECT id, name FROM users WHERE email = 'test'"),
        mockSchema
      );
      const hallucinations = result.warnings.filter((w) => w.includes("未在 Schema"));
      expect(hallucinations.length).toBe(0);
    });

    it("聚合函数不误报为幻觉", () => {
      const result = validateAIResponse(
        makeResponse("SELECT COUNT(*), SUM(amount), AVG(amount) FROM orders"),
        mockSchema
      );
      const hallucinations = result.warnings.filter((w) => w.includes("COUNT") || w.includes("SUM") || w.includes("AVG"));
      expect(hallucinations.length).toBe(0);
    });
  });

  describe("SQL 模式检测", () => {
    it("SELECT * 警告", () => {
      const result = validateAIResponse(
        makeResponse("SELECT * FROM users"),
        mockSchema
      );
      expect(result.warnings.some((w) => w.includes("SELECT *"))).toBe(true);
    });

    it("CROSS JOIN 警告", () => {
      const result = validateAIResponse(
        makeResponse("SELECT * FROM users CROSS JOIN orders"),
        mockSchema
      );
      expect(result.warnings.some((w) => w.includes("CROSS JOIN"))).toBe(true);
    });

    it("FULL OUTER JOIN 警告", () => {
      const result = validateAIResponse(
        makeResponse("SELECT * FROM users FULL OUTER JOIN orders ON users.id = orders.user_id"),
        mockSchema
      );
      expect(result.warnings.some((w) => w.includes("FULL OUTER"))).toBe(true);
    });
  });
});
