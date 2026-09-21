import fs from "node:fs";
import path from "node:path";
import initSqlJs, { type Database } from "sql.js";

const ROOT = process.cwd();
export const DB_FILE = path.join(ROOT, "data", "myportfolio.sqlite");

export async function createDatabase(): Promise<Database> {
  const SQL = await initSqlJs({
    locateFile: (file: string) => path.join(ROOT, "node_modules", "sql.js", "dist", file),
  });
  const db = new SQL.Database();
  applySchema(db);
  return db;
}

export function applySchema(db: Database): void {
  const schema = fs.readFileSync(path.join(ROOT, "server", "db", "schema.sql"), "utf8");
  const indexes = fs.readFileSync(path.join(ROOT, "server", "db", "indexes.sql"), "utf8");
  db.run(schema);
  db.run(indexes);
}

export function persist(db: Database): void {
  fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
  fs.writeFileSync(DB_FILE, Buffer.from(db.export()));
}

export type Row = Record<string, unknown>;

export function query(db: Database, sql: string, params: unknown[] = []): Row[] {
  const stmt = db.prepare(sql);
  stmt.bind(params as never);
  const rows: Row[] = [];
  while (stmt.step()) rows.push(stmt.getAsObject() as Row);
  stmt.free();
  return rows;
}

export function run(db: Database, sql: string, params: unknown[] = []): void {
  const stmt = db.prepare(sql);
  stmt.bind(params as never);
  stmt.step();
  stmt.free();
}

export function listTables(db: Database): string[] {
  return query(db, "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").map((row) =>
    String(row.name),
  );
}

export function indexOf(db: Database, table: string): string[] {
  return query(db, "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name=?", [table]).map(
    (row) => String(row.name),
  );
}
