// The token radar's model: one snapshot of the protocol universe in, one ranked board out.
//
// The board ranks every protocol that records no token and is not a wrapped, staked or bridged
// product of one that trades -- the watchlist's own rule, applied to the whole snapshot, not just
// the floor. That gives 198 rows: the 40 watchlist slugs plus every other protocol the rule keeps.
// A protocol is pre-token when its record carries no token (no market cap, no CoinGecko id, no
// symbol); live-token protocols are kept apart and shown with the market's own values, never mixed
// into the ranked board.
//
// Implied value is the value of farming the protocol at the stated deposit, not the protocol's
// whole token value. The farm plan is fixed: a $10,000 deposit, $2,000 a month, 6 months
// ($22,000 committed in all). From the snapshot's own figures only:
//
//   token value  = tvl_usd x 0.25 x growthMult x maturityMult
//   growthMult   = 1 + 0.4 x clamp(change_7d, -60, +200) / 100
//   maturityMult = 0.60 + 0.40 x min(age_days, 730) / 730, then past 730 days
//                  x max(0.80, 1 - 0.02 x (age_days - 730) / 365); unknown age = 365 days
//   farmer value = min(3 x $10,000, 5% x token value x ($10,000 / tvl_usd)^0.7)
//
// Why each piece: 0.25 is the token value per dollar of TVL the model assumes; growth rewards a
// protocol whose TVL is rising and discounts one that is shrinking, with the clamp so one wild week
// (+4,448% exists in this snapshot) cannot decide a rank; maturity rises while a protocol proves it
// lasts, then decays slowly past two years, because a protocol listed five years ago with no token
// has had its chance and a protocol listed two weeks ago has proved nothing yet; the farmer's share
// falls as TVL^0.7, not TVL, because competition for points grows slower than TVL -- the big TVL
// includes passive capital that earns no points -- and the 3x-deposit cap stops any row claiming a
// farmer can take more than three times what they put in. On this snapshot no row reaches the cap.
// No protocol name is ever special-cased: the same function scores every row.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them. */
export interface ModelConstants {
  base_multiple: number;
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  maturity_decay_per_year: number;
  maturity_decay_floor: number;
  unknown_age_days: number;
  airdrop_pct: number;
  dilution_exponent: number;
  deposit_usd: number;
  monthly_usd: number;
  months: number;
  deposit_cap_multiple: number;
}

export const MODEL: ModelConstants = {
  base_multiple: 0.25,
  growth_weight: 0.4,
  growth_floor: -60,
  growth_cap: 200,
  maturity_floor: 0.6,
  maturity_range: 0.4,
  maturity_days: 730,
  maturity_decay_per_year: 0.02,
  maturity_decay_floor: 0.8,
  unknown_age_days: 365,
  airdrop_pct: 0.05,
  dilution_exponent: 0.7,
  deposit_usd: 10000,
  monthly_usd: 2000,
  months: 6,
  deposit_cap_multiple: 3,
};

/** The model's version label: the dashboard names it. */
export const MODEL_VERSION = 'radar-2';

/** The deposit the board ranks by, and the cap on what one deposit can claim. */
export const DEPOSIT_CAP_USD = MODEL.deposit_usd * MODEL.deposit_cap_multiple;

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** The deposit levels the deposit curve is drawn at. */
export const DEPOSIT_LEVELS = [100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000];

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  token_value_usd: number;
  farmer_share: number;
  deposit_ratio: number;
  model: {
    base_multiple: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
  why_text: string;
  who_text: string;
}

/** The dashboard's compact view of one row. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  age_days: number | null;
  implied_value_usd: number;
  token_value_usd: number;
  farmer_share: number;
  deposit_ratio: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  farm_steps: string[];
  why_text: string;
  who_text: string;
}

/** A live-token protocol: it already trades, so the board shows the market's own value. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
  symbol: string | null;
}

/** The walk-forward check: the model re-run on the snapshot rewound seven days. */
export interface WalkForward {
  n: number;
  spearman: number;
  top10_overlap: number;
  median_abs_move: number;
  max_abs_move: number;
  max_mover_slug: string;
  max_mover_name: string;
}

/** Everything the dashboard needs: the board, the live set, the model and its checks. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  deposit_cap_usd: number;
  rows: RadarRow[];
  live: LiveRow[];
  walk_forward: WalkForward;
  median_curve: { slug: string; name: string; tvl_usd: number; points: { deposit: number; expected: number }[] };
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The maturity multiplier: rises to 1.00 over the first two years, then decays 2% a year. */
export function maturityMultiplier(age: number | null, model: ModelConstants): number {
  const a = age ?? model.unknown_age_days;
  const base = model.maturity_floor + (Math.min(Math.max(a, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  if (a <= model.maturity_days) return base;
  return base * Math.max(model.maturity_decay_floor, 1 - model.maturity_decay_per_year * ((a - model.maturity_days) / 365));
}

/** The token value and the farmer's value at the stated deposit, for one protocol. */
export function valueOf(
  protocol: SnapshotProtocol,
  asOf: string,
  model: ModelConstants,
  tvlOverride?: number,
  growthOverride?: number,
  ageOverride?: number | null,
): { token: number; farmer: number; share: number; growthPct: number; growthMult: number; maturityMult: number; age: number | null } {
  const tvl = tvlOverride ?? protocol.tvl_usd;
  const age = ageOverride !== undefined ? ageOverride : ageDays(asOf, protocol.listed_at);
  const rawGrowth = growthOverride !== undefined ? growthOverride : finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const maturityMult = maturityMultiplier(age, model);
  const token = tvl * model.base_multiple * growthMult * maturityMult;
  const share = tvl > 0 ? Math.min(1, Math.pow(model.deposit_usd / tvl, model.dilution_exponent)) : 1;
  const farmer = Math.min(DEPOSIT_CAP_USD, Math.max(1, Math.round(token * model.airdrop_pct * share)));
  return { token: Math.round(token), farmer, share, growthPct, growthMult, maturityMult, age };
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Categories the watchlist rule treats as a wrapped, staked or bridged product. */
const EXCLUDED_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);

/** Exchange names the watchlist rule treats as a product of an exchange. */
const EXCHANGE_NAMES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Whether a protocol is one the board may rank: pre-token and not a wrapped, staked or bridged
 * product of a token that trades -- the watchlist's own rule, applied to the whole snapshot. */
export function isRankable(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) return false;
  if (VERSIONED.test(p.name)) return false;
  if (/\b(wrapped|staked|staking)\b/i.test(p.name)) return false;
  if (EXCHANGE_NAMES.some((e) => p.name.startsWith(e))) return false;
  return true;
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;
const fmtInt = (n: number): string => Math.round(n).toLocaleString('en-US');

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug it names, even one the snapshot no longer carries.
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: every other pre-token protocol the watchlist rule keeps, whatever its TVL.
  for (const p of snapshot.protocols) {
    if (!chosen.has(p.slug) && isRankable(p)) chosen.set(p.slug, p);
  }

  const scored = [...chosen.values()].map((p) => {
    const v = valueOf(p, snapshot.as_of, model);
    return { p, ...v };
  });
  scored.sort((a, b) => b.farmer - a.farmer || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token' as const,
    age_days: s.age,
    implied_value_usd: s.farmer,
    token_value_usd: s.token,
    farmer_share: round4(s.share),
    deposit_ratio: round4(s.farmer / model.deposit_usd),
    model: {
      base_multiple: model.base_multiple,
      growth_pct: s.growthPct,
      growth_multiplier: round4(s.growthMult),
      maturity_multiplier: round4(s.maturityMult),
      age_days: s.age,
    },
    farm_steps: farmSteps(s.p, s.age, s.farmer).map(stepText),
    why_text: whyText(s.p, s.age, s.token, s.farmer),
    who_text: whoText(s.p, s.age, s.farmer),
  }));
}

// ------------------------------------------------------------------ farm plans

/** Chains whose gas is a fraction of Ethereum's (layer 2s and fast chains). */
const CHEAP_CHAINS = new Set([
  'Arbitrum', 'Base', 'Optimism', 'Polygon', 'zkSync Era', 'Scroll', 'Linea', 'Blast', 'Ink', 'Mode',
  'Unichain', 'World Chain', 'Robinhood Chain', 'Fraxtal', 'Abstract', 'Soneium', 'Mantle', 'Metis',
  'Gnosis', 'Celo', 'Lisk', 'Berachain', 'Sonic', 'Hyperliquid L1',
]);

/** Gas in dollars per transaction, and the six-month total, by the protocol's first chain. */
function gasFor(chain: string): { setup: number; weekly: number; total: number } {
  const setup = chain === 'Ethereum' ? 8 : CHEAP_CHAINS.has(chain) ? 0.5 : 2;
  const weekly = setup;
  // One setup, five monthly top-ups, and a weekly action for 26 weeks.
  const total = Math.round((setup + 5 * setup + 26 * weekly) * 100) / 100;
  return { setup, weekly, total };
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** One category's playbook: the feature farmed, the first deposit, the weekly action, the risk. */
interface Playbook {
  feature: string;
  deposit: string;
  weekly: string;
  risk: string;
}

const PLAYBOOK: Record<string, Playbook> = {
  'Risk Curators': {
    feature: 'a curator vault',
    deposit: 'Deposit $10,000 into a {N} curator vault on {C} and hold the vault shares',
    weekly: 'allocate or reallocate a small amount between vaults, or vote on a curator proposal',
    risk: 'withdrawing before the vault lock ends, or leaving the vault empty in a snapshot week, can void the position',
  },
  Dexs: {
    feature: 'the main liquidity pool',
    deposit: "Provide $10,000 of liquidity to {N}'s main pool on {C} (a USDC-paired pool) and keep the LP position open",
    weekly: 'swap a small amount through the pool or add a little liquidity',
    risk: 'impermanent loss on a volatile pair, or a pool with no volume in a snapshot week, can shrink or void the position',
  },
  'Onchain Capital Allocator': {
    feature: 'an allocator vault',
    deposit: 'Deposit $10,000 into an {N} allocator vault on {C} and hold the shares',
    weekly: "check the vault's allocation and make one small deposit or rebalance",
    risk: 'a vault that is paused or fully allocated can leave a deposit uncounted, and withdrawing early can void it',
  },
  RWA: {
    feature: 'the yield-bearing asset',
    deposit: "Mint $10,000 of {N}'s yield-bearing asset on {C} and hold it",
    weekly: 'hold the asset and claim any yield it pays; make one small mint or transfer a week to stay active',
    risk: "the underlying asset's redemption window, or moving the asset to a cold wallet, can break the activity trail",
  },
  Lending: {
    feature: 'the lending market',
    deposit: "Supply $10,000 of USDC to {N}'s lending market on {C} and keep the supply open",
    weekly: 'supply or borrow a small amount, or toggle collateral once',
    risk: 'borrowing against the supply adds liquidation risk, and withdrawing the whole supply in one go can void the position',
  },
  Yield: {
    feature: 'the yield vault',
    deposit: "Deposit $10,000 into {N}'s main yield vault on {C} and hold the shares",
    weekly: "claim the vault's yield or add a small top-up",
    risk: 'a vault that migrates strategies can reset points, and withdrawing before a snapshot can void them',
  },
  Derivatives: {
    feature: 'the perpetuals market',
    deposit: 'Deposit $10,000 of USDC as margin on {N} on {C} and open one small hedged position',
    weekly: 'open or close one small hedge, or adjust margin',
    risk: 'leverage can liquidate the margin, and a flat account with no open position can look inactive',
  },
  CDP: {
    feature: 'the collateral vault',
    deposit: 'Lock $10,000 of collateral in a {N} vault on {C} and mint a small amount of its stable asset',
    weekly: "adjust the vault's collateral or repay a little debt",
    risk: 'a collateral ratio below the minimum can liquidate the vault, and an empty vault earns nothing',
  },
  'Yield Aggregator': {
    feature: 'the aggregator vault',
    deposit: "Deposit $10,000 into {N}'s top aggregator vault on {C} and hold the shares",
    weekly: "harvest the vault's yield or move a small amount between strategies",
    risk: 'a strategy that is retired can strand the deposit, and withdrawing between snapshots can void points',
  },
  'Basis Trading': {
    feature: 'the basis vault',
    deposit: "Deposit $10,000 into {N}'s basis vault on {C} and hold the shares",
    weekly: "hold the vault position and check the funding rate; add one small top-up a week",
    risk: 'a negative funding stretch can eat the yield, and an empty vault in a snapshot week earns nothing',
  },
  Chain: {
    feature: "the chain's main app",
    deposit: "Bridge $10,000 to {C} and stake or deposit it in {N}'s main app, then keep the position open",
    weekly: 'make one transaction a week on {C} through the protocol’s app',
    risk: 'bridging the funds away, or leaving them idle on another chain, breaks the trail',
  },
  'Staking Pool': {
    feature: 'the staking pool',
    deposit: "Stake $10,000 through {N}'s staking pool on {C} and keep the receipt token",
    weekly: 'restake the rewards or add a small stake',
    risk: 'an unbonding period can lock the stake past a snapshot, and unstaking early can void the position',
  },
  'Liquidity Manager': {
    feature: 'a managed liquidity position',
    deposit: 'Deposit $10,000 into a {N} managed liquidity position on {C} and keep it open',
    weekly: 'let the manager rebalance, and add a small top-up or collect fees once a week',
    risk: 'a position that drifts out of range stops earning fees and can look inactive',
  },
  'Leveraged Farming': {
    feature: 'a leveraged farm position',
    deposit: 'Open a leveraged farm with $10,000 on {N} on {C} at the lowest leverage the app offers',
    weekly: 'top up collateral or harvest the farm’s rewards',
    risk: 'leverage can liquidate the position in a sharp move, so keep the health factor high',
  },
  Restaking: {
    feature: 'the restaking vault',
    deposit: 'Restake $10,000 through {N} on {C} and hold the receipt token',
    weekly: 'add a small restake or delegate once a week',
    risk: 'an operator that is slashed, or an unbonding queue, can lock or shrink the position',
  },
  'Anchor BTC': {
    feature: 'the BTC yield vault',
    deposit: 'Deposit $10,000 of BTC-backed collateral into {N} on {C} and hold the position',
    weekly: 'hold the position and claim any yield it pays',
    risk: 'a BTC price move can change the collateral ratio, and withdrawing early can void the position',
  },
  'Decentralized BTC': {
    feature: 'the BTC vault',
    deposit: 'Mint or deposit $10,000 through {N} on {C} and hold the receipt token',
    weekly: 'hold the receipt and make one small mint or transfer a week',
    risk: 'a peg break or a redemption pause can strand the receipt, and an idle wallet can look inactive',
  },
  CeDeFi: {
    feature: 'the CeDeFi vault',
    deposit: 'Deposit $10,000 into a {N} CeDeFi vault on {C} and hold the shares',
    weekly: "hold the vault shares and check the vault's report once a week",
    risk: "a vault's off-chain leg is opaque, and a withdrawal freeze can lock the deposit",
  },
  'Dual-Token Stablecoin': {
    feature: 'the stablecoin mint',
    deposit: "Mint $10,000 of {N}'s stable asset on {C} with USDC collateral and hold it",
    weekly: 'hold the minted asset and adjust the collateral once a week',
    risk: 'a depeg of either token can liquidate the mint, and holding neither token earns nothing',
  },
  Farm: {
    feature: 'the farm',
    deposit: "Deposit $10,000 into {N}'s main farm on {C} and stake the LP receipt",
    weekly: "harvest the farm's rewards or add a small top-up",
    risk: 'rewards that are not harvested can be missed, and withdrawing before a snapshot can void them',
  },
  'Prediction Market': {
    feature: 'the prediction market',
    deposit: 'Fund $10,000 and place one market position on {N} on {C}',
    weekly: 'place one small market position a week on an outcome you follow',
    risk: 'a market that resolves against you loses the stake, and a funded account with no positions can look idle',
  },
  'Stablecoin Wrapper': {
    feature: 'the wrapper',
    deposit: "Wrap $10,000 of USDC into {N}'s wrapped asset on {C} and hold it",
    weekly: 'hold the wrapped asset and use it in one transaction a week',
    risk: 'holding the unwrapped asset instead earns nothing, and a wrapper that depegs can strand funds',
  },
  'Uncollateralized Lending': {
    feature: 'the credit pool',
    deposit: "Deposit $10,000 into {N}'s credit pool on {C} and hold the position",
    weekly: "check the pool's loans and add a small top-up",
    risk: 'an uncollateralized loan that defaults hits the pool, and withdrawing early can void the position',
  },
  'Interest Rate Derivatives': {
    feature: 'the rate market',
    deposit: "Deposit $10,000 into {N}'s rate market on {C} and hold a fixed-rate position",
    weekly: 'hold the position and adjust it once a week if rates move',
    risk: 'a rate move against the position can lose value, and an empty book earns nothing',
  },
  'Cross Chain Bridge': {
    feature: 'the bridge route',
    deposit: 'Bridge $10,000 to {C} through {N} and use the bridged funds in its app',
    weekly: 'bridge a small amount each week and use it on the destination chain',
    risk: 'funds that sit on the wrong chain earn nothing, and a bridge pause can strand them',
  },
  'CDP Manager': {
    feature: 'a managed CDP vault',
    deposit: 'Deposit $10,000 into a {N} managed vault on {C} and hold the position',
    weekly: 'adjust the vault once a week or top up collateral',
    risk: 'a managed vault that is liquidated loses the collateral, and an empty vault earns nothing',
  },
  'OTC Marketplace': {
    feature: 'the OTC desk',
    deposit: "Deposit $10,000 into {N}'s OTC market on {C} and place one small order",
    weekly: 'place one small order a week',
    risk: 'an order that never fills earns nothing, and a filled order at a bad price loses money',
  },
  Insurance: {
    feature: 'the cover pool',
    deposit: 'Buy $10,000 of cover from {N} on {C} and keep the policy open',
    weekly: 'hold the policy and check the pool once a week',
    risk: 'a policy that lapses before a snapshot earns nothing, and a claim that is denied wastes the premium',
  },
  Payments: {
    feature: 'the payments app',
    deposit: 'Deposit $10,000 into {N} on {C} and use it for one payment a week',
    weekly: 'make one real payment a week through the app',
    risk: 'an idle balance earns nothing, and a payment to yourself can look like wash activity',
  },
  'Governance Incentives': {
    feature: 'the governance vault',
    deposit: "Deposit $10,000 into {N}'s governance vault on {C} and lock it for the shortest term",
    weekly: 'vote on one proposal a week',
    risk: 'a lock that ends before a snapshot can void the position, and not voting can look inactive',
  },
  'Crypto Card Issuer': {
    feature: 'the card top-up',
    deposit: 'Top up $10,000 on a {N} card on {C} and spend a little each week',
    weekly: 'spend a small amount with the card each week',
    risk: 'an unspent top-up earns nothing, and a card that is never used can look idle',
  },
  Indexes: {
    feature: 'the index token',
    deposit: "Buy $10,000 of {N}'s index token on {C} and hold it",
    weekly: 'hold the index and rebalance a small amount once a week',
    risk: 'an index that drifts from its basket loses value, and holding the components directly earns nothing',
  },
  'Collateral Markets': {
    feature: 'the collateral market',
    deposit: "Supply $10,000 of collateral to {N}'s market on {C} and keep the position open",
    weekly: 'supply or borrow a small amount once a week',
    risk: 'a collateral ratio below the minimum can liquidate the position, and an empty market position earns nothing',
  },
};

/** The fallback playbook for a category the table does not name. */
const DEFAULT_PLAYBOOK: Playbook = {
  feature: "the protocol's main app",
  deposit: 'Deposit $10,000 of USDC into {N} on {C} and keep the position open',
  weekly: 'make one qualifying action a week, such as a deposit, a swap or a vote',
  risk: 'withdrawing early, or going quiet for weeks, can void the position',
};

/** Fill {N} (name) and {C} (chain) in a playbook string. */
function fill(text: string, name: string, chain: string): string {
  return text.replaceAll('{N}', name).replaceAll('{C}', chain);
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/**
 * A protocol's farm plan: ten steps on the fixed $10,000 deposit, $2,000 a month, 6 months.
 * The action, the chain and the feature come from the protocol's own record (category, chains);
 * the costs come from its first chain's gas tier; every step names what it costs, how long it
 * takes, and what can lose the eligibility. No protocol name is special-cased.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null, farmerValue: number): FarmStep[] {
  const chain = chainOf(p);
  const gas = gasFor(chain);
  const book = PLAYBOOK[p.category ?? ''] ?? DEFAULT_PLAYBOOK;
  const deposit = fill(book.deposit, p.name, chain);
  const weekly = fill(book.weekly, p.name, chain);
  const risk = fill(book.risk, p.name, chain);
  const g = (n: number): string => (n % 1 === 0 ? `$${n}` : `$${n.toFixed(2)}`);
  return [
    {
      text: `Open a fresh wallet for this farm and fund it with $10,000 of USDC on ${chain} from an exchange you already use. Keep the seed phrase offline; a wallet that also holds other funds muddies the trail`,
      cost: `the $10,000 plus about ${g(gas.setup)} of gas`,
      time: '15 minutes',
    },
    {
      text: `${deposit}. This is the position the snapshots read`,
      cost: `the $10,000 stays in the position, about ${g(gas.setup)} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: `In month 2, add $2,000 more and ${weekly}. A second deposit in a new month counts as fresh activity`,
      cost: `$2,000 plus about ${g(gas.setup)} of gas`,
      time: '10 minutes',
    },
    {
      text: `In month 3, add another $2,000 and ${weekly}. Three months of deposits shows the position is held, not parked for a day`,
      cost: `$2,000 plus about ${g(gas.setup)} of gas`,
      time: '10 minutes',
    },
    {
      text: `Every week for 6 months, ${weekly}. A wallet that goes quiet for weeks risks missing a snapshot: ${risk}`,
      cost: `about ${g(gas.weekly)} of gas a week`,
      time: '10 minutes a week',
    },
    {
      text: `In months 4 and 5, add $2,000 each month and keep the whole position open; do not withdraw anything. Withdrawing early can void the whole position: ${risk}`,
      cost: '$4,000 across the two months',
      time: '10 minutes a month',
    },
    {
      text: `Once a month, open ${p.name}'s own points or rewards page from the protocol's own site and write down the points balance. Claim only from a link the protocol itself publishes; a fake claim site can drain the wallet`,
      cost: 'nothing to check',
      time: '10 minutes a month',
    },
    {
      text: `In month 6, add the last $2,000 and hold the full $22,000 position through the final weeks. Stopping deposits early shrinks the share of the pool`,
      cost: `$2,000 plus about ${g(gas.setup)} of gas`,
      time: '10 minutes',
    },
    {
      text: `When ${p.name} publishes its eligibility check, run it from the farm wallet and confirm the position counts. If the check says the wallet is short, make one more qualifying action before the window closes`,
      cost: 'nothing to check',
      time: '15 minutes',
    },
    {
      text: `If a token launches and the wallet is eligible, claim from the protocol's own published link only, then unwind the $22,000 position. Never pay anyone to claim for you; an airdrop that asks for a fee is a scam. The model puts this farm at about $${fmtInt(farmerValue)}`,
      cost: `about ${g(gas.setup)} of gas to claim and withdraw`,
      time: '30 minutes',
    },
  ];
}

// ------------------------------------------------------------------ detail panels

/** "Why this protocol is worth farming", from the row's own numbers. */
export function whyText(p: SnapshotProtocol, age: number | null, tokenValue: number, farmerValue: number): string {
  const growth =
    p.change_7d === null
      ? 'its 7-day change is unreported'
      : p.change_7d >= 0
        ? `up ${p.change_7d.toFixed(2)}% over the last 7 days`
        : `down ${Math.abs(p.change_7d).toFixed(2)}% over the last 7 days`;
  const ageBit =
    age === null
      ? 'with no listing date on record'
      : age < 90
        ? `listed only ${age} days ago`
        : age < 365
          ? `listed ${age} days ago`
          : `listed ${(age / 365).toFixed(1)} years ago`;
  const sizeBit =
    p.tvl_usd >= 1_000_000_000
      ? 'At this size the pool is large, so one deposit is a small share -- but the protocol is well established.'
      : p.tvl_usd >= 100_000_000
        ? 'At this size a $10,000 deposit is a real share of the pool without the protocol being a gamble.'
        : 'At this size a $10,000 deposit is a meaningful share of the pool, which is why the expected value is high for its TVL.';
  const ageNote =
    age !== null && age > 1095
      ? 'It has run over three years with no token, so the maturity factor is discounted.'
      : age !== null && age < 90
        ? 'It is young, so the maturity factor is discounted until it proves it lasts.'
        : 'It has run long enough to be real without having issued a token.';
  return `${p.name} holds $${fmtInt(p.tvl_usd)} of TVL, ${growth}, and has run ${ageBit} with no token on record. The model puts its implied token value at $${fmtInt(tokenValue)} and a $10,000 deposit's share of the farming pool at about $${fmtInt(farmerValue)} -- a deposit-to-airdrop ratio of $10,000 : $${fmtInt(farmerValue)}. ${sizeBit} ${ageNote}`;
}

/** "Who should farm it", with the reader as the subject: money, time, value, first step. */
export function whoText(p: SnapshotProtocol, age: number | null, farmerValue: number): string {
  const chain = chainOf(p);
  const gas = gasFor(chain);
  const book = PLAYBOOK[p.category ?? ''] ?? DEFAULT_PLAYBOOK;
  const deposit = fill(book.deposit, p.name, chain);
  const weekly = fill(book.weekly, p.name, chain);
  const first = deposit.charAt(0).toLowerCase() + deposit.slice(1);
  // Setup 30 min, five top-ups at 10 min, 26 weekly actions at 10 min, six checks at 10 min, claim 30 min.
  const minutes = 30 + 5 * 10 + 26 * 10 + 6 * 10 + 30;
  const hours = (minutes / 60).toFixed(1);
  return `Farm it if you can leave $10,000 in, plus $2,000 a month for 6 months -- $22,000 in all -- and spend about ${hours} hours over the half year at about $${fmtInt(gas.total)} of gas on ${chain}. At the model's numbers a $10,000 deposit is worth about $${fmtInt(farmerValue)} of airdrop. First step: ${first}. Stay visible by ${weekly} every week. What can wait: the monthly points check and the final claim; the deposit and the weekly action cannot.`;
}

// ------------------------------------------------------------------ live set

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
      symbol: p.symbol,
    }));
}

// ------------------------------------------------------------------ walk-forward

/** Re-run the model on the snapshot rewound seven days and measure how the ranking moves.
 * The rewind divides each TVL by (1 + change_7d/100), sets the prior week's growth to 0 (unknown)
 * and takes seven days off the age; rows with no 7-day change are left out of the re-run. */
export function walkForward(board: BoardRow[], snapshot: Snapshot, model: ModelConstants = MODEL): WalkForward {
  const index = bySlug(snapshot.protocols);
  const nowRank = new Map(board.map((r) => [r.slug, r.rank]));
  const rewound: { slug: string; farmer: number }[] = [];
  for (const row of board) {
    const p = index.get(row.slug);
    if (p === undefined || p.change_7d === null) continue;
    const prior = p.tvl_usd / (1 + p.change_7d / 100);
    if (!(prior > 0) || !Number.isFinite(prior)) continue;
    const age = row.age_days === null ? null : Math.max(0, row.age_days - 7);
    const v = valueOf(p, snapshot.as_of, model, prior, 0, age);
    rewound.push({ slug: row.slug, farmer: v.farmer });
  }
  rewound.sort((a, b) => b.farmer - a.farmer || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  const thenRank = new Map(rewound.map((r, i) => [r.slug, i + 1]));
  const common = [...thenRank.keys()].filter((s) => nowRank.has(s));
  const n = common.length;
  const moves = common.map((s) => nowRank.get(s)! - thenRank.get(s)!);
  const rho = n > 2 ? 1 - (6 * moves.reduce((a, x) => a + x * x, 0)) / (n * (n * n - 1)) : 0;
  const top10now = new Set(board.slice(0, 10).map((r) => r.slug));
  const top10then = new Set(rewound.slice(0, 10).map((r) => r.slug));
  const overlap = [...top10now].filter((s) => top10then.has(s)).length;
  const abs = moves.map(Math.abs).sort((a, b) => a - b);
  const median = abs.length > 0 ? abs[Math.floor(abs.length / 2)]! : 0;
  let maxMove = 0;
  let maxSlug = '';
  for (const s of common) {
    const m = Math.abs(nowRank.get(s)! - thenRank.get(s)!);
    if (m > maxMove) {
      maxMove = m;
      maxSlug = s;
    }
  }
  const maxName = maxSlug === '' ? '' : (index.get(maxSlug)?.name ?? maxSlug);
  return {
    n,
    spearman: Math.round(rho * 1000) / 1000,
    top10_overlap: overlap,
    median_abs_move: median,
    max_abs_move: maxMove,
    max_mover_slug: maxSlug,
    max_mover_name: maxName,
  };
}

/** The expected airdrop at each deposit level for one protocol's token value and TVL. */
export function depositCurve(tokenValue: number, tvl: number): { deposit: number; expected: number }[] {
  const pool = tokenValue * MODEL.airdrop_pct;
  return DEPOSIT_LEVELS.map((dep) => ({
    deposit: dep,
    expected: Math.min(DEPOSIT_CAP_USD, Math.round(pool * Math.min(1, Math.pow(dep / tvl, MODEL.dilution_exponent)))),
  }));
}

/** A board row's compact form for data.js. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    gecko_id: row.gecko_id,
    symbol: row.symbol,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    token_value_usd: row.token_value_usd,
    farmer_share: row.farmer_share,
    deposit_ratio: row.deposit_ratio,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    farm_steps: row.farm_steps,
    why_text: row.why_text,
    who_text: row.who_text,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const wf = walkForward(board, snapshot, model);
  const medianRow = [...board].sort((a, b) => a.tvl_usd - b.tvl_usd)[Math.floor(board.length / 2)]!;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    deposit_cap_usd: DEPOSIT_CAP_USD,
    rows: board.map(radarRow),
    live,
    walk_forward: wf,
    median_curve: {
      slug: medianRow.slug,
      name: medianRow.name,
      tvl_usd: medianRow.tvl_usd,
      points: depositCurve(medianRow.token_value_usd, medianRow.tvl_usd),
    },
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
