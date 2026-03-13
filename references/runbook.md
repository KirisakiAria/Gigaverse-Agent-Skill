# Gigaverse Operational Runbook

Practical execution order for stable dungeon automation.

## Purpose
Provide one canonical step-by-step run procedure so implementation scripts do not skip critical gates.

---

## A. New Run / Resume Flow

### Step 1 — Check current dungeon state
Query:

```bash
curl https://gigaverse.io/api/game/dungeon/state \
  -H "Authorization: Bearer $JWT"
```

Decision:
- If `data.run != null` → resume existing run
- If `data.run == null` → continue to pre-run gates

---

### Step 2 — Energy gate
Query:

```bash
curl https://gigaverse.io/api/offchain/player/energy/YOUR_ADDRESS
```

Use live `entities[0].parsedData.energyValue`.

Determine threshold from the requested run mode:
- normal run → `40`
- juiced / 3x run → `120`

If below the required threshold, claim ROM energy in the configured order, re-checking after each claim.

---

### Step 3 — Repair gate
Query gear state before any fresh run.

- Repair required gear with `DURABILITY_CID = 0`
- Respect conditional no-repair exceptions from `pre-run-gates.md`
- If a required repair fails, abort and notify

---

### Step 4 — Start run
Only after all gates pass:
- no active run exists
- energy is sufficient
- required repairs are done

Then call `start_run` using the correct dungeon-specific pattern.

Examples:
- `Underhaul` → `dungeonId: 3`, observed working fresh-start token: `""`
- `Dungetron: 5000` → `dungeonId: 1`, observed working fresh-start token: `""`

Do not assume one universal fresh-start token rule across all dungeons or all session states.

---

## B. Battle Loop

### Step 5 — Read local phase before every action
Before sending any action, confirm whether current state is:
- battle phase (`lootPhase=false`)
- loot phase (`lootPhase=true`)

Allowed actions:
- Battle phase → `rock`, `paper`, `scissor`, `use_item`, `heal_or_damage`, `flee`, `cancel_run`
- Loot phase → `loot_one`, `loot_two`, `loot_three`, `loot_four`

---

### Step 6 — Use latest trusted token
Preferred token source order:
1. latest successful action response token
2. server-reported expected token from an error response
3. `/game/dungeon/state` only for context recovery, not as the default truth source

---

### Step 7 — Use real current dungeon id
During an active run, send actions with the real current run dungeon id (`DUNGEON_ID_CID` / current run dungeon id), not a guessed default.

---

### Step 8 — Apply dungeon-specific combat policy
Choose moves from the dungeon-specific policy file:
- `5000-policy.md`
- `underhaul-policy.md`

Do not blindly share one combat ruleset across all dungeons.

---

### Step 9 — Apply loot priority
When loot phase is active, choose based on live `lootOptions` and current policy priorities.

Default baseline:
1. `Heal`
2. `AddMaxArmor`
3. `AddMaxHealth`
4. `UpgradePaper`
5. `UpgradeRock`
6. `UpgradeScissor`

---

## C. Failure Recovery

### Step 10 — Handle `400` safely
If action returns `400` or equivalent action failure:
- do **not** blind-loop retries
- inspect response for expected/server token
- query `/game/dungeon/state`
- determine whether state already advanced
- retry at most once if the state did not advance and a trusted token is available

---

### Step 11 — Handle page/browser loss
If browser/page is lost:
- query `/game/dungeon/state`
- if active run exists, resume it
- do not start a new run unless state confirms there is no active run

---

## D. Completion

### Step 12 — Detect run completion
Completion signals may include:
- no active run remains
- run marked complete
- death / exit resolution observed in state transition

---

### Step 13 — Report outcome
When a run ends:
- summarize result
- list major loot picks
- identify likely failure or success pattern
- record strategy implications for next policy version

Reporting rule (operational default):
- Once `start_run` succeeds, complete the whole run without mid-run confirmation.
- Only emit the detailed battle report after the run ends (`/game/dungeon/state` shows no active run).

---

## E. References
Use this runbook together with:
- `pre-run-gates.md`
- `5000-policy.md`
- `underhaul-policy.md`
- `strategy-history.md`
- `api.md`
