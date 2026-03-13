# Gigaverse Agent Skill

Language / 语言： **English (this file)** | **[中文 → README_CN.md](./README_CN.md)**

## Upstream / Attribution
- Derived from (conceptually a fork of) **https://github.com/Gigaverse-Games/play**.
- This repository is published as a **distribution/hardening** line: reliability, recovery, observability, and safe defaults for automation.

---

## Installation

Only two supported installation paths:

### Method A: Send the repo URL to your Agent and let it learn
Give your OpenClaw / coding agent the repository URL directly and ask it to read and learn the skill (best for "understand first, then modify").

### Method B: Manual install into your OpenClaw workspace (recommended for actual execution)

```bash
# 1) Go to your OpenClaw workspace root
cd <YOUR_OPENCLAW_WORKSPACE>

# 2) Clone into skills/ (keep the directory name as gigaverse)
mkdir -p skills
cd skills

git clone <YOUR_REPO_URL> gigaverse

# 3) Install runner dependencies
cd gigaverse/scripts
npm ci
```

---

## 1. What this is
This is an OpenClaw skill for **Gigaverse (Abstract chain)** automation, built for **reliability, recovery, and observability**:
- Start/resume dungeon runs (Underhaul / Dungetron: 5000)
- Enforce non-skippable, fixed-order **pre-run gates**
- Make combat decisions with **charge-aware** constraints
- Recover from common server inconsistencies (**actionToken 400 recovery**)
- Emit a structured **end-of-run JSON battle report** to drive iterative strategy improvements

Primary execution entrypoint:
- `./scripts/run-dungeon.ts`

Canonical “must-follow” procedure documents:
- `./references/pre-run-checklist.md`
- `./references/pre-run-gates.md`
- `./references/runbook.md`

---

## 2. Security boundaries (must read)
### 2.1 Files that must never be committed
This repo is designed so **user identity and secrets never enter git**:
- `skills/gigaverse/credentials/jwt.txt` (standalone clone uses `./credentials/jwt.txt`)
- `skills/gigaverse/credentials/address.txt` (standalone clone uses `./credentials/address.txt`)
- anything under `~/.secrets/*` (especially private keys/JWT/address)

This distribution includes:
- `.gitignore` (ignores `credentials/jwt.txt` / `credentials/address.txt`)
- `./publish-check.sh` (one-shot publish-time audit)

### 2.2 Private key & onchain writes
Some scripts may produce onchain transactions (e.g. juice purchase).
- Default private key file: `~/.secrets/gigaverse-private-key.txt`
- Optional override: env `NOOB_PRIVATE_KEY`
- Do not paste private keys into shell history, chat logs, issues, or CI logs.

---

## 3. Quick start (in order)
### 3.1 Required user setup (everyone must do this)
**A) Wallet address** (choose one):
- env: `GIGAVERSE_ADDRESS=0x...`
- file: `~/.secrets/gigaverse-address.txt`

**B) JWT** (recommended skill-local):
- create: `skills/gigaverse/credentials/jwt.txt` (standalone clone uses `./credentials/jwt.txt`)
- accepted formats:
  - `Bearer <JWT>`
  - `<JWT>` (raw)

JWT precedence:
1) env `GIGAVERSE_JWT`
2) `skills/gigaverse/credentials/jwt.txt`
3) `~/.secrets/gigaverse-jwt.txt`

**C) Private key** (only required for onchain scripts):
- `~/.secrets/gigaverse-private-key.txt`

### 3.2 Install dependencies
```bash
cd skills/gigaverse/scripts
npm ci
```

### 3.3 Authenticate (get JWT)
```bash
cd skills/gigaverse/scripts
./auth.sh
```

---

## 4. Execution model (fixed-order gates)
The reliability of this skill comes from **strict pre-run gates**, in a fixed order:

1) **Active run gate**: query `/game/dungeon/state`; resume if an active run exists
2) **Energy gate**:
   - normal: `>= 40`
   - juiced/3x: `>= 120`
3) **ROM claim gate**: claim in a fixed order until threshold is met; abort if still insufficient
4) **Repair gate**: check equipped gear; `durability==0` blocks; repair or abort
5) Only if all gates pass, execute `start_run`

These are the canonical rules and are enforced in the runner.

---

## 5. What other users will need to customize
### 5.1 ROM ids / ordering
ROM ids and efficacy can vary by account/season/server changes.
If claims repeatedly yield no energy delta, the user must adjust the ROM order / allowed list.

### 5.2 Repair skip list
Gear instance IDs (e.g. `GearInstance#...`) are user-specific.
If a gear hits max repair count (restore-required) and restore flow is not implemented, users must replace gear or add IDs to `repair_skip_gear_ids`.

### 5.3 Address/JWT/key paths
This publishable edition removes hardcoded absolute workspace paths and uses skill-relative resolution.
Users should still follow the standard `~/.secrets/` convention.

---

## 6. Current vs original (old) — what changed (detailed, concrete diff)
This is not a marketing summary. It is a **mechanical list** of what changed from the initial `old/` skill to the current hardened version.

### 6.1 Architecture: from scattered scripts to a single canonical runner
- **old**: no unified run orchestration entrypoint; the operational flow lived across multiple scripts/docs.
- **current**: `scripts/run-dungeon.ts` is the canonical orchestration layer:
  - Underhaul + 5000
  - normal + juiced
  - resume + pre-run gates + combat loop + recovery + report

### 6.2 Process: non-skippable pre-run gates (fixed order)
Added canonical procedure docs and enforced the model in the runner:
- `references/pre-run-checklist.md`
- `references/pre-run-gates.md`
- `references/runbook.md`

### 6.3 Consistency hardening: actionToken 400 recovery protocol
- **old**: actionToken guidance was mostly documentation-level.
- **current**: implemented recovery protocol:
  - at most one retry on `400`
  - prefer server-returned tokens
  - parse expected token from error text (e.g. `Invalid action token X != Y` -> use `Y` once)
  - resync via `/game/dungeon/state`

### 6.4 Energy/ROM: adaptive ROM claim amounts + local cache
- **old**: no robust handling for “ROM claim yields no energy delta”.
- **current**: adaptive amount tries with conservative caching (only update cache when energy increases).

### 6.5 Gear/repair: equipped detection hardening + restore-required classification
- **current**: strengthened equipped detection (`EQUIPPED_TO_SLOT_CID > 0` preferred) and classified `max repair count` as restore-required; aborts gates instead of blind-loop retry.

### 6.6 Strategy: dungeon-specific, versioned policies + echo handling
New strategy references with a hard requirement that docs and implementation remain isomorphic:
- `references/5000-policy.md` (vD5: no-paper siege fallback, paper budgeting, siegeHard trigger)
- `references/underhaul-policy.md` (vU7/vU7.1(+fix): siegeHardUnderhaul, SiegeHard rock-ban discipline)
- `references/echo-handling.md`
- `references/strategy-history.md`

### 6.7 Observability: structured end-of-run battle reports
- **old**: no consistent, replayable run artifact.
- **current**: structured JSON report per run: preRun, per-step snapshots, and summary.

### 6.8 Portability: credential path standardization + publish-scrub
- JWT precedence standardized (env -> skill-local -> `~/.secrets`).
- Publishable distribution removes hardcoded absolute workspace paths and scrubs personal address/JWT.

### 6.9 File-level quick map (new/major changes)
New (not present in `old/`):
- `scripts/run-dungeon.ts`
- `references/pre-run-checklist.md`
- `references/pre-run-gates.md`
- `references/runbook.md`
- `references/echo-handling.md`
- `references/strategy-history.md`
- `references/5000-policy.md`
- `references/underhaul-policy.md`

Major upgrades (same-named files with materially different semantics):
- `references/api.md`: explicit Underhaul `dungeonId = 3`; energy fields moved to live `parsedData.energyValue/maxEnergy/regenPerHour`
- `HEARTBEAT.md`: energy field migration `currentEnergy` -> `energyValue`
- `CONFIG.md` / `SKILL.md`: added resume/gates/reporting thresholds, repair handling, and stronger operational constraints

---

## 7. Publish-time audit
Before making it public:
```bash
cd skills/gigaverse
./publish-check.sh
```
This verifies:
- no `credentials/jwt.txt` / `credentials/address.txt`
- no JWT blobs in tracked files
- no hardcoded absolute workspace paths

---

## License / Disclaimer
This repo is provided as an automation reference implementation. Users are responsible for:
- protecting their credentials
- understanding onchain/offchain implications
- complying with the game’s rules and local laws

---

## Documentation
See `SKILL.md` for full documentation.
