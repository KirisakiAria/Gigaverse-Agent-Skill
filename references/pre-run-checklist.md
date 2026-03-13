# Gigaverse Pre-Run Checklist

Use this as the mandatory execution skeleton before every dungeon start.
Do not skip, reorder, or shorten steps.

## Inputs
- requested dungeon (`5000` or `Underhaul`)
- requested mode (`normal` or `juiced`)

## Step Order

### 1. Active run gate
- Query `/game/dungeon/state`
- If active run exists: resume, do not fresh-start

### 2. Determine required energy threshold
- normal run → `40`
- juiced / 3x run → `120`

### 3. Read current energy
- Query `/offchain/player/energy/{address}`
- Read `entities[0].parsedData.energyValue`

### 4. Claim energy if below threshold
Use ROM claim attempts in this fixed order:

`3760 -> 7514 -> 1044 -> 4071 -> 793 -> 1706 -> 2792`

After each attempt:
- re-read current energy
- stop once threshold is reached

Interpretation rule:
- if a ROM claim returns empty error / non-success, treat it as currently unavailable / already claimed before treating it as auth failure
- continue to the next ROM candidate when appropriate

### 5. Abort if still below threshold
- If energy remains below the requested mode threshold after claim attempts, stop and report insufficient energy

### 6. Repair gate
- Query gear instances
- Repair required `DURABILITY_CID = 0` gear
- Respect documented conditional no-repair exceptions
- If required repair fails: abort

### 7. State recheck
- Query `/game/dungeon/state` again
- If a run now exists, resume instead of starting a new one

### 8. Fresh-start using dungeon-specific pattern
- `5000` → `dungeonId: 1`, observed fresh-start token `""`
- `Underhaul` → `dungeonId: 3`, observed fresh-start token `""`

### 9. If start fails
- inspect server-returned token if present
- retry at most once with fresher trusted token
- resync via `/game/dungeon/state`
- if still not started, stop and report

## Hard Rule
If any implementation skips Step 4 when energy is below threshold, the implementation is invalid.
