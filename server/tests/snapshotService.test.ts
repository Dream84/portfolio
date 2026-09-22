import { beforeEach, describe, expect, it } from "vitest";
import type { Database } from "sql.js";
import { createDatabase } from "../db/database.ts";
import { expectedSnapshotDates, seedAll } from "../seed.ts";
import { findMissingDates, generateSnapshot, listSnapshots, regenerateSnapshots } from "../services/snapshotService.ts";

let db: Database;

beforeEach(async () => {
  db = await createDatabase();
  seedAll(db);
});

describe("任务 10 每日快照", () => {
  it("AC-057 同日期重复生成应只保留一条快照", () => {
    generateSnapshot(db, { accountId: "family", date: "2026-09-21" });
    generateSnapshot(db, { accountId: "family", date: "2026-09-21" });
    const rows = listSnapshots(db, "family").filter((row) => row.snapshotDate === "2026-09-21");
    expect(rows).toHaveLength(1);
    expect(rows[0].totalValue).toBeCloseTo(220057.2, 2);
  });

  it("AC-058 应能识别缺失日期并重新生成", () => {
    const withMissing = [...expectedSnapshotDates(), "2026-09-19"];
    const missing = findMissingDates(db, "family", withMissing);
    expect(missing).toEqual(["2026-09-19"]);

    const result = regenerateSnapshots(db, { accountId: "family", dates: missing });
    expect(result.ok).toBe(true);
    expect(result.regenerated).toEqual(["2026-09-19"]);
    expect(findMissingDates(db, "family", withMissing)).toEqual([]);
  });

  it("INV-4 快照以当前估值为准且日期格式非法时拒绝生成", () => {
    const bad = generateSnapshot(db, { accountId: "family", date: "2026/09/21" });
    expect(bad.ok).toBe(false);
    expect(bad.message).toContain("快照日期格式非法");
  });
});
