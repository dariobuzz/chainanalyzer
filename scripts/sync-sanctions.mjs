#!/usr/bin/env node
/**
 * Downloads the official OFAC SDN list (CSV) and extracts digital currency
 * addresses into data/sanctions/ofac-sdn.json.
 *
 *   npm run sanctions:sync
 *
 * Sources (U.S. Department of the Treasury, Office of Foreign Assets Control):
 *   SDN.CSV           – primary records (ent_num, name, type, program, …, remarks)
 *   SDN_COMMENTS.CSV  – continuation of remarks that exceed the CSV field length
 */
import fs from "node:fs";
import path from "node:path";

const BASE = "https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports";
const LEGACY = "https://www.treasury.gov/ofac/downloads";
const OUT = path.join(process.cwd(), "data", "sanctions", "ofac-sdn.json");

async function download(file) {
  const urls = [`${BASE}/${file.toUpperCase()}`, `${LEGACY}/${file.toLowerCase()}`];
  for (const url of urls) {
    try {
      const res = await fetch(url, { headers: { "user-agent": "ChainScope sanctions sync" } });
      if (res.ok) {
        console.log(`  ✓ ${url}`);
        return await res.text();
      }
      console.warn(`  ✗ ${url} → HTTP ${res.status}`);
    } catch (e) {
      console.warn(`  ✗ ${url} → ${e.message}`);
    }
  }
  throw new Error(`Unable to download ${file}`);
}

/** RFC-4180-ish CSV parser (quoted fields, escaped quotes, CRLF). */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const clean = (v) => (v ?? "").trim().replace(/^-0-$/, "");

async function main() {
  console.log("Downloading OFAC SDN list…");
  const sdn = parseCsv(await download("sdn.csv"));
  let comments = [];
  try {
    comments = parseCsv(await download("sdn_comments.csv"));
  } catch {
    console.warn("  (comments file unavailable – continuing with main remarks only)");
  }

  const extra = new Map();
  for (const r of comments) if (r[0]) extra.set(r[0].trim(), (extra.get(r[0].trim()) ?? "") + " " + (r[1] ?? ""));

  const entries = [];
  const re = /Digital Currency Address - ([A-Za-z0-9]+)\s+([A-Za-z0-9]+)/g;
  for (const r of sdn) {
    const ent = clean(r[0]);
    if (!ent || !/^\d+$/.test(ent)) continue;
    const remarks = `${r[11] ?? ""} ${extra.get(ent) ?? ""}`;
    for (const m of remarks.matchAll(re)) {
      entries.push({
        address: m[2],
        currency: m[1],
        entity: clean(r[1]),
        program: clean(r[3]).replace(/[\[\]]/g, "").trim(),
        reference: `OFAC SDN entry #${ent}`,
      });
    }
  }

  const dedup = [...new Map(entries.map((e) => [`${e.currency}:${e.address.toLowerCase()}`, e])).values()];
  const out = {
    source: "OFAC Specially Designated Nationals (SDN) List",
    sourceUrl: "https://ofac.treasury.gov/specially-designated-nationals-and-blocked-persons-list-sdn-human-readable-lists",
    fetchedAt: new Date().toISOString(),
    entryCount: dedup.length,
    entries: dedup,
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
  const evm = dedup.filter((e) => /^0x[a-fA-F0-9]{40}$/.test(e.address)).length;
  console.log(`Saved ${dedup.length} digital currency addresses (${evm} EVM) → ${path.relative(process.cwd(), OUT)}`);
}

main().catch((e) => {
  console.error("Sanctions sync failed:", e.message);
  process.exit(1);
});
