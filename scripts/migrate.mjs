#!/usr/bin/env node
/**
 * Applies SQL migrations from supabase/migrations to DATABASE_URL.
 *   npm run db:migrate
 * Reads DATABASE_URL / DATABASE_SSL from the environment or .env.local.
 */
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
loadEnvFile(".env.local");
loadEnvFile(".env");

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Configure it in .env.local first.");
  process.exit(1);
}

const client = new pg.Client({
  connectionString: url,
  ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined,
});

const dir = path.join(process.cwd(), "supabase", "migrations");
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();

await client.connect();
try {
  await client.query("create table if not exists _chainscope_migrations (name text primary key, applied_at timestamptz not null default now())");
  const done = new Set((await client.query("select name from _chainscope_migrations")).rows.map((r) => r.name));
  for (const f of files) {
    if (done.has(f)) {
      console.log(`• ${f} (already applied)`);
      continue;
    }
    await client.query("begin");
    await client.query(fs.readFileSync(path.join(dir, f), "utf8"));
    await client.query("insert into _chainscope_migrations (name) values ($1)", [f]);
    await client.query("commit");
    console.log(`✓ ${f}`);
  }
} catch (e) {
  await client.query("rollback").catch(() => {});
  console.error("Migration failed:", e.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
