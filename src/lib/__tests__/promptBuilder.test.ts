import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

describe("promptBuilder - 提示词规则验证", () => {
  const sourcePath = resolve(__dirname, "../promptBuilder.ts");
  const source = readFileSync(sourcePath, "utf-8");

  describe("10 条严格规则完整性", () => {
    it("规则1: 时间边界 + 时区处理", () => {
      expect(source).toContain("时间边界");
      expect(source).toContain("CONVERT_TZ");
    });

    it("规则2: 禁止 SELECT *", () => {
      expect(source).toContain("禁止 SELECT *");
    });

    it("规则3: JOIN 限制", () => {
      expect(source).toContain("INNER JOIN");
      expect(source).toContain("LEFT JOIN");
      expect(source).toContain("禁止 FULL OUTER");
    });

    it("规则4: 基于 Schema", () => {
      expect(source).toContain("基于 Schema");
      expect(source).toContain("不得臆造");
    });

    it("规则5: NULL 安全", () => {
      expect(source).toContain("NULL");
      expect(source).toContain("IS NULL");
    });

    it("规则6: 类型一致", () => {
      expect(source).toContain("类型一致");
    });

    it("规则7: 聚合样本量", () => {
      expect(source).toContain("HAVING COUNT");
    });

    it("规则8: 深翻页防护", () => {
      expect(source).toContain("OFFSET");
      expect(source).toContain("游标分页");
    });

    it("规则9: 逻辑矛盾检测", () => {
      expect(source).toContain("逻辑矛盾");
    });

    it("规则10: 输出格式", () => {
      expect(source).toContain("JSON");
    });
  });

  describe("模式指令", () => {
    it("包含 generate 模式", () => {
      expect(source).toContain("generate");
    });

    it("包含 optimize 模式", () => {
      expect(source).toContain("optimize");
    });

    it("包含 explain 模式", () => {
      expect(source).toContain("explain");
    });
  });
});
