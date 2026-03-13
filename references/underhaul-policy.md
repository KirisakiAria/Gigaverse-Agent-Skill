# Underhaul Combat Policy vU7

Status: revised after 2026-03-12 juiced Underhaul runs that produced early extreme thick-enemy encounters (e.g. 42/16, 42/18) before loot scaling, causing immediate shield collapse.

## Goal
Keep the base Underhaul policy stable for normal template rooms while correctly routing abnormal high-pressure fights into `Echo Pressure Mode` and an explicit `SiegeHard` grinder mode.

## Core Principles
- Survival first when shield is gone or HP is under pressure.
- Medium shield (`10-15`) remains a primary danger band in normal Underhaul fights.
- Heavy enemies (`enemyHp >= 24` and `enemyShield >= 13`) still require dedicated endgame caution.
- **Suspected echo pressure overrides base room assumptions.**
- Avoid moves that reintroduce exposed enemies into medium/high shield unless the payoff is decisive.
- Late-fight closure should become more conservative as survivability drops.
- **Charge-aware action choice matters.** Treat `currentCharges <= 0` as unavailable (charges can be observed at `0` or even negative under pressure).

## Echo Integration Rule
Before applying ordinary Underhaul move rules, evaluate whether the encounter should be treated as `suspected_echo` using `references/echo-handling.md`.

Practical Underhaul heuristics:
- enemy total stats are obviously above normal room expectation for the current stage
- enemy looks player-shaped rather than template-shaped
- fight pacing spikes sharply compared with surrounding rooms
- enemy repeatedly rebounds from exposed state back into thick shield pressure in a way that looks unlike a normal template line

If suspected:
- enter `Echo Pressure Mode`
- do **not** treat the fight as evidence that the base Underhaul room template changed
- classify post-run outcome separately from normal-template failures

## Move Rules

### 0) SiegeHard trigger (new, vU7)
Some Underhaul runs surface extreme thick enemies early (before loot scaling) that behave like siege/echo pressure even if they are not clearly an echo.

Trigger `siegeHardUnderhaul` if:
- `(enemyHp + enemyShield) >= 55`, OR
- `(enemyShield >= 16 && enemyHp >= 35)`

When triggered:
- Use `paper` as anchor when it is healthy.
- Use `scissor` as the default grinder.
- **vU7.1: do not use `rock` while the enemy is shielded.** Only allow `rock` when the enemy is exposed (`enemyShield == 0`) and the finish payoff is obvious.

**No-paper fallback (vU7):**
- If `paperCharges <= 0`, paper is unavailable.
- Default to `scissor`.
- Only allow `rock` when `enemyShield == 0`.

**Paper budgeting (vU7):**
- If `paperCharges <= 1`, conserve paper for collapse moments; let `scissor` carry most turns.

### 1) Emergency survival
If `myHp <= 10`:
- Prefer `paper`.
- Prefer `scissor` over speculative `rock` if `paper` is unavailable.
- Use `rock` only if the enemy is exposed and clearly in finish range.

### 2) Fragile no-shield state
If `myShield == 0` and `myHp <= 20`:
- Prefer `paper`.
- If `paper` is unavailable, prefer `scissor`.
- Use `rock` only when `enemyShield == 0` and the enemy is clearly in finish range.

### 3) Ultra-fragile endgame
If `myShield == 0` and `myHp <= 12`:
- Treat as highest-risk mode.
- Default to `paper`.
- Use `scissor` only as secondary stabilization.
- Avoid greedy `rock` unless it is the cleanest finishing line.

### 4) Heavy Endgame Mode
Trigger when:
- `enemyHp >= 24` and `enemyShield >= 13`
- and (`myShield <= 5` or `myHp <= 25`)

In Heavy Endgame Mode:
- Prefer `paper` first.
- Use `scissor` as the secondary move.
- Do not use `rock` by default.
- Only allow `rock` if the enemy is already exposed and finish value is obvious.
- Accept slower stabilization over high-variance exchanges.

### 5) Finish mode
If `enemyShield == 0` and `enemyHp <= 12`:
- Prefer `paper` when fragile.
- Prefer `rock` only when survivability is stable (`myShield > 0` or `myHp > 12`).
- `scissor` is a fallback, not default.

### 6) High enemy shield mode
If `enemyShield >= 20`:
- Prefer `paper` **only if it is available and not near depletion**.
- If `paper` is unavailable / depleted (`paperCharges <= 0`), default to `scissor` as the stabilizing move.
- Do not chain `rock` into the high-shield state.

### 7) Medium shield trap zone
If `10 <= enemyShield <= 15`:
- Treat as the main anti-throw zone.
- Prefer `paper` first.
- If `paper` is unavailable, prefer `scissor`.
- Do not use `rock` by default in this band.
- Only allow `rock` if the prior exchange clearly reduced danger and survivability is stable.

### 8) Low shield pressure
If `1 <= enemyShield <= 9`:
- `paper` remains preferred unless there is a strong reason to convert with `rock`.
- Use `rock` more selectively than in Dungetron: 5000.

### 9) Exposed enemy, not yet finish range
If `enemyShield == 0` and `enemyHp > 12`:
- Prefer `paper` when fragile.
- Prefer `rock` only if it is unlikely to bounce the enemy back into a dangerous medium-shield loop.
- If recent exchanges with `rock` have recreated medium or high shield, downgrade `rock`.

### 10) High enemy HP rule
If `enemyHp >= 30`:
- Prefer `paper`, then `scissor`, then `rock`.
- Override with higher-priority survival rules whenever needed.

### 11) Fallback
If no higher-priority rule applies:
- Prefer `paper`, then `scissor`, then `rock`.

## Loot Priority
1. `Heal`
2. `AddMaxHealth`
3. `AddMaxArmor`
4. `UpgradePaper`
5. `UpgradeScissor`
6. `UpgradeRock`
2. `AddMaxArmor`
3. `AddMaxHealth`
4. `UpgradePaper`
5. `UpgradeRock`
6. `UpgradeScissor`

## Rationale from 2026-03-09 ~ 2026-03-10 field runs
Observed pattern:
- Multiple juiced runs show late high-pressure bodies around `26 / 20` and thick-shield attrition.
- 2026-03-10 juiced run completed but exhibited prolonged thick-shield pressure (`28/17`, then `26/20`→`24/20`) with **observable `paper` charge exhaustion (0 / negative)**.

Interpretation:
- These events still look like `possible echo pressure` more than a base template shift.
- However, charge exhaustion is no longer "just local"; it is a **first-class tactical constraint** in echo siege contexts and must be explicitly modeled (conserve `paper`, let `scissor` take non-emergency turns, avoid high-variance `rock` conversions).

## Review Triggers
Revise again after any of the following:
- repeated `possible echo pressure deaths` that reveal a stable echo-specific closure pattern
- a clear `normal-template failure` in the medium-shield band (`10-15`)
- death after reintroducing an exposed normal-template enemy into medium or high shield
- repeated long fights where `paperCharges <= 0` occurs before the fight resolves (indicates siege handling still leaks stabilizer charges)
- any successful Underhaul clear that proves a stronger heavy-fight or echo-fight closing pattern

## Notes
- This policy is Underhaul-specific and should evolve independently from Dungetron: 5000 strategy.
- Use `references/echo-handling.md` as the authority for suspected-echo classification and reporting.
- Future versions should be labeled `vU6`, `vU7`, etc. only when there is new run-based evidence worth separating from the current base+echo structure.
