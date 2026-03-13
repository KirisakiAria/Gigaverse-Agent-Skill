#!/usr/bin/env npx ts-node
/**
 * Purchase GigaJuice subscription
 * 
 * Usage: npx ts-node purchase-juice.ts [listingId]
 *   listingId: 2 = JUICE BOX (30d, 0.01 ETH)
 *              3 = JUICE CARTON (90d, 0.023 ETH)
 *              4 = JUICE TANK (180d, 0.038 ETH)
 */

import { createWalletClient, http, parseEther, encodeFunctionData, defineChain } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

function readSecret(name: string): string | undefined {
  try {
    const p = join(homedir(), '.secrets', name);
    const v = readFileSync(p, 'utf8').trim();
    return v.length ? v : undefined;
  } catch {
    return undefined;
  }
}

// Abstract Mainnet chain definition
const abstractMainnet = defineChain({
  id: 2741,
  name: 'Abstract',
  nativeCurrency: {
    decimals: 18,
    name: 'Ether',
    symbol: 'ETH',
  },
  rpcUrls: {
    default: { http: ['https://api.mainnet.abs.xyz'] },
  },
  blockExplorers: {
    default: { name: 'Abscan', url: 'https://abscan.org' },
  },
});

// GigaJuice contract
const GIGAJUICE_CONTRACT = '0xd154ab0de91094bfa8e87808f9a0f7f1b98e1ce1' as const;

// Listing prices (ETH)
const LISTING_PRICES: Record<number, string> = {
  2: '0.01',    // JUICE BOX - 30 days
  3: '0.023',   // JUICE CARTON - 90 days
  4: '0.038',   // JUICE TANK - 180 days
};

const LISTING_NAMES: Record<number, string> = {
  2: 'JUICE BOX (30 days)',
  3: 'JUICE CARTON (90 days)',
  4: 'JUICE TANK (180 days)',
};

// ABI for purchaseGigaJuice function
const GIGAJUICE_ABI = [
  {
    name: 'purchaseGigaJuice',
    type: 'function',
    stateMutability: 'payable',
    inputs: [{ name: 'listingId', type: 'uint256' }],
    outputs: [],
  },
] as const;

async function purchaseJuice(listingId: number) {
  // Private key source of truth is the local secrets file.
  // Env var remains supported as an override for CI/one-offs.
  const privateKey = process.env.NOOB_PRIVATE_KEY ?? readSecret('gigaverse-private-key.txt');
  if (!privateKey) {
    throw new Error('Missing private key. Set NOOB_PRIVATE_KEY or create ~/.secrets/gigaverse-private-key.txt');
  }

  const price = LISTING_PRICES[listingId];
  const name = LISTING_NAMES[listingId];
  
  if (!price || !name) {
    throw new Error(`Invalid listingId: ${listingId}. Valid options: 2, 3, 4`);
  }

  console.log(`🧃 Purchasing ${name} for ${price} ETH...`);

  const account = privateKeyToAccount(privateKey as `0x${string}`);
  console.log(`📍 Wallet: ${account.address}`);

  const client = createWalletClient({
    account,
    chain: abstractMainnet,
    transport: http('https://api.mainnet.abs.xyz'),
  });

  // Encode the function call
  const data = encodeFunctionData({
    abi: GIGAJUICE_ABI,
    functionName: 'purchaseGigaJuice',
    args: [BigInt(listingId)],
  });

  console.log(`📝 Function data: ${data}`);
  console.log(`💰 Sending ${price} ETH to ${GIGAJUICE_CONTRACT}...`);

  try {
    const hash = await client.sendTransaction({
      to: GIGAJUICE_CONTRACT,
      data,
      value: parseEther(price),
    });

    console.log(`✅ Transaction sent!`);
    console.log(`🔗 Hash: ${hash}`);
    console.log(`🔍 Explorer: https://abscan.org/tx/${hash}`);
    
    return hash;
  } catch (error: any) {
    console.error('❌ Transaction failed:', error.message);
    if (error.cause) {
      console.error('Cause:', error.cause);
    }
    throw error;
  }
}

// Main
const listingId = parseInt(process.argv[2] || '2', 10);
purchaseJuice(listingId)
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e?.message ?? String(e));
    process.exit(1);
  });
