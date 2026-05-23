import { describe, it, expect } from "vitest";
import { searchSchema, formatSchemaContext } from "../schemaRAG";

describe("schemaRAG - BM25 语义匹配", () => {
  describe("基础匹配", () => {
    it("中文查询匹配 orders 表", () => {
      const results = searchSchema("订单金额");
      expect(results.length).toBeGreaterThan(0);
      const names = results.map((r) => r.table.name.toLowerCase());
      expect(names.some((n) => n.includes("order"))).toBe(true);
    });

    it("英文查询匹配 users 表", () => {
      const results = searchSchema("user name email");
      expect(results.length).toBeGreaterThan(0);
      const names = results.map((r) => r.table.name.toLowerCase());
      expect(names.some((n) => n.includes("user"))).toBe(true);
    });

    it("空查询返回空结果", () => {
      const results = searchSchema("");
      expect(results.length).toBe(0);
    });

    it("无关查询返回低分或空", () => {
      const results = searchSchema("量子力学薛定谔方程");
      // 可能返回结果但分数应很低
      results.forEach((r) => {
        expect(r.score).toBeLessThan(5);
      });
    });
  });

  describe("分词能力", () => {
    it("camelCase 分词：userId → user + id", () => {
      const results = searchSchema("userId");
      expect(results.length).toBeGreaterThan(0);
    });

    it("snake_case 分词：user_id → user + id", () => {
      const results = searchSchema("user_id");
      expect(results.length).toBeGreaterThan(0);
    });

    it("中文逐字拆分：用户表 → 用/户/表", () => {
      const results = searchSchema("用户表");
      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe("同义词扩展", () => {
    it("销售 → sale", () => {
      const results = searchSchema("销售趋势");
      expect(results.length).toBeGreaterThan(0);
    });

    it("用户 → user", () => {
      const results = searchSchema("用户信息");
      expect(results.length).toBeGreaterThan(0);
      const names = results.map((r) => r.table.name.toLowerCase());
      expect(names.some((n) => n.includes("user"))).toBe(true);
    });

    it("订单 → order", () => {
      const results = searchSchema("订单详情");
      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe("formatSchemaContext", () => {
    it("格式化输出包含表名", () => {
      const results = searchSchema("orders");
      const context = formatSchemaContext(results);
      expect(context).toContain("表名:");
      expect(context.length).toBeGreaterThan(10);
    });

    it("空结果返回 fallback 提示", () => {
      const context = formatSchemaContext([]);
      expect(context.length).toBeGreaterThan(0);
      expect(context).toContain("未匹配");
    });
  });

  describe("真实场景", () => {
    it("自然语言查询匹配 orders 表", () => {
      const results = searchSchema("最近30天每个用户总消费金额超过1000");
      expect(results.length).toBeGreaterThan(0);
      const topTable = results[0].table.name.toLowerCase();
      expect(topTable.includes("order")).toBe(true);
    });

    it("模糊查询仍能匹配 Schema", () => {
      const results = searchSchema("查询最近活跃用户");
      expect(results.length).toBeGreaterThan(0);
      const names = results.map((r) => r.table.name.toLowerCase());
      expect(names.some((n) => n.includes("user"))).toBe(true);
    });
  });
});
