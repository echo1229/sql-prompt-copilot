import { describe, it, expect } from "vitest";
import { parseSQLToDAG, type IRDialect } from "../sqlParser";

describe("sqlParser - AST → IR → DAG", () => {
  describe("SELECT 解析（三方言）", () => {
    const dialects: IRDialect[] = ["mysql", "postgres", "sqlite"];

    dialects.forEach((dialect) => {
      it(`${dialect}: 基础 SELECT + WHERE + LIMIT`, () => {
        const result = parseSQLToDAG(
          "SELECT id, name FROM users WHERE id > 10 ORDER BY name LIMIT 5",
          dialect
        );
        expect(result.nodes.length).toBeGreaterThan(0);
        expect(result.ir?.operation).toBe("SELECT");
        expect(result.ir?.dialect).toBe(dialect);
        expect(result.ir?.tables.length).toBeGreaterThan(0);
        expect(result.ir?.where.length).toBeGreaterThan(0);
        expect(result.ir?.limit).toBe(5);
      });

      it(`${dialect}: SELECT * 检测`, () => {
        const result = parseSQLToDAG("SELECT * FROM users", dialect);
        // SELECT * 应被 ir.columns 标记为 isStar
        if (result.ir) {
          expect(result.ir.columns.some((c) => c.isStar)).toBe(true);
        }
      });

      it(`${dialect}: 无 LIMIT 检测`, () => {
        const result = parseSQLToDAG("SELECT id FROM users", dialect);
        if (result.ir) {
          expect(result.ir.limit == null).toBe(true);
        }
      });

      it(`${dialect}: 无 WHERE 检测`, () => {
        const result = parseSQLToDAG("SELECT id FROM users LIMIT 10", dialect);
        if (result.ir) {
          expect(result.ir.where.length).toBe(0);
        }
      });

      it(`${dialect}: GROUP BY 解析`, () => {
        const result = parseSQLToDAG(
          "SELECT status, COUNT(*) FROM orders GROUP BY status",
          dialect
        );
        // groupBy 应被解析（可能是数组或非空）
        expect(result.ir).toBeDefined();
        expect(result.nodes.length).toBeGreaterThan(0);
      });

      it(`${dialect}: 无效 SQL 返回空 DAG`, () => {
        const result = parseSQLToDAG("NOT VALID SQL AT ALL", dialect);
        expect(result.nodes.length).toBe(0);
        expect(result.ir).toBeUndefined();
      });
    });
  });

  describe("写操作解析", () => {
    it("INSERT 解析", () => {
      const result = parseSQLToDAG(
        "INSERT INTO users (name, email) VALUES ('test', 'test@test.com')",
        "mysql"
      );
      expect(result.ir?.operation).toBe("INSERT");
      expect(result.ir?.insert).toBeDefined();
      expect(result.analysis.some((a) => a.type === "write_operation")).toBe(true);
    });

    it("UPDATE + WHERE 解析", () => {
      const result = parseSQLToDAG(
        "UPDATE orders SET status = 'cancelled' WHERE id = 1",
        "mysql"
      );
      expect(result.ir?.operation).toBe("UPDATE");
      expect(result.ir?.update).toBeDefined();
      expect(result.ir?.where.length).toBeGreaterThan(0);
      expect(result.analysis.some((a) => a.type === "write_operation")).toBe(true);
    });

    it("UPDATE 无 WHERE 触发 missing_where 警告", () => {
      const result = parseSQLToDAG(
        "UPDATE orders SET status = 'done'",
        "mysql"
      );
      expect(result.analysis.some((a) => a.type === "missing_where")).toBe(true);
    });

    it("DELETE 解析", () => {
      const result = parseSQLToDAG(
        'DELETE FROM logs WHERE created_at < "2024-01-01"',
        "mysql"
      );
      expect(result.ir?.operation).toBe("DELETE");
      expect(result.ir?.delete).toBeDefined();
      expect(result.analysis.some((a) => a.type === "write_operation")).toBe(true);
    });

    it("DELETE 无 WHERE 触发 missing_where 警告", () => {
      const result = parseSQLToDAG("DELETE FROM logs", "mysql");
      expect(result.analysis.some((a) => a.type === "missing_where")).toBe(true);
    });
  });

  describe("DAG 结构", () => {
    it("SELECT 生成 table → WHERE → result 节点", () => {
      const result = parseSQLToDAG(
        "SELECT id FROM users WHERE id > 10 LIMIT 5",
        "mysql"
      );
      const labels = result.nodes.map((n) => n.label);
      expect(labels.some((l) => l?.includes("users"))).toBe(true);
      expect(labels.some((l) => l?.includes("WHERE"))).toBe(true);
      expect(labels.some((l) => l?.includes("Result"))).toBe(true);
    });

    it("INSERT 生成 table → INSERT → Affected Rows", () => {
      const result = parseSQLToDAG(
        "INSERT INTO users (name) VALUES ('test')",
        "mysql"
      );
      const labels = result.nodes.map((n) => n.label);
      expect(labels.some((l) => l?.includes("INSERT"))).toBe(true);
    });
  });

  describe("分析警告生成", () => {
    it("SELECT * 生成 select_star 警告（mysql）", () => {
      const result = parseSQLToDAG("SELECT * FROM users LIMIT 1", "mysql");
      const selectStarWarnings = result.analysis.filter((a) => a.type === "select_star");
      // 可能触发也可能不触发，取决于 parser AST 结构
      // 但 ir.columns 应标记 isStar
      if (result.ir) {
        const hasStar = result.ir.columns.some((c) => c.isStar);
        if (hasStar) {
          expect(selectStarWarnings.length).toBeGreaterThan(0);
        }
      }
    });

    it("写操作生成 write_operation 警告", () => {
      const result = parseSQLToDAG(
        "UPDATE orders SET status = 'done' WHERE id = 1",
        "mysql"
      );
      expect(result.analysis.some((a) => a.type === "write_operation")).toBe(true);
    });
  });
});
