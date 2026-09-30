/**
 * Operator-only: walk the canonical AGNT DLMM pool price to the DAMM v2 market
 * price and seed two-sided liquidity there.
 *
 * DLMM price convention: price_human(SOL/AGNT) = 1.0025^bin * 1e-3, so the
 * market center bin is ln(price*1e3)/ln(1.0025) (~ -3956, NOT -6723).
 * A pool's activeId only moves via swaps, and an on-chain swap can only cross
 * ~hundreds of empty bins per transaction (compute limit), so the walk uses
 * small "anchor" X positions every ~380 bins that get consumed one by one.
 *
 * Phases (all on Devnet, operator keypair from PRIVATE_KEY outside the repo):
 *   1. remove + close every operator position on the pool
 *   2. seed 70-bin X-only anchor positions every 380 bins from the active bin
 *      up to the market range (tiny amounts, rent recovered on close)
 *   3. swap Y->X through the anchors until activeId reaches the market range
 *   4. seed the main X position at [center-10 .. center+59] and finish the walk
 *      with small swaps; the SOL spent becomes the pool's Y-side depth
 *   5. seed a Y-only top-up position just below center
 *   6. verify: 0.01 SOL quote should return ~market AGNT amount
 *
 * Usage:
 *   node scripts/walk-dlmm-price.cjs             # dry-run plan only
 *   node scripts/walk-dlmm-price.cjs --execute   # run everything
 *   node scripts/walk-dlmm-price.cjs --execute --phase 3   # resume at phase
 */

const { readFileSync } = require("node:fs");
const { homedir } = require("node:os");
const { Connection, ComputeBudgetProgram, Keypair, LAMPORTS_PER_SOL, PublicKey, Transaction } = require("@solana/web3.js");
const { CpAmm } = require("@meteora-ag/cp-amm-sdk");
const DLMM = require("@meteora-ag/dlmm").default || require("@meteora-ag/dlmm");
const BN = require("bn.js");

const DEVNET_RPC = "https://api.devnet.solana.com";
const DLMM_POOL = new PublicKey("GxtUfNFw9DgCnHNsajKaJY6FmNKFPwGfzvLF5kXSykPV");
const DAMM_POOL = new PublicKey("Aw25voQXKLu5pswW5srxnfxyaLGQjxZRRFZmz7QEkREw");
const WSOL = new PublicKey("So11111111111111111111111111111111111111112");
const AGNT_MINT = new PublicKey("7AZLo4es23WHtseYrhH2ScPJ1LtRb8Qk5pPGCqyRiji9");
const OPERATOR = "D92g759nWqyjjjwJxJ32KswzEupBHZKYRdJ8RMuv12Cn";
const DEFAULT_ENV_PATH = `${homedir()}/Documents/AgentBond/meteora-invent/studio/.env`;

const BIN_STEP = 25; // bps -> 0.25% per bin
const AGNT_DECIMALS = 6;
const ANCHOR_GAP = 380; // bins between anchors (compute-safe walk distance)
const ANCHOR_WIDTH = 70; // bins per anchor position (one binArray)
const ANCHOR_X_AGNT = 1_000; // AGNT per anchor
const MAIN_LOW = 10; // main position starts at center - 10
const MAIN_WIDTH = 70;
const MAIN_X_AGNT = 11_000_000;
const TOPUP_Y_SOL = 0.3;
const WALK_SWAP_SOL = 0.03;

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] ? Number(args[index + 1]) : fallback;
};
const EXECUTE = flag("execute");
const PHASE = option("phase", 1);

function loadOperatorKeypair() {
  const envFile = readFileSync(DEFAULT_ENV_PATH, "utf8");
  const match = envFile.match(/^PRIVATE_KEY\s*=\s*["']?([^"'\r\n]+)["']?\s*$/m);
  if (!match) throw new Error(`PRIVATE_KEY not found in ${DEFAULT_ENV_PATH}`);
  const raw = match[1].trim();
  let secret;
  if (raw.startsWith("[")) secret = new Uint8Array(JSON.parse(raw));
  else if (/^[0-9a-fA-F]{128}$/.test(raw)) secret = new Uint8Array(raw.match(/.{2}/g).map(b => parseInt(b, 16)));
  else secret = decodeBase58(raw);
  const keypair = Keypair.fromSecretKey(secret.length === 64 ? secret : secret.slice(0, 64));
  if (keypair.publicKey.toBase58() !== OPERATOR) {
    throw new Error(`env keypair ${keypair.publicKey.toBase58()} is not the operator; refusing`);
  }
  return keypair;
}

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function decodeBase58(input) {
  const bytes = [0];
  for (const char of input) {
    const value = B58.indexOf(char);
    if (value < 0) throw new Error(`invalid base58: ${JSON.stringify(char)}`);
    let carry = value;
    for (let i = 0; i < bytes.length; i += 1) {
      carry += bytes[i] * 58;
      bytes[i] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) { bytes.push(carry & 0xff); carry >>= 8; }
  }
  for (let i = 0; input[i] === "1" && i < input.length - 1; i += 1) bytes.push(0);
  return new Uint8Array(bytes.reverse());
}

async function sendAndConfirm(connection, operator, transactions, label, extraSigners = []) {
  const signatures = [];
  for (const [index, transaction] of transactions.entries()) {
    transaction.feePayer = operator.publicKey;
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
    transaction.recentBlockhash = blockhash;
    // tx.signatures is empty until compile; inspect the instructions to learn
    // which of our keypairs this specific transaction actually requires.
    const required = new Set(
      transaction.instructions.flatMap(ix => ix.keys.filter(meta => meta.isSigner).map(meta => meta.pubkey.toBase58()))
    );
    const needed = extraSigners.filter(kp => required.has(kp.publicKey.toBase58()));
    transaction.partialSign(...needed, operator);
    const signature = await connection.sendRawTransaction(transaction.serialize());
    await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, "confirmed");
    signatures.push(signature);
    console.log(`  [${label}] tx ${index + 1}/${transactions.length}: ${signature}`);
  }
  return signatures;
}

function distributionFor(range, xSide // "x" | "y" — which side gets the 10000 bps
) {
  const [low, high] = range;
  const bins = [];
  for (let bin = low; bin <= high; bin += 1) bins.push(bin);
  const share = Math.floor(10_000 / bins.length);
  const remainder = 10_000 - share * bins.length;
  return bins.map((binId, index) => {
    const amount = share + (index < remainder ? 1 : 0);
    return {
      binId,
      xAmountBpsOfTotal: new BN(xSide === "x" ? amount : 0),
      yAmountBpsOfTotal: new BN(xSide === "y" ? amount : 0),
    };
  });
}

async function seedPosition(connection, dlmm, operator, range, side, totalXAgnt, totalYSol) {
  const positionKeypair = Keypair.generate();
  const addTxs = await dlmm.initializePositionAndAddLiquidityByWeight({
    positionPubKey: positionKeypair.publicKey,
    totalXAmount: new BN(Math.round(totalXAgnt * 10 ** AGNT_DECIMALS)),
    totalYAmount: new BN(Math.round(totalYSol * LAMPORTS_PER_SOL)),
    xYAmountDistribution: distributionFor(range, side),
    user: operator.publicKey,
    slippage: 100,
  });
  const transactions = Array.isArray(addTxs) ? addTxs : [addTxs];
  await sendAndConfirm(connection, operator, transactions, `seed ${side} [${range[0]}..${range[1]}]`, [positionKeypair]);
  return positionKeypair.publicKey;
}

async function removePosition(connection, dlmm, operator, entry) {
  const bins = entry.positionData.positionBinData ?? [];
  const removeTxs = await dlmm.removeLiquidity({
    user: operator.publicKey,
    position: entry.publicKey,
    fromBinId: bins[0]?.binId,
    toBinId: bins[bins.length - 1]?.binId,
    bps: new BN(10_000),
    shouldClaimAndClose: true,
  });
  await sendAndConfirm(connection, operator, Array.isArray(removeTxs) ? removeTxs : [removeTxs], "remove");
}

async function swapYToX(connection, dlmm, operator, inLamports) {
  const fresh = await DLMM.create(connection, DLMM_POOL);
  const binArrays = await fresh.getBinArrays();
  const quote = fresh.swapQuote(new BN(inLamports), false, new BN(500), binArrays, true);
  if (quote.outAmount.isZero()) return { filled: false };
  const swapTxs = await fresh.swap({
    lbPair: DLMM_POOL,
    user: operator.publicKey,
    inToken: WSOL,
    outToken: AGNT_MINT,
    inAmount: new BN(inLamports),
    minOutAmount: quote.minOutAmount,
    binArraysPubkey: quote.binArraysPubkey ?? binArrays.map(b => b.publicKey),
  });
  console.log(`    [debug] swap() returned: ${typeof swapTxs} ${Array.isArray(swapTxs) ? `array(${swapTxs.length})` : swapTxs?.constructor?.name}`);
  const transactions = Array.isArray(swapTxs) ? swapTxs : [swapTxs];
  // The SDK already prepends its own compute-unit-limit instruction.
  await sendAndConfirm(connection, operator, transactions, "walk");
  return { filled: true };
}

async function getOperatorPositions(connection, dlmm) {
  const res = await dlmm.getPositionsByUserAndLbPair(operatorPublicKey());
  return res.userPositions ?? [];
}
let cachedOperator = null;
function operatorPublicKey() {
  if (!cachedOperator) throw new Error("operator not loaded");
  return cachedOperator;
}

async function main() {
  if (!DEVNET_RPC.includes("devnet")) throw new Error("refusing to run outside Devnet");
  const connection = new Connection(DEVNET_RPC, "confirmed");
  const operator = loadOperatorKeypair();
  cachedOperator = operator.publicKey;
  console.log(`operator: ${operator.publicKey.toBase58()} balance: ${(await connection.getBalance(operator.publicKey) / LAMPORTS_PER_SOL).toFixed(4)} SOL`);

  // Market price + center bin (price_human = 1.0025^bin * 1e-3).
  const cpAmm = new CpAmm(connection);
  const dammState = await cpAmm.fetchPoolState(DAMM_POOL);
  const probe = 1000;
  const dammQuote = cpAmm.getQuote({
    inAmount: new BN(probe),
    inputTokenMint: WSOL,
    slippage: 0.01,
    poolState: dammState,
    currentTime: Math.floor(Date.now() / 1000),
    currentSlot: await connection.getSlot(),
  });
  const agntRawPerLamport = Number(dammQuote.swapOutAmount.toString()) / probe;
  const spotSolPerAgnt = 1 / (agntRawPerLamport * 1e3);
  const centerBin = Math.round(Math.log(spotSolPerAgnt * 1e3) / Math.log(1 + BIN_STEP / 10_000));
  console.log(`market: 1 SOL = ${Math.round(agntRawPerLamport * 1e3).toLocaleString()} AGNT -> center bin ${centerBin}`);

  let dlmm = await DLMM.create(connection, DLMM_POOL);
  let activeId = dlmm.lbPair.activeId;
  console.log(`current activeId: ${activeId} (price ${(Math.pow(1.0025, activeId) * 1e-3).toExponential(3)} SOL/AGNT)`);

  // Phase 1: clear all operator positions.
  if (PHASE <= 1 && EXECUTE) {
    const positions = await getOperatorPositions(connection, dlmm);
    console.log(`\n[1] clearing ${positions.length} operator position(s)`);
    for (const entry of positions) await removePosition(connection, dlmm, operator, entry);
  }

  // Phase 2: seed walk anchors (X-only) from the active bin up to the range.
  const firstAnchorLow = MAIN_LOW + centerBin - ANCHOR_GAP;
  if (PHASE <= 2 && EXECUTE) {
    console.log(`\n[2] seeding anchors every ${ANCHOR_GAP} bins below ${MAIN_LOW + centerBin}`);
    for (let low = firstAnchorLow; low + ANCHOR_WIDTH - 1 >= activeId - ANCHOR_WIDTH; low -= ANCHOR_GAP) {
      const high = low + ANCHOR_WIDTH - 1;
      if (low < activeId) continue; // anchors must sit above the active bin
      await seedPosition(connection, dlmm, operator, [low, high], "x", ANCHOR_X_AGNT, 0);
      dlmm = await DLMM.create(connection, DLMM_POOL);
    }
  }

  // Phase 3: main X position at the market range (skip if already seeded).
  if (PHASE <= 3 && EXECUTE) {
    const mainLow = centerBin - MAIN_LOW;
    const mainHigh = mainLow + MAIN_WIDTH - 1;
    dlmm = await DLMM.create(connection, DLMM_POOL);
    const positions = await getOperatorPositions(connection, dlmm);
    const mainExists = positions.some(entry => {
      const bins = entry.positionData.positionBinData ?? [];
      return bins.length && bins[0].binId <= mainLow && bins[bins.length - 1].binId >= mainHigh;
    });
    if (mainExists) {
      console.log(`\n[3] main position [${mainLow}..${mainHigh}] already seeded`);
    } else {
      console.log(`\n[3] seeding main X position [${mainLow}..${mainHigh}] with ${MAIN_X_AGNT.toLocaleString()} AGNT`);
      await seedPosition(connection, dlmm, operator, [mainLow, mainHigh], "x", MAIN_X_AGNT, 0);
    }
  }

  // Phase 4: unified walk to the market center. Each swap consumes roughly the
  // next 250 bins of X (capped so the walk stops at center-2), keeping every
  // transaction inside the compute-unit budget.
  if (PHASE <= 4 && EXECUTE) {
    console.log("\n[4] walking price to market center");
    const MAX_SPAN = 700; // max total bins crossed per swap (CU budget)
    const stopBin = centerBin - 2;
    for (let step = 0; step < 60; step += 1) {
      dlmm = await DLMM.create(connection, DLMM_POOL);
      activeId = dlmm.lbPair.activeId;
      if (activeId >= stopBin) break;
      const positions = await getOperatorPositions(connection, dlmm);
      const ahead = new Map();
      for (const entry of positions) {
        for (const bin of entry.positionData.positionBinData ?? []) {
          const x = Number(bin.positionXAmount ?? 0);
          if (x > 0 && bin.binId >= activeId && bin.binId <= stopBin && bin.binId <= activeId + MAX_SPAN) {
            ahead.set(bin.binId, (ahead.get(bin.binId) ?? 0) + x);
          }
        }
      }
      const binIds = [...ahead.keys()].sort((a, b) => a - b);
      if (!binIds.length) {
        console.log("  no X liquidity ahead; aborting walk");
        break;
      }
      let inRaw = new BN(0);
      for (const binId of binIds) {
        const priceRaw = Math.pow(1 + BIN_STEP / 10_000, binId);
        inRaw = inRaw.add(new BN(Math.floor(ahead.get(binId) * priceRaw)));
      }
      inRaw = inRaw.mul(new BN(96)).div(new BN(100));
      if (inRaw.isZero()) {
        console.log("  chunk input rounds to zero; aborting walk");
        break;
      }
      console.log(`  activeId ${activeId}: consume ${binIds.length} bins (${binIds[0]}..${binIds[binIds.length - 1]}) with ${inRaw.toString()} lamports`);
      const result = await swapYToX(connection, dlmm, operator, inRaw.toNumber());
      if (!result.filled) {
        console.log("  no fillable liquidity; stopping walk");
        break;
      }
    }
  }

  // Phase 5: Y-side top-up just below center.
  if (PHASE <= 5 && EXECUTE) {
    dlmm = await DLMM.create(connection, DLMM_POOL);
    console.log(`\n[5] Y top-up [${centerBin - 30}..${centerBin - 11}] with ${TOPUP_Y_SOL} SOL`);
    await seedPosition(connection, dlmm, operator, [centerBin - 30, centerBin - 11], "y", 0, TOPUP_Y_SOL);
  }

  // Phase 6: verification.
  console.log("\n[6] verification");
  dlmm = await DLMM.create(connection, DLMM_POOL);
  activeId = dlmm.lbPair.activeId;
  const binArrays = await dlmm.getBinArrays();
  console.log(`activeId: ${activeId} (price ${(Math.pow(1.0025, activeId) * 1e-3).toExponential(4)} SOL/AGNT vs market ${spotSolPerAgnt.toExponential(3)})`);
  try {
    const q = dlmm.swapQuote(new BN(10_000_000), false, new BN(100), binArrays);
    console.log(`0.01 SOL -> ${(Number(q.outAmount.toString()) / 10 ** AGNT_DECIMALS).toLocaleString(undefined, { maximumFractionDigits: 0 })} AGNT (DLMM venue)`);
  } catch (error) {
    console.log(`quote still failing: ${error.message}`);
  }
}

main().catch(error => {
  console.error("walk failed:", error.message ?? error);
  process.exit(1);
});
