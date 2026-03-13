# Gigaverse Strategy History

High-level evolution log for dungeon-specific combat policies.

## Purpose
Track why strategy versions changed without overloading `MEMORY.md`.

---

## Underhaul

### vU1
- First dedicated Underhaul policy.
- Focus: stop obvious collapses against high-shield enemies.
- Outcome: better midgame survivability, but poor endgame closure.

### vU2
- Added finish-mode and stronger no-shield handling.
- Added dedicated handling for medium enemy shield (`10-15`).
- Outcome: deeper progression, but still died in repeated medium-shield loops.

### vU3
- Further reduced risky `rock` usage in trap states.
- Added more conservative closure logic.
- Outcome: stronger early-mid stability, but still failed against late heavy enemies.

### vU4
- Added `Heavy Endgame Mode`.
- Trigger focus: heavier enemies with meaningful shield while player survivability is falling.
- Outcome: stronger overall run depth and survivability, but late super-heavy enemies still remain the major bottleneck.

### vU5
- Reframed the 2026-03-09 deaths as `possible echo pressure deaths` instead of immediately treating them as normal-template Underhaul failures.
- Integrated `references/echo-handling.md` directly into Underhaul decision routing.
- Kept the base Underhaul policy intact while formalizing: suspected echo -> `Echo Pressure Mode`; otherwise -> normal Underhaul rules.
- Preserved charge-aware fallback handling as an execution constraint.
- Outcome target: stop overfitting the base dungeon policy around player-shaped high-pressure replacement enemies.

### Next likely step
- `vU6`
- Only if repeated echo fights reveal a distinct closure rule worth separating from the current base+echo structure, or a normal-template failure exposes a genuine base-policy gap.

---

## Dungetron: 5000

### vD1
- First dedicated 5000 baseline.
- Goal: keep 5000 strategy independent from Underhaul-specific rules.
- Outcome: real calibration run reached ROOM 7, then died to a thick-shield enemy after 6 loot clears.
- Lesson: baseline was stable early-mid, but lacked dedicated handling for thick enemy shield and shield-collapse states.

### vD2
- Added `thick-shield mode` for `enemyShield >= 18`.
- Added `shield-collapse survival mode` when player shield becomes critically low against still-armored enemies.
- Outcome: real run reached ROOM 11, confirming stronger late survivability.

### vD2 + echo-handling
- Integrated adaptive handling for suspected `echo` replacement enemies.
- Outcome: real run reached ROOM 16 under repeated high-pressure suspected echo encounters.
- Lesson: survival improved dramatically, but late echo fights still tended to become long attrition loops.

### vD3
- Formalized `Echo Siege Mode` for repeated high-pressure suspected echo fights.
- Goal: keep the defensive gains from vD2 while improving late conversion against abnormally strong replacement enemies.

---

## Shared Lessons
- Dungeon-specific strategy files scale better than one shared combat ruleset.
- Pre-run gates (active run, energy, repair) should live in skill references, not long-term memory.
- API behavior and strategy evolution should be documented near the skill for reuse and maintenance.
- Fixed-template room optimization and `echo` handling should be treated as related but distinct problem classes.
