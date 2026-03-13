# Gigaverse Echo Handling

Adaptive handling for abnormal high-pressure `echo` enemies in fixed-template dungeons.

## What an Echo Is
An `echo` is a replacement enemy that can appear in a room instead of the normal fixed room template.

Properties:
- may appear in either `Dungetron: 5000` or `Underhaul`
- does **not** follow the normal room template assumptions
- total stats are typically much higher than standard room enemies
- exact distribution across `rock`, `paper`, `scissor`, `health`, and `shield` varies by the copied player's build

Conclusion:
- treat `echo` as a separate risk class
- do not overfit ordinary room policy based on echo-only deaths

---

## Detection Heuristics

Because room replacement is not always explicitly labeled, use practical detection heuristics.

Flag an encounter as **suspected echo** if one or more are true:
- enemy total stats are obviously above the normal room template expectation
- enemy looks like a player-shaped build rather than a template enemy
- room pacing suddenly spikes far above surrounding rooms
- the encounter has unusually high combined HP + shield + move stats for the apparent stage

Use suspicion levels, not false certainty:
- `normal`
- `suspected_echo`
- `high_confidence_echo`

---

## Core Principles
- Prioritize survival over speed.
- Do not assume normal room-template lines remain valid.
- Avoid over-committing to greedy `rock` lines before the enemy is truly exposed.
- Re-evaluate after every action; treat the fight as adaptive, not scripted.
- In post-run analysis, separate echo pressure from ordinary strategy failure.

---

## Echo Pressure Mode

Enter `Echo Pressure Mode` when the encounter is suspected to be an echo.

### Default stance
- `paper` becomes the primary stabilizer.
- `rock` is reserved for clearly exposed or near-lethal states.
- `scissor` is secondary pressure, not the default answer.

### Survival rules
If player survivability drops:
- prefer `paper`
- avoid speculative tempo plays
- do not spend shield recklessly while enemy still has meaningful shield or pressure

### Exposure rules
If `enemyShield == 0`:
- use `rock` when player stability is still acceptable
- if fragile, do not force greed; re-stabilize first if possible

### Shield-collapse rule
If `myShield` becomes critically low against still-dangerous echo pressure:
- immediately switch to survival-first behavior
- avoid any action sequence that assumes a normal template enemy

---

## Anti-Overfitting Rule
If a run dies to a likely echo:
- do **not** immediately rewrite the base dungeon policy as if the fixed room template itself changed
- first classify the death as:
  - normal-template failure
  - possible echo failure
  - high-confidence echo failure

Only use echo deaths to change the base policy when a broader recurring pattern justifies it.

---

## Reporting Rules
In battle reports, explicitly mark:
- `suspected echo`
- why it was suspected
- whether the death should count against the base dungeon policy

Recommended phrasing:
- `Likely normal-template failure`
- `Possible echo pressure death`
- `High-confidence echo replacement encountered`

---

## Integration
Use this file together with:
- `references/runbook.md`
- `references/5000-policy.md`
- `references/underhaul-policy.md`
- `references/strategy-history.md`
