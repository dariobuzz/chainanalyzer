# ChainScope – Crypto AML & Wallet Intelligence

ChainScope is a web application for preliminary due diligence on crypto wallets. It is aimed at fiduciaries, compliance officers, law firms, accountants, family offices and wealth managers.

You enter a wallet address and ChainScope produces:

**Wallet Overview → Transaction Analysis → Counterparty Analysis → Fund Flow → Risk Indicators → Risk Score → Compliance Report**

> Risk indicators are decision-support information and do not replace professional AML assessment.

---

## Quick start

Requirements: **Node.js ≥ 20** (22 recommended).

```bash
npm install
cp .env.example .env.local      # DEMO_MODE=true by default
npm run dev                     # http://localhost:3000
```

It runs straight away in **Demo Mode**, with no API keys and no database. Open the home page and pick one of the sample wallets, or type in any Ethereum, Base, BNB Chain, Bitcoin, Tron or Solana address. The network is detected from the address format where it is unambiguous.

**Corporate network / TLS inspection.** If outgoing HTTPS fails with `SELF_SIGNED_CERT_IN_CHAIN`, start the app with `npm run dev:system-ca`, which runs Node with the Windows/macOS certificate store. You need this for live data, Google Fonts and `sanctions:sync`.

### Live blockchain data

```env
DEMO_MODE=false
ETHERSCAN_API_KEY=your_key   # strongly recommended; required for BNB Chain
```

| Chain     | History provider                                   | State (balances, contract detection) |
|-----------|----------------------------------------------------|--------------------------------------|
| Ethereum  | Etherscan API V2 → Blockscout fallback (no key)    | JSON-RPC (publicnode)                |
| Base      | Etherscan API V2 → Blockscout fallback (no key)    | JSON-RPC (mainnet.base.org)          |
| BNB Chain | Etherscan API V2 (key required)                    | JSON-RPC (bnbchain dataseed)         |
| Bitcoin   | Esplora API: mempool.space → Blockstream (no key)  | Esplora (address balance)            |
| Tron      | TronGrid v1 (no key; `TRONGRID_API_KEY` recommended) | TronGrid (TRX + TRC-20 balances)     |
| Solana    | JSON-RPC (`RPC_SOLANA_URL`)                        | JSON-RPC (SOL + SPL balances, program detection) |

The public Blockscout API without a key is heavily rate-limited, especially from shared corporate IPs. For a reliable live demo, configure `ETHERSCAN_API_KEY`.

**Non-EVM chains.**
- **Bitcoin** is UTXO-based. Each transaction is mapped to transfers per counterparty address. Net outflow is own inputs minus change minus the wallet's share of the fee, spread over the external outputs. Received amounts are attributed to the input addresses pro rata. History is fetched in pages of 25, up to `MAX_TRANSACTIONS_BITCOIN`. When it is truncated, the first-activity date is reported as unknown rather than guessed.
- **Tron**: TRX transfers, smart-contract calls and TRC-20 transfers. Only USDT (TRC-20, by contract) is priced. Spoofed look-alike tokens, common on Tron, stay unpriced.
- **Solana**: SOL and SPL token transfers, with token accounts resolved to their owners. Program interactions are counted like EVM contract calls. **The public RPC serves only about 10 transaction lookups per 10 seconds**, so live Solana analyses on it cover just the most recent handful of transactions. Set `RPC_SOLANA_URL` to a dedicated endpoint for real use.
- Every provider stops paging after `HISTORY_TIME_BUDGET_MS` (6 s by default), so an analysis fits within Netlify's 10-second function limit. The report then states that the history was truncated.
- Sanctions screening covers the OFAC SDN addresses listed for each chain: about 130 EVM, 520 Bitcoin, 340 Tron and 3 Solana addresses. The entity registry has **no real labels yet** for Bitcoin, Tron or Solana, so counterparties there show up as "Unknown wallet" unless they are sanctioned.

### Sanctions data (OFAC SDN)

```bash
npm run sanctions:sync
```

This downloads the official OFAC SDN list (`SDN.CSV` + `SDN_COMMENTS.CSV`) from the U.S. Treasury and extracts every "Digital Currency Address", together with the entity, program and SDN entry number. The output goes to `data/sanctions/ofac-sdn.json`. A snapshot is already included. Run the command again regularly, since a sanctions list goes stale.

### PostgreSQL / Supabase (optional)

```env
DATABASE_URL=postgresql://postgres:<password>@db.<project>.supabase.co:5432/postgres
DATABASE_SSL=true
```

```bash
npm run db:migrate     # applies supabase/migrations/*.sql
```

You can also paste `supabase/migrations/0001_init.sql` into the Supabase SQL editor. If `DATABASE_URL` is not set, investigations, reports and the cache are stored as JSON under `data/runtime/`.

---

## Features

| Area | What it does |
|------|--------------|
| **Home** | Hero section, address and chain form, process steps, sample demo wallets |
| **Dashboard** | KPIs (wallets analyzed, open investigations, high-risk reviews, reports), Quick Analyze, recent investigations and activity |
| **Wallet Analysis** `/analysis/[chain]/[address]` | Overview cards, Risk Score gauge with score composition, deterministic Investigation Summary, Source and Destination of Funds, monthly flow chart, interactive Fund Flow graph, Verified Intelligence vs. Behavioral Indicators, counterparty table with drawer, transaction table with filters, search, pagination and drawer, behavioral metrics, data sources and limitations |
| **Report** `/analysis/[chain]/[address]/report?id=…` | Professional compliance report (Report ID, executive summary, risk factors, overview, sources and destinations, counterparties, relevant transactions, fund flow, data sources, methodology, disclaimer). Print / Export PDF through the browser's print engine (A4 print CSS). Each registered report stores an **immutable snapshot** of its analysis |
| **Investigations** | Client reference, internal notes, status (New / Reviewing / Cleared / Escalated). No personal data is required |
| **Reports** | Audit trail of the reports generated |
| **Settings** | Read-only status of providers, intelligence sources, coverage, storage and rate limits. Secrets are never shown |
| **Cache** | Analyses are cached (memory + store) for `ANALYSIS_CACHE_TTL_MINUTES`. The page shows "Analysis updated X minutes ago" and has a **Refresh Analysis** button. Concurrent requests for the same wallet share one fetch |

---

## Risk methodology (CS-RISK-0.1)

Principles:

1. **Explainable.** Every point comes from a `RiskFactor` with `category`, `severity`, `scoreContribution`, `description`, `evidence` and `source`.
2. **No source, no classification.** A category with no reliable dataset shows *"Unknown / No verified intelligence available"* and adds **0** points.
3. **Verified intelligence is kept separate from behavioral indicators.**
4. `riskScore = min(100, Σ contributions)`. A direct OFAC match on the analyzed address sets the score to 100.

| Verified intelligence | Points (base + exposure-scaled, full at ≥ 20% of volume) |
|---|---|
| Sanctioned address (exact OFAC SDN match) | 45 + 25 |
| Ransomware | 35 + 25 |
| Stolen funds / Darknet | 30 + 25 |
| Mixer | 25 + 25 |
| Known scam | 20 + 20 |
| High-risk exchange / Unlicensed service | 12 + 13 |
| Gambling | 6 + 9 |

| Behavioral indicator | Rule |
|---|---|
| Bridge exposure | ≥ 30% volume: 6 · ≥ 10%: 3 · > 0: 1 |
| DEX exposure | ≥ 50% volume: 3 (otherwise informational) |
| High velocity | ≥ 25 tx/active day: 8 · ≥ 10: 4 |
| Recently created wallet | < 30 days: 10 · < 90 days: 5 |
| Unusual pattern | pass-through ≥ 70% forwarded within 24h: 10 (≥ 50%: 5) + ≥ 3 transfers of USD 9,000–9,999: 6 (cap 15) |

Levels: 0–20 Low · 21–40 Low/Moderate · 41–60 Moderate · 61–80 High · 81–100 Very High.

**Confidence** (High / Medium / Low) drops when history is truncated, the sanctions list is not loaded, many assets are unpriced, volume is mostly unidentified, or there is very little activity.

**Investigation Summary.** Fixed templates are filled with measured values. No LLM is involved.

**Pricing.** Tokens are priced only by verified contract address, never by symbol, so spoofed "USDT" airdrops are not valued. MVP limitation: current spot prices are applied to historical transfers.

---

## Architecture

```
src/
├─ app/                              Next.js App Router (pages + API routes)
│  ├─ page.tsx                       Home
│  ├─ dashboard/ investigations/ reports/ settings/
│  ├─ analysis/[chain]/[address]/    Analysis page, loading state, report/
│  └─ api/
│     ├─ analysis/[chain]/[address]  GET  (?refresh=1)
│     ├─ investigations[/id]         GET POST PATCH DELETE
│     ├─ reports                     GET POST
│     ├─ sanctions/check             GET ?address=[&chain=]
│     └─ status                      GET (non-secret config)
├─ services/
│  ├─ blockchain/                    Provider abstraction layer
│  │  ├─ types.ts                    BlockchainProvider / RawWalletData / ExplorerClient
│  │  ├─ chains.ts                   Chain registry (+ planned: Polygon, Arbitrum)
│  │  ├─ ethereum.ts base.ts bsc.ts  Per-chain provider factories
│  │  ├─ evm-adapter.ts              Generic EVM adapter (explorer + RPC)
│  │  ├─ bitcoin.ts                  Bitcoin adapter (Esplora, UTXO → transfers)
│  │  ├─ tron.ts                     Tron adapter (TronGrid, TRX / TRC-20)
│  │  ├─ solana.ts                   Solana adapter (JSON-RPC, SOL / SPL)
│  │  ├─ normalize.ts                Raw → normalized Transfer
│  │  └─ providers/                  etherscan-compatible.ts, rpc.ts, http.ts
│  ├─ intelligence/
│  │  ├─ sanctions.ts                OFAC SDN screening (exact match, with source)
│  │  ├─ entities.ts                 Entity Registry (address, chain, entityName, entityType, source, confidence, lastUpdated)
│  │  ├─ risk.ts                     Risk engine
│  │  └─ data/                       entities.seed.json, demo-intelligence.json (fictitious)
│  ├─ pricing/prices.ts              CoinGecko + verified token table
│  ├─ analysis/                      analyze.ts (pipeline + cache), counterparties, flows, behavior, graph, summary
│  ├─ demo/                          Deterministic synthetic dataset (DemoProvider)
│  └─ reports/                       Report registration (ID + snapshot)
├─ lib/
│  ├─ config.ts                      Server-only env parsing
│  ├─ db/                            Store interface, FileStore, PostgresStore
│  ├─ security/                      rate-limit.ts, errors.ts (safe error handling)
│  ├─ addresses.ts                   Address formats per chain family (canonical form, detection)
│  └─ validation.ts                  zod schemas (chain + address validated together)
├─ components/                       ui/ (shadcn-style), analysis/, report/, investigations/, layout/
└─ types/domain.ts                   Domain model
scripts/  sync-sanctions.mjs · migrate.mjs
supabase/migrations/0001_init.sql    users, wallets, transactions, counterparties, entities, sanctions_entries,
                                     risk_indicators, investigations, reports, analysis_cache, activity_log
```

**Adding a provider or a chain.** Implement `BlockchainProvider.fetchWalletData()` (or a new `ExplorerClient`), then register it in `services/blockchain/index.ts`. Nothing downstream changes. A new chain family also needs its address format in `lib/addresses.ts`. Hex and bech32 addresses are stored lowercase; base58 addresses are case-sensitive and kept as written.

**Multi-hop graph.** `buildFundFlowGraph()` builds a 1-hop graph and keeps node IDs keyed by address, with `maxSupportedDepth`, so 2-hop and 3-hop expansions can be merged into the same graph later.

### Security

- Every provider call runs server-side. API keys are read only in `lib/config.ts` (`server-only`), never with a `NEXT_PUBLIC_` prefix.
- Inputs are validated with zod (chain enum, per-chain address formats, body schemas, UUID IDs).
- Per-IP rate limiting (`RateLimitStore` interface; swap in Redis for multi-instance deployments).
- Errors are sanitized: internal errors return a generic message, and provider URLs and keys are never echoed back.
- Security headers (`nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`).

### Demo Mode

With `DEMO_MODE=true`, every analysis comes from a **deterministic, synthetic dataset**. The same address always gives the same story. The data is labelled **"Demo Data"** in the header banner, the badges, the summary and a watermark on the report. Demo risk entities (a sanctioned entity, a phishing cluster, a casino, an offshore exchange) are **fictitious**, use clearly synthetic addresses, and are never mixed with real intelligence. On Bitcoin, Tron and Solana, the exchanges, DEX, bridges and mixers in demo data are fictitious too. Their addresses use the chain's format but have no valid checksum.

---

## Roadmap

- **Phase 1** ✅ Navigable MVP with demo mode, all analysis sections and report preview
- **Phase 2** ✅ (base) Live ETH, Base and BNB via Etherscan V2 / Blockscout / RPC. Next: historical pricing, deeper pagination
- **Phase 3** ✅ (base) OFAC SDN sync + Entity Registry. Next: more sanctions lists (EU, UK OFSI, UN), registry admin UI, commercial intelligence feeds
- **Phase 4** ✅ (base) Browser PDF export, persisted investigations, report snapshots. Next: server-side PDF, authentication (Supabase Auth) and roles
- **Multichain** ✅ (base) Bitcoin, Tron and Solana: live adapters, OFAC screening, demo data. Next: entity labels for these chains, Bitcoin address clustering, historical pricing
- Later: 2–3 hop graph expansion, Polygon, Arbitrum

---

ChainScope provides blockchain intelligence and decision-support information. Risk indicators do not constitute legal advice, AML certification, or a determination that an individual or entity has engaged in unlawful activity.
