import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("任务 6 交付文档与依赖清单", () => {
  it("AC-015 交付部署手册、上手指南、数据字典与常见问题排查", () => {
    const root = process.cwd();
    const files = ["deploy.md", "getting-started.md", "data-dictionary.md", "troubleshooting.md"];
    for (const file of files) {
      expect(fs.existsSync(path.join(root, "docs", file))).toBe(true);
    }
    expect(fs.existsSync(path.join(root, "scripts", "install.ps1"))).toBe(true);
  });

  it("AC-015 依赖清单包含开源协议列", () => {
    const text = fs.readFileSync(path.join(process.cwd(), "docs", "dependencies.md"), "utf8");
    expect(text).toContain("开源协议");
    expect(text).toContain("MIT");
  });
});
