# Gigaverse Pre-Run Gates

Mandatory pre-dungeon checks before any new run.

## Purpose
Reduce avoidable failures by enforcing energy and repair checks before `start_run`.

## Gate Order
1. Check for active run via `/game/dungeon/state`
2. Check / restore energy
3. Check / repair required gear
4. Only then call `start_run`

If any gate fails, abort and notify instead of forcing progress.

---

## 1) Active Run Gate
Always query current state first:

```bash
curl https://gigaverse.io/api/game/dungeon/state \
  -H "Authorization: Bearer $JWT"
```

If `data.run != null`:
- resume the existing run
- do **not** start a new run

---

## 2) Energy Gate
Check live energy from:

```bash
curl https://gigaverse.io/api/offchain/player/energy/YOUR_ADDRESS
```

Use `entities[0].parsedData.energyValue` as the human-facing source of truth.

### Current operational rule
Energy threshold depends on the requested run mode:
- **Normal run** → require at least `40` energy
- **Juiced / 3x run** → require at least `120` energy

If current energy is below the required threshold, claim ROM energy in this fixed order:

`3760 -> 7514 -> 1044 -> 4071 -> 793 -> 1706 -> 2792`

Re-check after each claim and stop once energy reaches the threshold required by the requested mode.

### Claim payload rule
Do **not** assume `amount: 1` is universally valid.
Use the currently valid / observed claim amount for the target ROM when available.
A confirmed successful browser sample used:

```json
{ "romId": "3760", "claimId": "energy", "amount": 19 }
```

### Claim pattern
```bash
curl -X POST https://gigaverse.io/api/roms/factory-claim \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{"romId":"3760","claimId":"energy","amount":19}'
```

---

## 3) Repair Gate
Read current gear instances first:

```bash
curl https://gigaverse.io/api/gear/instances/YOUR_ADDRESS \
  -H "Authorization: Bearer $JWT"
```

Repair all required gear with `DURABILITY_CID = 0` before entering a new run.

### Repair exception rule
There are 14 conditional docIds where repair is skipped **only if** `REPAIR_COUNT_CID >= 2`.

Conditional no-repair docIds:
- `GearInstance#210_1753962427`
- `GearInstance#208_1753962430`
- `GearInstance#208_1755876540`
- `GearInstance#202_1757011015`
- `GearInstance#208_1758277668`
- `GearInstance#208_1758680909`
- `GearInstance#210_1759293297`
- `GearInstance#205_1759973897`
- `GearInstance#210_1761281981`
- `GearInstance#202_1765220579`
- `GearInstance#207_1768036129`
- `GearInstance#210_1768490836`
- `GearInstance#202_1770008377`
- `GearInstance#205_1771321378_8bf83adb`

### Repair rule summary
- If `DURABILITY_CID != 0`: no repair needed
- If `DURABILITY_CID == 0` and docId is **not** in the conditional list: repair is required
- If `DURABILITY_CID == 0` and docId **is** in the conditional list:
  - skip only when `REPAIR_COUNT_CID >= 2`
  - otherwise repair is required

### If repair fails
Abort the run and notify immediately.
Do **not** continue into dungeon combat with unresolved required repair failures.

Repair endpoint pattern:
```bash
curl -X POST https://gigaverse.io/api/gear/repair \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{"gearInstanceId":"GearInstance#..."}'
```

---

## 4) Start-Run Rule
Only after all gates pass:
- no active run exists
- energy is sufficient
- required repairs are complete

then proceed to `start_run`.

---

## Failure Handling
If `start_run` or later action returns intermittent `400`:
- preserve hard gates as mandatory
- cooldown briefly if needed
- check `/game/dungeon/state` before deciding whether to resume, retry once, or abort
