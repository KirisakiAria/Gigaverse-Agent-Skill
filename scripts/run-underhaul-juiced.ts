#!/usr/bin/env node
/*
  Juiced Underhaul runner (headless).

  Guarantees:
  - Enforces pre-run checklist order: active-run gate → energy gate (+ ROM claims) → repair gate → state recheck → start_run
  - Uses atomic actionToken chaining; on 400, retries once using server-provided actionToken.
  - Single-flight: no concurrent actions.

  Usage:
    cd skills/gigaverse/scripts
    npm ci
    npx ts-node ./run-underhaul-juiced.ts

  JWT source:
    - env GIGAVERSE_JWT (raw token, without "Bearer ")
    - or ~/.secrets/gigaverse-jwt.txt
*/

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const BASE = 'https://gigaverse.io/api';
const DUNGEON_ID = 3; // Underhaul
const ENERGY_THRESHOLD = 120; // juiced / 3x
const ROM_ORDER = ['3760', '7514', '1044', '4071', '793', '1706', '2792'] as const;

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
    (() => {
      try {
        const p = join(process.cwd(), '..', 'credentials', 'jwt.txt');
        const s = readFileSync(p, 'utf8').trim();
        return s.length ? s : undefined;
      } catch {
        return undefined;
      }
    })() ??
    readSecret('gigaverse-jwt.txt');

  if (!v) {
    throw new Error(
      'Missing JWT. Set GIGAVERSE_JWT, or create skills/gigaverse/credentials/jwt.txt, or ~/.secrets/gigaverse-jwt.txt'
    );
  }

  return v.replace(/^Bearer\\s+/i, '').trim();
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

function chooseAction(run: any): 'rock' | 'paper' | 'scissor' | 'loot_one' {
  if (run.lootPhase) return 'loot_one';

  const me = run.players?.[0];
  const enemy = run.players?.[1];

  const myHp = toInt(me?.health?.current, 0);
  const myShield = toInt(me?.shield?.current, 0);
  const enemyHp = toInt(enemy?.health?.current, 0);
  const enemyShield = toInt(enemy?.shield?.current, 0);

  const charges = currentCharges(run);
  const available = (a: 'rock' | 'paper' | 'scissor') => toInt((charges as any)[a], 0) > 0;

  // Underhaul policy: paper-first stabilization; only convert with rock when safe.
  let preferred: 'rock' | 'paper' | 'scissor' = 'paper';

  if (myHp <= 10) preferred = 'paper';
  else if (myShield === 0 && myHp <= 20) preferred = 'paper';
  else if (enemyHp >= 24 && enemyShield >= 13 && (myShield <= 5 || myHp <= 25)) preferred = 'paper';
  else if (enemyShield === 0 && enemyHp <= 12) preferred = myShield > 0 || myHp > 12 ? 'rock' : 'paper';
  else if (enemyShield >= 10) preferred = 'paper';
  else if (enemyShield === 0 && enemyHp > 12) preferred = myShield > 0 && myHp > 12 ? 'rock' : 'paper';

  const order: Array<'rock' | 'paper' | 'scissor'> =
    preferred === 'rock' ? ['rock', 'paper', 'scissor'] : [preferred, 'scissor', 'rock'];

  for (const a of order) {
    if (available(a)) return a;
  }

  // If somehow all are exhausted, pick rock (server may still accept).
  return 'rock';
}

async function ensureEnergy() {
  const addr = address();
  const cache = readRomAmountCache();

  const read = async () => {
    const { res, json } = await apiGet(`/offchain/player/energy/${addr}`, false);
    if (!res.ok) throw new Error(`energy read failed: ${res.status}`);
    return toInt(json?.entities?.[0]?.parsedData?.energyValue, 0);
  };

  let energy = await read();
  if (energy >= ENERGY_THRESHOLD) return;

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
      const claim = await apiPost('/roms/factory-claim', {
        romId,
        claimId: 'energy',
        amount,
      });

      void claim;

      await sleep(250);
      energy = await read();

      if (energy > before) {
        cache[String(romId)] = amount;
        writeRomAmountCache(cache);
      }

      if (energy >= ENERGY_THRESHOLD) return;
    }
  }

  throw new Error(`insufficient energy for juiced underhaul: ${energy}/${ENERGY_THRESHOLD}`);
}

async function repairGate() {
  const addr = address();
  const { res, json } = await apiGet(`/gear/instances/${addr}`, true);
  if (!res.ok) throw new Error(`gear instances failed: ${res.status}`);

  const entities: any[] = json?.entities ?? json?.data ?? [];

  for (const it of entities) {
    const parsed = it?.parsedData ?? {};

    const docId: string = it?.docId ?? it?.id ?? it?._id ?? parsed?.docId ?? '';
    const durability = toInt(it?.DURABILITY_CID ?? parsed?.DURABILITY_CID ?? parsed?.durability, 1);
    const repairCount = toInt(it?.REPAIR_COUNT_CID ?? parsed?.REPAIR_COUNT_CID ?? parsed?.repairCount, 0);

    // Conservative: treat as equipped if slot/index exists.
    const equipped =
      it?.EQUIPPED_TO_SLOT_CID != null ||
      parsed?.EQUIPPED_TO_SLOT_CID != null ||
      it?.IS_EQUIPPED_CID === true ||
      parsed?.IS_EQUIPPED_CID === true;

    if (!equipped) continue;
    if (durability !== 0) continue;

    if (CONDITIONAL_REPAIR_SKIP_DOC_IDS.has(docId) && repairCount >= 2) continue;

    const rr = await apiPost('/gear/repair', { gearInstanceId: docId });
    if (!rr.res.ok) {
      throw new Error(`repair failed for ${docId}: ${rr.res.status} ${rr.text.slice(0, 200)}`);
    }

    await sleep(200);
  }
}

async function dungeonState() {
  const { res, json } = await apiGet('/game/dungeon/state', true);
  if (!res.ok) throw new Error(`dungeon state failed: ${res.status}`);
  return json;
}

async function doAction(action: string, actionToken: string | number | undefined) {
  const payload: any = {
    action,
    dungeonId: DUNGEON_ID,
    actionToken: actionToken ?? 0,
    data: {},
  };

  const first = await apiPost('/game/dungeon/action', payload);
  if (first.res.ok) return first;

  // Recovery: if server returns a fresh token, retry once with it.
  const serverToken = extractActionToken(first.json);
  if (serverToken == null) {
    throw new Error(`action failed (${action}) without server token: ${first.res.status} ${first.text.slice(0, 240)}`);
  }

  payload.actionToken = serverToken;
  const second = await apiPost('/game/dungeon/action', payload);
  if (!second.res.ok) {
    throw new Error(`action failed (${action}) after recovery: ${second.res.status} ${second.text.slice(0, 240)}`);
  }
  return second;
}

async function startRun() {
  const payload = {
    action: 'start_run',
    dungeonId: DUNGEON_ID,
    actionToken: '',
    data: {
      consumables: [],
      itemId: 0,
      expectedAmount: 0,
      index: 0,
      isJuiced: true,
      gearInstanceIds: [],
    },
  };

  const first = await apiPost('/game/dungeon/action', payload);
  if (first.res.ok) return first;

  const serverToken = extractActionToken(first.json);
  if (serverToken == null) {
    throw new Error(`start_run failed without server token: ${first.res.status} ${first.text.slice(0, 240)}`);
  }

  payload.actionToken = serverToken as any;
  const second = await apiPost('/game/dungeon/action', payload);
  if (!second.res.ok) {
    throw new Error(`start_run failed after recovery: ${second.res.status} ${second.text.slice(0, 240)}`);
  }
  return second;
}

async function main() {
  // Step 1: active run gate
  let st = await dungeonState();
  let run = getRun(st);

  // Step 2-7: pre-run gates only if no active run
  if (!run) {
    await ensureEnergy();
    await repairGate();

    // state recheck (race safety)
    st = await dungeonState();
    run = getRun(st);

    if (!run) {
      await startRun();
      st = await dungeonState();
      run = getRun(st);
      if (!run) throw new Error('start_run reported success but no active run is visible in state');
    }
  }

  // Battle loop: continue until run is null.
  let token: any = extractActionToken(st) ?? 0;

  for (let steps = 0; steps < 600; steps++) {
    const state = await dungeonState();
    const r = getRun(state);
    if (!r) {
      console.log(JSON.stringify({ result: 'completed' }));
      return;
    }

    const action = chooseAction(r);
    const resp = await doAction(action, token);
    token = extractActionToken(resp.json) ?? token;

    // anti-spam window: keep small delays; no concurrency.
    await sleep(380);
  }

  throw new Error('max steps reached; run likely stuck; inspect /game/dungeon/state');
}

main().catch((e) => {
  console.error(String(e?.message ?? e));
  process.exit(1);
});
