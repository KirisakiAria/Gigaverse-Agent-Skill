# Gigaverse Skill — Publishable Distribution Notes

This folder is a **publishable** copy of the local Gigaverse skill.
It is scrubbed of user secrets and hardcoded user identity.

## Required user setup (for anyone who installs this skill)

### 1) Wallet address
Set an address via one of:
- env: `GIGAVERSE_ADDRESS=0x...`
- file: `~/.secrets/gigaverse-address.txt`

### 2) JWT (auth token)
Recommended (skill-local):
- create: `skills/gigaverse/credentials/jwt.txt`
- content formats accepted:
  - `Bearer <JWT>`
  - `<JWT>` (raw)

Fallback:
- `~/.secrets/gigaverse-jwt.txt`

### 3) Private key (only needed for onchain actions like juice purchase)
- `~/.secrets/gigaverse-private-key.txt`
- Optional override: env `NOOB_PRIVATE_KEY`

## Per-user tuning points

### ROM claim order / ids
ROM ids can be account / season dependent.
If ROM claims do not increase `energyValue`, update the ROM claim order in the runner.

### Repair skip list
Gear instance IDs are **user-specific**.
If a gear hits max repair count and the restore flow is not implemented, add that gear instance id to the skip list / replace gear.

## Publish-time safety checklist

Run this from the skill root before pushing public:

```bash
# 1) Ensure no real credentials files exist
test ! -f credentials/jwt.txt

test ! -f credentials/address.txt

# 2) Ensure no JWT blobs accidentally exist in tracked files
! grep -RIn --exclude-dir=node_modules --exclude=package-lock.json --exclude=PUBLISHING.md --exclude=publish-check.sh --exclude=README.md --exclude=README_CN.md -E "eyJhbGci|Bearer eyJ" .

# 3) Ensure no hardcoded workspace paths exist
! grep -RIn --exclude-dir=node_modules --exclude=package-lock.json --exclude=PUBLISHING.md --exclude=publish-check.sh "/root/.openclaw/workspace" .
```

## Security
- Never commit `credentials/jwt.txt` or any files under `~/.secrets/`.
- If you ever committed a real JWT to git history, rotate it and rewrite history before publishing.

