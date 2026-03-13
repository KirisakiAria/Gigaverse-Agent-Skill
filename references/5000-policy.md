# Dungetron: 5000 Combat Policy vD5

Status: revised after an additional 2026-03-10 juiced 5000 run that hit hard-siege bodies (`44/29`) while `paper` charges reached `0/negative`; policy now explicitly defines the "no-paper siege" fallback line.

## Goal
Push 5000 deeper by separating three problem classes:
- normal template fights
- thick-shield fights
- high-pressure suspected echo fights

## vD3 → vD4 Rationale
A 2026-03-10 **juiced** 5000 run again reached **ROOM 16**, and the late-game pattern confirmed an extreme echo class:
- observed enemy body near `48 / 30` (HP / shield) — far above normal template expectation
- fights can remain stable for long periods, but token/charge constraints and shield collapse decide outcomes
- in siege contexts, spending `paper` reflexively can starve the endgame of stabilization

Conclusion:
- `vD3` survivability is adequate for template and thick-shield bands
- `vD4` tightens **Echo Siege Mode** into an explicit *conservation + conversion* protocol (charge-aware paper budgeting + scissor-heavy grinding + rock only on clean exposure)

## Core Principles
- Keep normal-template optimization separate from echo adaptation.
- Use `paper` as the main stabilizer **when it is available**.
- Treat extreme total enemy stats as a separate tactical class.
- When facing probable echo pressure, survival alone is not enough; the policy also needs a cleaner finish path.
- **Charge-aware constraint:** treat `currentCharges <= 0` as unavailable (charges can hit `0` or negative under pressure). In siege, budget `paper` for the moments that actually prevent collapse.

## Detection Bands
### Normal-template band
Use standard 5000 logic when enemy pressure looks ordinary.

### Thick-shield band
Use thick-shield logic when shield is the main problem.

### Echo band
Treat the encounter as suspected echo when total enemy pressure is abnormally high for the stage.
Practical heuristic:
- abnormal combined HP + shield + move stats
- player-build-shaped stat distribution
- sudden pressure spike not matching normal room pacing

## Move Rules

### 1) Emergency survival
If `myHp <= 14`:
- Prefer `paper`.
- Use `rock` only when enemy is exposed and lethal pressure is realistic.
- Use `scissor` only as fallback.

### 2) Shield-collapse survival mode
If `myShield <= 3` and `enemyShield >= 8`:
- Prefer `paper` when available.
- If `paper` is unavailable / depleted (`paperCharges <= 0`), prefer `scissor` as the least-worst stabilizer.
- Avoid greedy `rock` unless the enemy is exposed and near death.

### 3) Thick-shield mode
If `enemyShield >= 18` and echo pressure is not strongly suspected:
- Prefer `paper`.
- Use `scissor` as secondary pressure.
- Avoid repeated speculative `rock` until the enemy is genuinely exposed.

### 4) Echo Pressure Mode
If suspected echo pressure is active:
- Prefer `paper` as the default stabilizer.
- Use `scissor` as controlled secondary pressure.
- Reserve `rock` for exposed or near-conversion states.
- Re-evaluate after every action; do not run long blind sequences.

### 5) Echo Siege Mode (vD5: no-paper line)
Enter `Echo Siege Mode` when suspected echo pressure remains high across repeated exchanges, especially when:
- enemy total pressure remains abnormally high
- the fight is dragging
- survival is holding, but finish conversion is poor

**Hard trigger:**
- `enemyHp + enemyShield >= 70` (examples: `48/30`, `44/29`) OR `enemyShield >= 20` with `enemyHp >= 30`.

In `Echo Siege Mode`:
- Keep `paper` as the anchor **only when it buys real stability**.
- If `paperCharges <= 1`, **conserve** `paper` for shield-collapse moments; let `scissor` carry most non-emergency turns.

**No-paper siege fallback (new):**
If `paperCharges <= 0` (including negative) while `siegeHard` remains true:
- Treat `scissor` as the default stabilizer/grinder.
- Do **not** spend `rock` into a shielded enemy unless the enemy is already near dead *and* you are not collapsing.
- Only prefer `rock` when:
  - `enemyShield == 0`, or
  - the action is a near-certain finish that will not bounce the enemy back into thick shield.

General siege conversion discipline:
- Prefer `scissor` for grinding shield down when the enemy is still thick-shielded.
- Delay `rock` until:
  - enemy is exposed (`enemyShield == 0`), and
  - you can plausibly finish without bouncing them back into thick shield, and
  - your stability is not collapsing (`myShield > 0` or `myHp` comfortably above the emergency band).
- If your shield collapses (`myShield <= 3`) while enemy remains shielded, immediately revert to survival-first behavior.

### 6) High enemy HP rule
If `enemyHp >= 30` and no higher-priority mode overrides:
- prefer `paper -> paper -> scissor` when charges and local state allow.
- if `enemyShield >= 20` (siege) and `paperCharges` are low, invert priority to preserve `paper`: `scissor` becomes the default pressure move.

### 7) Exposed enemy rule
If `enemyShield == 0`:
- Prefer `rock` when survivability is stable.
- If fragile, do not force greed; stabilize first if possible.

### 8) Standard shield control
If `enemyShield > 0` and no higher-priority mode overrides:
- Prefer `paper`.
- Use `rock` selectively when tempo gain is real and survivability remains acceptable.
- Use `scissor` as secondary pressure.

### 9) Fallback
If no higher-priority rule applies:
- Prefer `paper`, then `rock`, then `scissor`.

## Echo-Specific Notes
- Do not overfit ordinary room policy based on suspected echo deaths alone.
- In battle reports, classify late high-pressure failures separately from normal-template failures.
- If a run dies after multiple suspected echo encounters, treat that as partial validation of the base policy rather than a blanket indictment.

## Loot Priority
1. `Heal`
2. `AddMaxArmor`
3. `AddMaxHealth`
4. `UpgradePaper`
5. `UpgradeRock`
6. `UpgradeScissor`

## Review Triggers
Revise after any of the following:
- another ROOM 16+ failure under suspected echo pressure
- evidence that Echo Siege Mode still stabilizes but cannot finish
- evidence that thick-shield mode and echo mode need cleaner separation
- repeated siege fights where `paperCharges <= 0` occurs before the fight resolves **and** scissor-first siege still cannot reduce shield meaningfully
- a successful deep run showing a stronger late-game finish pattern

## Notes
- `vD3` formalizes `Echo Siege Mode`.
- For defeated runs with missing room number, compute final room as `loot_count + 1`.
