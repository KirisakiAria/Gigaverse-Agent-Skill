#!/usr/bin/env node
/*
  Generic dungeon runner (headless).

  Guarantees:
  - Pre-run checklist: active-run gate → energy gate (+ ROM claims) → repair gate → state recheck → start_run
  - Atomic actionToken chaining; on action error, retries once using server-provided actionToken.
  - Single-flight: no concurrent actions.

  Usage:
    cd skills/gigaverse/scripts
    npm ci

    # Underhaul juiced
    npx ts-node ./run-dungeon.ts --dungeon underhaul --juiced

    # 5000 normal
    npx ts-node ./run-dungeon.ts --dungeon 5000

  JWT source:
    - env GIGAVERSE_JWT (raw token, optional "Bearer ")
    - or ~/.secrets/gigaverse-jwt.txt
*/

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const BASE = 'https://gigaverse.io/api';

const ROM_ORDER = ['3760', '7514', '1044', '4071', '793', '1706', '2792'] as const;

// ROM claim amount is a server-side policy knob; do not hardcode a single value forever.
// We keep a small local cache per romId, and fall back to a short candidate list.
const ROM_AMOUNT_CANDIDATES = [19, 1, 5, 10, 20];
const ROM_MAX_TRIES_PER_ROM = 3;

const CONDITIONAL_REPAIR_SKIP_DOC_IDS = new Set([
  'GearInstance#210_1753962427',
  'GearInstance#208_1753962430',
  'GearInstance#208_1755876540',
  'GearInstance#202_1757011015',
  'GearInstance#208_1758277668',
  'GearInstance#208_1758680909',
  'GearInstance#210_1759293297',
  'GearInstance#205_1759973897',
  'GearInstance#210_1761281981',
  'GearInstance#202_1765220579',
  'GearInstance#207_1768036129',
  'GearInstance#210_1768490836',
  'GearInstance#202_1770008377',
  'GearInstance#205_1771321378_8bf83adb',
]);

type DungeonKey = 'underhaul' | '5000';

type RunnerConfig = {
  dungeon: DungeonKey;
  dungeonId: number;
  juiced: boolean;
  energyThreshold: number;
};

type RunSnapshot = {
  step: number;
  lootPhase: boolean;
  action: string;
  myHp: number;
  myShield: number;
  enemyHp: number;
  enemyShield: number;
  charges: { rock: number; paper: number; scissor: number };
  lootOptions?: string[];
  tokenRecovery?: { usedToken: string | number };
};

type RunReport = {
  dungeon: DungeonKey;
  juiced: boolean;
  startedFresh: boolean;
  resumed: boolean;
  preRun: {
    onboarding: boolean;
    energyThreshold: number;
    energyStart?: number;
    romClaims: Array<{ romId: string; amountTried: number; energyBefore: number; energyAfter: number }>;
    repairs: string[];
  };
  snapshots: RunSnapshot[];
  summary?: { result: 'completed' | 'aborted'; battleCount: number; lootCount: number };
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function readSecret(name: string): string | undefined {
  try {
    const p = join(homedir(), '.secrets', name);
    const v = readFileSync(p, 'utf8').trim();
    return v.length ? v : undefined;
  } catch {
    return undefined;
  }
}

function cachePath() {
  return join(homedir(), '.config', 'gigaverse', 'rom-amount-cache.json');
}

type RomAmountCache = Record<string, number>;

function readRomAmountCache(): RomAmountCache {
  try {
    const p = cachePath();
    const raw = readFileSync(p, 'utf8');
    const j = JSON.parse(raw);
    if (j && typeof j === 'object') return j as RomAmountCache;
    return {};
  } catch {
    return {};
  }
}

function writeRomAmountCache(cache: RomAmountCache) {
  try {
    const p = cachePath();
    mkdirSync(join(homedir(), '.config', 'gigaverse'), { recursive: true });
    writeFileSync(p, JSON.stringify(cache, null, 2));
  } catch {
    // best-effort only
  }
}

function jwt(): string {
  const v =
    process.env.GIGAVERSE_JWT ??
    // workspace-local recommended path
    (() => {
      try {
        const p = join(process.cwd(), '..', 'credentials', 'jwt.txt');
        const s = readFileSync(p, 'utf8').trim();
        return s.length ? s : undefined;
      } catch {
        return undefined;
      }
    })() ??
    // user-global secrets fallback
    readSecret('gigaverse-jwt.txt');

  if (!v) {
    throw new Error(
      'Missing JWT. Set GIGAVERSE_JWT, or create skills/gigaverse/credentials/jwt.txt, or ~/.secrets/gigaverse-jwt.txt'
    );
  }

  return v.replace(/^Bearer\s+/i, '').trim();
}

function address(): string {
  const v = process.env.GIGAVERSE_ADDRESS ?? readSecret('gigaverse-address.txt');
  if (!v) throw new Error('Missing address. Set GIGAVERSE_ADDRESS or create ~/.secrets/gigaverse-address.txt');
  return v.trim();
}

async function apiGet(path: string, withAuth: boolean) {
  const headers: Record<string, string> = {};
  if (withAuth) headers.Authorization = `Bearer ${jwt()}`;
  const res = await fetch(`${BASE}${path}`, { headers });
  const text = await res.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  return { res, json, text };
}

async function apiPost(path: string, body: any) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${jwt()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  return { res, json, text };
}

function snapshotFromRun(run: any) {
  const me = run.players?.[0];
  const enemy = run.players?.[1];
  return {
    myHp: toInt(me?.health?.current, 0),
    myShield: toInt(me?.shield?.current, 0),
    enemyHp: toInt(enemy?.health?.current, 0),
    enemyShield: toInt(enemy?.shield?.current, 0),
    charges: currentCharges(run),
    lootOptions: Array.isArray(run.lootOptions) ? run.lootOptions.map((o: any) => String(o?.boonTypeString ?? '')).filter(Boolean) : undefined,
    lootPhase: Boolean(run.lootPhase),
  };
}

function getRun(stateJson: any): any | null {
  return stateJson?.data?.run ?? null;
}

function extractActionToken(obj: any): string | number | undefined {
  return obj?.actionToken ?? obj?.data?.actionToken;
}

function toInt(v: any, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function currentCharges(run: any) {
  const me = run.players?.[0];
  const rock = toInt(me?.rock?.currentCharges, 0);
  const paper = toInt(me?.paper?.currentCharges, 0);
  const scissor = toInt(me?.scissor?.currentCharges, 0);
  return { rock, paper, scissor };
}

function available(charges: ReturnType<typeof currentCharges>, a: 'rock' | 'paper' | 'scissor') {
  return toInt((charges as any)[a], 0) > 0;
}

function chooseMoveUnderhaul(run: any): 'rock' | 'paper' | 'scissor' {
  const me = run.players?.[0];
  const enemy = run.players?.[1];
  const myHp = toInt(me?.health?.current, 0);
  const myShield = toInt(me?.shield?.current, 0);
  const enemyHp = toInt(enemy?.health?.current, 0);
  const enemyShield = toInt(enemy?.shield?.current, 0);

  const charges = currentCharges(run);
  const paperCharges = charges.paper;

  const paperAvailable = available(charges, 'paper');
  const scissorAvailable = available(charges, 'scissor');
  const rockAvailableRaw = available(charges, 'rock');

  // vU7: early siegeHard trigger for abnormal thick enemies.
  // This routes extreme fights into a conservative grinder mode before loot scaling kicks in.
  const siegeHardUnderhaul = (enemyHp + enemyShield) >= 55 || (enemyShield >= 16 && enemyHp >= 35);

  // vU7.1-fix: global hard ban.
  // In SiegeHard, never spend rock into a shielded enemy (applies across all branches).
  const siegeRockBanned = siegeHardUnderhaul && enemyShield > 0;
  const rockAvailable = rockAvailableRaw && !siegeRockBanned;

  // Emergency survival
  if (myHp <= 10) {
    if (paperAvailable) return 'paper';
    if (scissorAvailable) return 'scissor';
    return rockAvailableRaw ? 'rock' : 'rock';
  }

  // Fragile no-shield state
  if (myShield === 0 && myHp <= 20) {
    if (paperAvailable) return 'paper';
    if (scissorAvailable) return 'scissor';
    return rockAvailableRaw ? 'rock' : 'rock';
  }

  // vU7: SiegeHard Mode (no-paper fallback + paper budgeting)
  if (siegeHardUnderhaul) {
    // vU7.1: in SiegeHard, never spend rock into a shielded enemy.
    // Rock is only allowed when the enemy is exposed.
    const allowRock = enemyShield === 0;

    if (paperCharges <= 0) {
      if (scissorAvailable) return 'scissor';
      if (allowRock && rockAvailable) return 'rock';
      if (paperAvailable) return 'paper';
      return 'rock';
    }

    if (paperCharges <= 1) {
      if (scissorAvailable) return 'scissor';
      if (paperAvailable) return 'paper';
      return allowRock && rockAvailable ? 'rock' : (scissorAvailable ? 'scissor' : 'rock');
    }

    if (paperAvailable) return 'paper';
    if (scissorAvailable) return 'scissor';
    return allowRock && rockAvailable ? 'rock' : 'paper';
  }

  // Heavy Endgame Mode
  if (enemyHp >= 24 && enemyShield >= 13 && (myShield <= 5 || myHp <= 25)) {
    if (paperAvailable) return 'paper';
    return scissorAvailable ? 'scissor' : (rockAvailable ? 'rock' : 'paper');
  }

  // Finish mode
  if (enemyShield === 0 && enemyHp <= 12) {
    if ((myShield > 0 || myHp > 12) && rockAvailable) return 'rock';
    if (paperAvailable) return 'paper';
    return scissorAvailable ? 'scissor' : 'rock';
  }

  // High enemy shield mode
  if (enemyShield >= 20) {
    if (paperAvailable && paperCharges > 1) return 'paper';
    if (paperCharges <= 0 && scissorAvailable) return 'scissor';
    if (paperAvailable) return 'paper';
    return scissorAvailable ? 'scissor' : (rockAvailable ? 'rock' : 'paper');
  }

  // Medium shield trap zone
  if (enemyShield >= 10) {
    if (paperAvailable) return 'paper';
    return scissorAvailable ? 'scissor' : (rockAvailable ? 'rock' : 'paper');
  }

  // Exposed enemy, not yet finish range
  if (enemyShield === 0 && enemyHp > 12) {
    if (myShield > 0 && myHp > 12 && rockAvailable) return 'rock';
    if (paperAvailable) return 'paper';
    return scissorAvailable ? 'scissor' : 'rock';
  }

  // Default
  if (paperAvailable) return 'paper';
  if (scissorAvailable) return 'scissor';
  return rockAvailable ? 'rock' : 'paper';
}

function chooseMove5000(run: any): 'rock' | 'paper' | 'scissor' {
  const me = run.players?.[0];
  const enemy = run.players?.[1];
  const myHp = toInt(me?.health?.current, 0);
  const myShield = toInt(me?.shield?.current, 0);
  const enemyHp = toInt(enemy?.health?.current, 0);
  const enemyShield = toInt(enemy?.shield?.current, 0);

  const charges = currentCharges(run);
  const paperCharges = charges.paper;

  // 5000 policy vD4 condensed: echo siege hard trigger + paper budgeting.
  const siegeHard = (enemyHp + enemyShield) >= 70 || (enemyShield >= 20 && enemyHp >= 30);

  const paperAvailable = available(charges, 'paper');
  const scissorAvailable = available(charges, 'scissor');
  const rockAvailable = available(charges, 'rock');

  // Emergency survival band
  if (myHp <= 14) {
    if (paperAvailable) return 'paper';
    if (scissorAvailable) return 'scissor';
    return 'rock';
  }

  // Shield-collapse survival band
  if (myShield <= 3 && enemyShield >= 8) {
    if (paperAvailable) return 'paper';
    if (scissorAvailable) return 'scissor';
    return 'rock';
  }

  // Exposed conversion rule
  if (enemyShield === 0) {
    if ((myShield > 0 || myHp > 14) && rockAvailable) return 'rock';
    if (paperAvailable) return 'paper';
    return scissorAvailable ? 'scissor' : 'rock';
  }

  // Echo Siege Mode (hard trigger)
  if (siegeHard) {
    // vD5: no-paper siege fallback.
    // If paper is fully depleted (<= 0), treat scissor as the default grinder.
    // Avoid spending rock into a shielded enemy unless exposed.
    if (paperCharges <= 0) {
      if (scissorAvailable) return 'scissor';
      if (enemyShield === 0 && rockAvailable) return 'rock';
      if (paperAvailable) return 'paper';
      return 'rock';
    }

    // If paper is near depletion, conserve it for collapse moments.
    if (paperCharges <= 1) {
      if (scissorAvailable) return 'scissor';
      if (paperAvailable) return 'paper';
      return 'rock';
    }

    // Otherwise keep paper as anchor, scissor as grinder.
    if (paperAvailable) return 'paper';
    if (scissorAvailable) return 'scissor';
    return rockAvailable ? 'rock' : 'paper';
  }

  // Thick-shield band
  if (enemyShield >= 18) {
    if (paperAvailable) return 'paper';
    return scissorAvailable ? 'scissor' : (rockAvailable ? 'rock' : 'paper');
  }

  // High HP band (non-siege)
  if (enemyHp >= 30) {
    // Preserve paper when enemyShield is still very thick.
    if (enemyShield >= 20 && paperCharges <= 1 && scissorAvailable) return 'scissor';
    if (paperAvailable) return 'paper';
    return scissorAvailable ? 'scissor' : (rockAvailable ? 'rock' : 'paper');
  }

  // Default shield control
  if (paperAvailable) return 'paper';
  if (scissorAvailable) return 'scissor';
  return rockAvailable ? 'rock' : 'paper';
}

function chooseLootAction(run: any): 'loot_one' | 'loot_two' | 'loot_three' | 'loot_four' {
  const opts: any[] = Array.isArray(run.lootOptions) ? run.lootOptions : [];
  const priority = ['Heal', 'AddMaxArmor', 'AddMaxHealth', 'UpgradePaper', 'UpgradeRock', 'UpgradeScissor'];

  const boon = (o: any) => String(o?.boonTypeString ?? '');

  let bestIndex = 0;
  let bestRank = Number.POSITIVE_INFINITY;

  for (let i = 0; i < opts.length; i++) {
    const b = boon(opts[i]);
    const rank = priority.indexOf(b);
    const r = rank === -1 ? 999 : rank;
    if (r < bestRank) {
      bestRank = r;
      bestIndex = i;
    }
  }

  return (['loot_one', 'loot_two', 'loot_three', 'loot_four'] as const)[Math.min(bestIndex, 3)];
}

function chooseAction(config: RunnerConfig, run: any): 'rock' | 'paper' | 'scissor' | 'loot_one' | 'loot_two' | 'loot_three' | 'loot_four' {
  if (run.lootPhase) return chooseLootAction(run);
  return config.dungeon === 'underhaul' ? chooseMoveUnderhaul(run) : chooseMove5000(run);
}

async function ensureOnboarding(report?: RunReport) {
  const addr = address();

  // Some deployments allow unauthenticated account/faction reads, others require auth.
  let account = await apiGet(`/game/account/${addr}`, false);
  if (account.res.status === 401) account = await apiGet(`/game/account/${addr}`, true);
  if (!account.res.ok) throw new Error(`account gate failed: ${account.res.status}`);

  const noob = account.json?.noob ?? account.json?.data?.noob;
  const username =
    account.json?.username ??
    account.json?.data?.username ??
    account.json?.usernames?.[0] ??
    account.json?.data?.usernames?.[0];

  let faction = await apiGet(`/factions/player/${addr}`, false);
  if (faction.res.status === 401) faction = await apiGet(`/factions/player/${addr}`, true);
  if (!faction.res.ok) throw new Error(`faction gate failed: ${faction.res.status}`);
  const factionCid =
    toInt(faction.json?.FACTION_CID ?? faction.json?.data?.FACTION_CID, 0) ||
    toInt(faction.json?.entities?.[0]?.FACTION_CID ?? faction.json?.data?.entities?.[0]?.FACTION_CID, 0);

  const ok = Boolean(noob) && Boolean(username) && factionCid > 0;
  if (!ok) {
    throw new Error(
      `onboarding incomplete (noob=${Boolean(noob)} username=${Boolean(username)} factionCid=${factionCid}). Complete mint/username/faction before dungeons.`
    );
  }
  if (report) report.preRun.onboarding = true;
}

async function ensureEnergy(config: RunnerConfig, report?: RunReport) {
  const addr = address();
  const cache = readRomAmountCache();

  const read = async () => {
    const { res, json } = await apiGet(`/offchain/player/energy/${addr}`, false);
    if (!res.ok) throw new Error(`energy read failed: ${res.status}`);
    return toInt(json?.entities?.[0]?.parsedData?.energyValue, 0);
  };

  let energy = await read();
  if (report) report.preRun.energyStart = energy;
  if (energy >= config.energyThreshold) return;

  for (const romId of ROM_ORDER) {
    const cached = cache[String(romId)];
    const candidates = [
      ...(cached ? [cached] : []),
      ...ROM_AMOUNT_CANDIDATES.filter((x) => x !== cached),
    ];

    let tries = 0;
    for (const amount of candidates) {
      if (tries >= ROM_MAX_TRIES_PER_ROM) break;
      tries++;

      const before = energy;
      const claim = await apiPost('/roms/factory-claim', { romId, claimId: 'energy', amount });
      void claim;

      await sleep(250);
      const after = await read();
      if (report) report.preRun.romClaims.push({ romId: String(romId), amountTried: amount, energyBefore: before, energyAfter: after });
      energy = after;

      if (energy > before) {
        cache[String(romId)] = amount;
        writeRomAmountCache(cache);
      }

      if (energy >= config.energyThreshold) return;

      // If energy didn't move, try next amount for this ROM.
    }
  }

  throw new Error(`insufficient energy: ${energy}/${config.energyThreshold} (dungeon=${config.dungeon} juiced=${config.juiced})`);
}

async function repairGate(report?: RunReport) {
  const addr = address();
  const { res, json } = await apiGet(`/gear/instances/${addr}`, true);
  if (!res.ok) throw new Error(`gear instances failed: ${res.status}`);

  const entities: any[] = json?.entities ?? json?.data ?? [];

  for (const it of entities) {
    const parsed = it?.parsedData ?? {};

    const docId: string = it?.docId ?? it?.id ?? it?._id ?? parsed?.docId ?? '';
    const durability = toInt(it?.DURABILITY_CID ?? parsed?.DURABILITY_CID ?? parsed?.durability, 1);
    const repairCount = toInt(it?.REPAIR_COUNT_CID ?? parsed?.REPAIR_COUNT_CID ?? parsed?.repairCount, 0);

    // Equipped gate: only equipped items should be considered for repair.
    // Prefer explicit equipped slot, fall back to IS_EQUIPPED_CID when present.
    const slot = toInt(it?.EQUIPPED_TO_SLOT_CID ?? parsed?.EQUIPPED_TO_SLOT_CID, -1);
    const equipped = slot > 0 || it?.IS_EQUIPPED_CID === true || parsed?.IS_EQUIPPED_CID === true;

    if (!equipped) continue;
    if (durability !== 0) continue;

    if (CONDITIONAL_REPAIR_SKIP_DOC_IDS.has(docId) && repairCount >= 2) continue;

    const rr = await apiPost('/gear/repair', { gearInstanceId: docId });
    if (!rr.res.ok) {
      throw new Error(`repair failed for ${docId}: ${rr.res.status} ${rr.text.slice(0, 200)}`);
    }
    if (report) report.preRun.repairs.push(docId);

    await sleep(200);
  }
}

async function dungeonState() {
  const { res, json } = await apiGet('/game/dungeon/state', true);
  if (!res.ok) throw new Error(`dungeon state failed: ${res.status}`);
  return json;
}

function parseExpectedToken(text: string): string | number | undefined {
  // Common error shape: "Invalid action token 0 != 1773135580092"
  const m = text.match(/Invalid action token\s+\d+\s*!=\s*(\d+)/i);
  if (m?.[1]) return m[1];
  return undefined;
}

async function doAction(
  config: RunnerConfig,
  action: string,
  actionToken: string | number | undefined,
  report?: RunReport
) {
  const payload: any = {
    action,
    dungeonId: config.dungeonId,
    actionToken: actionToken ?? 0,
    data: {},
  };

  const first = await apiPost('/game/dungeon/action', payload);
  if (first.res.ok) return first;

  // Recovery: retry once using a trusted token source.
  // Prefer explicit token field; if it is missing/0, parse the expected token from message when available.
  let serverToken = extractActionToken(first.json);
  if (serverToken == null || serverToken === 0 || serverToken === '0') {
    serverToken = parseExpectedToken(first.text);
  }

  if (serverToken == null) {
    throw new Error(`action failed (${action}) without recoverable token: ${first.res.status} ${first.text.slice(0, 240)}`);
  }

  if (report) {
    // mark that this step required token recovery
    const last = report.snapshots[report.snapshots.length - 1];
    if (last && last.action === action && !last.tokenRecovery) last.tokenRecovery = { usedToken: serverToken };
  }

  payload.actionToken = serverToken;
  const second = await apiPost('/game/dungeon/action', payload);
  if (!second.res.ok) {
    throw new Error(`action failed (${action}) after recovery: ${second.res.status} ${second.text.slice(0, 240)}`);
  }
  return second;
}

async function startRun(config: RunnerConfig) {
  const payload = {
    action: 'start_run',
    dungeonId: config.dungeonId,
    actionToken: '',
    data: {
      consumables: [],
      itemId: 0,
      expectedAmount: 0,
      index: 0,
      isJuiced: config.juiced,
      gearInstanceIds: [],
    },
  };

  const first = await apiPost('/game/dungeon/action', payload);
  if (first.res.ok) return first;

  const serverToken = extractActionToken(first.json);
  if (serverToken == null) {
    throw new Error(`start_run failed without server token: ${first.res.status} ${first.text.slice(0, 240)}`);
  }

  (payload as any).actionToken = serverToken;
  const second = await apiPost('/game/dungeon/action', payload);
  if (!second.res.ok) {
    throw new Error(`start_run failed after recovery: ${second.res.status} ${second.text.slice(0, 240)}`);
  }
  return second;
}

function parseArgs(): RunnerConfig {
  const argv = process.argv.slice(2);
  const get = (k: string) => {
    const i = argv.indexOf(k);
    if (i === -1) return undefined;
    return argv[i + 1];
  };

  const dungeonRaw = (get('--dungeon') ?? 'underhaul').toLowerCase();
  const dungeon: DungeonKey = dungeonRaw === '5000' ? '5000' : 'underhaul';
  const juiced = argv.includes('--juiced');

  const dungeonId = dungeon === 'underhaul' ? 3 : 1;
  const energyThreshold = juiced ? 120 : 40;

  return { dungeon, dungeonId, juiced, energyThreshold };
}

async function main() {
  const config = parseArgs();

  const report: RunReport = {
    dungeon: config.dungeon,
    juiced: config.juiced,
    startedFresh: false,
    resumed: false,
    preRun: {
      onboarding: false,
      energyThreshold: config.energyThreshold,
      romClaims: [],
      repairs: [],
    },
    snapshots: [],
  };

  // Step 1: active run gate
  let st = await dungeonState();
  let run = getRun(st);
  if (run) report.resumed = true;

  // Step 2-7: pre-run gates only if no active run
  if (!run) {
    await ensureOnboarding(report);
    await ensureEnergy(config, report);
    await repairGate(report);

    // state recheck (race safety)
    st = await dungeonState();
    run = getRun(st);

    if (!run) {
      report.startedFresh = true;
      await startRun(config);
      st = await dungeonState();
      run = getRun(st);
      if (!run) throw new Error('start_run reported success but no active run is visible in state');
    }
  }

  // Battle loop: continue until run is null.
  let token: any = extractActionToken(st) ?? 0;

  let lootCount = 0;
  let battleCount = 0;

  for (let steps = 0; steps < 700; steps++) {
    const state = await dungeonState();
    const r = getRun(state);
    if (!r) {
      report.summary = { result: 'completed', battleCount, lootCount };
      console.log(JSON.stringify(report));
      return;
    }

    const snap = snapshotFromRun(r);
    const action = chooseAction(config, r);

    report.snapshots.push({
      step: steps,
      lootPhase: snap.lootPhase,
      action,
      myHp: snap.myHp,
      myShield: snap.myShield,
      enemyHp: snap.enemyHp,
      enemyShield: snap.enemyShield,
      charges: snap.charges,
      lootOptions: snap.lootOptions,
    });

    const resp = await doAction(config, action, token, report);
    token = extractActionToken(resp.json) ?? token;

    if (action.startsWith('loot_')) lootCount++;
    else battleCount++;

    // anti-spam window: keep small delays; no concurrency.
    await sleep(380);
  }

  report.summary = { result: 'aborted', battleCount, lootCount };
  console.log(JSON.stringify(report));
  throw new Error('max steps reached; run likely stuck; inspect /game/dungeon/state');
}

main().catch((e) => {
  console.error(e?.message ?? String(e));
  process.exit(1);
});
