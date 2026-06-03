import type {
  Confidence,
  PolymarketOpportunity,
  PolymarketRiskFlags,
  PolymarketScanResponse,
  PolymarketScoreBreakdown,
  SmartMoneyTrader,
  SmartMoneyWatch
} from "@/lib/shared/types";

const GAMMA_BASE_URL = "https://gamma-api.polymarket.com";
const DATA_BASE_URL = "https://data-api.polymarket.com";

type GammaEvent = {
  id?: string;
  title?: string;
  slug?: string;
  description?: string;
  resolutionSource?: string;
  liquidity?: number | string;
  volume?: number | string;
  volume24hr?: number | string;
  openInterest?: number | string;
  competitive?: number | string;
  active?: boolean;
  closed?: boolean;
  tags?: Array<{ label?: string; slug?: string }>;
  markets?: GammaMarket[];
};

type GammaMarket = {
  id?: string;
  question?: string;
  slug?: string;
  description?: string;
  outcomes?: string;
  outcomePrices?: string;
  resolutionSource?: string;
  endDate?: string;
  active?: boolean;
  closed?: boolean;
  archived?: boolean;
  enableOrderBook?: boolean;
  acceptingOrders?: boolean;
  umaResolutionStatus?: string;
  volume?: number | string;
  volumeNum?: number | string;
  volume24hr?: number | string;
  volume24hrClob?: number | string;
  liquidity?: number | string;
  liquidityNum?: number | string;
  liquidityClob?: number | string;
  spread?: number | string;
  bestBid?: number | string;
  bestAsk?: number | string;
  lastTradePrice?: number | string;
  oneDayPriceChange?: number | string;
  oneWeekPriceChange?: number | string;
  clobTokenIds?: string;
};

type PriceHistoryResponse = {
  history?: Array<{ t?: number; p?: number }>;
};

type LeaderboardRow = {
  rank?: string;
  proxyWallet?: string;
  userName?: string;
  xUsername?: string;
  verifiedBadge?: boolean;
  vol?: number;
  pnl?: number;
};

function clamp(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value));
}

function round(value: number) {
  return Math.round(value * 10) / 10;
}

function toNumber(value: unknown, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function parseJsonArray<T>(value: unknown, fallback: T[]): T[] {
  if (Array.isArray(value)) return value as T[];
  if (typeof value !== "string") return fallback;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as T[]) : fallback;
  } catch {
    return fallback;
  }
}

function daysUntil(value?: string) {
  if (!value) return null;
  const end = new Date(value).getTime();
  if (!Number.isFinite(end)) return null;
  return Math.max(0, (end - Date.now()) / 86_400_000);
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) {
    throw new Error(`Polymarket request failed (${response.status}) for ${url}`);
  }
  return (await response.json()) as T;
}

async function fetchPriceHistoryChange(market: GammaMarket): Promise<number | null> {
  const liquidity = toNumber(market.liquidityClob ?? market.liquidityNum ?? market.liquidity);
  const volume24hr = toNumber(market.volume24hrClob ?? market.volume24hr);
  if (liquidity < 1_000 && volume24hr < 500) return null;

  const tokenIds = parseJsonArray<string>(market.clobTokenIds, []);
  const tokenId = tokenIds[0];
  if (!tokenId) return null;

  try {
    const params = new URLSearchParams({ market: tokenId, interval: "1d", fidelity: "60" });
    const response = await fetchJson<PriceHistoryResponse>(`https://clob.polymarket.com/prices-history?${params.toString()}`);
    const history = response.history?.filter((point) => Number.isFinite(point.p)) ?? [];
    if (history.length < 2) return null;
    const first = Number(history[0].p);
    const last = Number(history[history.length - 1].p);
    return Number.isFinite(first) && Number.isFinite(last) ? round(last - first) : null;
  } catch {
    return null;
  }
}

function detectCatalystStrength(text: string, volume24hr: number, oneDayMove: number | null) {
  const catalystWords = [
    "election",
    "fed",
    "inflation",
    "cpi",
    "earnings",
    "ipo",
    "bitcoin",
    "crypto",
    "court",
    "war",
    "approval",
    "deadline",
    "rate",
    "tariff",
    "ai",
    "nvidia"
  ];
  const keywordHits = catalystWords.filter((word) => text.toLowerCase().includes(word)).length;
  return clamp(keywordHits * 12 + Math.min(volume24hr / 10_000, 35) + Math.min(Math.abs(oneDayMove ?? 0) * 250, 30));
}

function resolutionClarity(description: string, resolutionSource: string) {
  const text = `${description} ${resolutionSource}`.toLowerCase();
  let score = 45;
  if (text.includes("will resolve to")) score += 20;
  if (text.includes("resolution source") || resolutionSource) score += 20;
  if (text.includes("official") || text.includes("primary")) score += 10;
  if (text.includes("consensus of credible reporting")) score -= 8;
  if (text.includes("unclear") || text.includes("subjective")) score -= 20;
  return clamp(score);
}

function probableTrap(flags: Omit<PolymarketRiskFlags, "probableTrap">, yesPrice: number | null, noPrice: number | null) {
  if (flags.thinLiquidity) return "Thin liquidity can make the displayed odds hard to enter or exit without slippage.";
  if (flags.wideSpread) return "Wide spread means you may be late even if the headline looks interesting.";
  if (flags.ambiguousWording) return "Ambiguous wording can turn a seemingly obvious outcome into a resolution dispute.";
  if (yesPrice !== null && (yesPrice < 0.04 || yesPrice > 0.96)) return "Odds are already extreme, so the remaining reward may not justify binary headline risk.";
  if (noPrice !== null && (noPrice < 0.04 || noPrice > 0.96)) return "One side is already priced as highly likely, leaving little room for error.";
  return "The trap is following a popular narrative without a clean resolution source and fresh catalyst.";
}

async function scoreMarket(event: GammaEvent, market: GammaMarket, smartMoneyAvailable: boolean): Promise<PolymarketOpportunity> {
  const outcomes = parseJsonArray<string>(market.outcomes, ["Yes", "No"]);
  const outcomePrices = parseJsonArray<string | number>(market.outcomePrices, []).map((price) => toNumber(price, 0));
  const yesPrice = outcomePrices[0] ?? null;
  const noPrice = outcomePrices[1] ?? null;
  const volume = toNumber(market.volumeNum ?? market.volume ?? event.volume);
  const volume24hr = toNumber(market.volume24hrClob ?? market.volume24hr ?? event.volume24hr);
  const liquidity = toNumber(market.liquidityClob ?? market.liquidityNum ?? market.liquidity ?? event.liquidity);
  const openInterest = toNumber(event.openInterest);
  const spread = market.spread === undefined ? null : toNumber(market.spread);
  const oneDayPriceChange = market.oneDayPriceChange === undefined ? null : toNumber(market.oneDayPriceChange);
  const oneWeekPriceChange = market.oneWeekPriceChange === undefined ? null : toNumber(market.oneWeekPriceChange);
  const priceHistoryChange = await fetchPriceHistoryChange(market);
  const bestBid = market.bestBid === undefined ? null : toNumber(market.bestBid);
  const bestAsk = market.bestAsk === undefined ? null : toNumber(market.bestAsk);
  const lastTradePrice = market.lastTradePrice === undefined ? null : toNumber(market.lastTradePrice);
  const timeRemainingDays = daysUntil(market.endDate);
  const description = market.description || event.description || "";
  const resolutionSource = market.resolutionSource || event.resolutionSource || "Not listed separately; inspect market rules.";
  const text = `${event.title ?? ""} ${market.question ?? ""} ${description}`;
  const competitiveOdds = yesPrice !== null ? 100 - Math.abs(yesPrice - 0.5) * 200 : 35;

  const liquidityVolume = clamp(Math.log10(volume + liquidity + 1) * 16);
  const oddsMomentum = clamp(
    Math.abs(oneDayPriceChange ?? 0) * 260 +
      Math.abs(oneWeekPriceChange ?? 0) * 100 +
      Math.abs(priceHistoryChange ?? 0) * 320 +
      competitiveOdds * 0.25
  );
  const catalystStrength = detectCatalystStrength(text, volume24hr, oneDayPriceChange);
  const clarity = resolutionClarity(description, resolutionSource);
  const timeAttractiveness =
    timeRemainingDays === null ? 35 : timeRemainingDays < 1 ? 35 : timeRemainingDays <= 45 ? 85 : timeRemainingDays <= 180 ? 65 : 42;
  const crowdSignal = clamp(toNumber(event.competitive) * 75 + (smartMoneyAvailable ? 15 : 0) + Math.min(openInterest / 100_000, 10));

  const breakdown: PolymarketScoreBreakdown = {
    liquidityVolume: round(liquidityVolume),
    oddsMomentum: round(oddsMomentum),
    catalystStrength: round(catalystStrength),
    resolutionClarity: round(clarity),
    timeAttractiveness: round(timeAttractiveness),
    crowdSignal: round(crowdSignal)
  };

  const score = round(
    breakdown.liquidityVolume * 0.25 +
      breakdown.oddsMomentum * 0.2 +
      breakdown.catalystStrength * 0.2 +
      breakdown.resolutionClarity * 0.15 +
      breakdown.timeAttractiveness * 0.1 +
      breakdown.crowdSignal * 0.1
  );

  const ambiguousWording = /consensus|credible reporting|substantially|significant|unclear|may|could/i.test(description);
  const resolutionSourceRisk = !market.resolutionSource && !event.resolutionSource;
  const thinLiquidity = liquidity < 1_000 || volume24hr < 100;
  const wideSpread = spread !== null && spread > 0.04;
  const binaryNewsShock = /election|war|court|fed|inflation|crypto|bitcoin|earnings|approval/i.test(text);
  const crowdedTrade = yesPrice !== null && (yesPrice > 0.85 || yesPrice < 0.15);
  const manipulationWhaleRisk = liquidity < 10_000 && volume24hr > liquidity * 3;
  const timeDecayOpportunityCost = timeRemainingDays !== null && timeRemainingDays > 180;
  const riskFlagBase = {
    ambiguousWording,
    resolutionSourceRisk,
    thinLiquidity,
    wideSpread,
    binaryNewsShock,
    crowdedTrade,
    manipulationWhaleRisk,
    timeDecayOpportunityCost
  };
  const riskFlags: PolymarketRiskFlags = {
    ...riskFlagBase,
    probableTrap: probableTrap(riskFlagBase, yesPrice, noPrice)
  };

  const riskCount = Object.values(riskFlagBase).filter(Boolean).length;
  const warnings: string[] = [];
  if (thinLiquidity) warnings.push("Thin liquidity or low 24h volume.");
  if (wideSpread) warnings.push("Spread is wide enough to require extra caution.");
  if (resolutionSourceRisk) warnings.push("Resolution source is not explicitly listed.");
  if (ambiguousWording) warnings.push("Wording may depend on judgment or credible-reporting consensus.");
  if (market.umaResolutionStatus) warnings.push(`UMA status: ${market.umaResolutionStatus}.`);

  const missingDataPoints = [yesPrice, noPrice, spread, oneDayPriceChange, priceHistoryChange].filter((value) => value === null).length;
  const confidence: Confidence = score >= 75 && riskCount <= 2 && missingDataPoints <= 1 ? "high" : score >= 58 && riskCount <= 5 ? "medium" : "low";
  const dataConfidence: Confidence = missingDataPoints <= 1 ? "high" : missingDataPoints <= 3 ? "medium" : "low";
  const riskLevel = riskCount >= 5 || thinLiquidity || wideSpread ? "high" : riskCount >= 3 ? "medium" : "low";
  const category = event.tags?.[0]?.label || "Prediction market";
  const currentConsensus =
    yesPrice === null ? "Current odds unavailable." : `YES ${Math.round(yesPrice * 100)}% / NO ${Math.round((noPrice ?? 1 - yesPrice) * 100)}%`;

  return {
    id: market.id || market.slug || `${event.id}-${market.question}`,
    eventId: event.id || "",
    slug: market.slug || event.slug || "",
    eventTitle: event.title || "Untitled event",
    question: market.question || event.title || "Untitled market",
    description,
    marketUrl: `https://polymarket.com/event/${event.slug ?? market.slug ?? ""}`,
    category,
    outcomes,
    outcomePrices,
    yesPrice,
    noPrice,
    bestBid,
    bestAsk,
    spread,
    lastTradePrice,
    oneDayPriceChange,
    oneWeekPriceChange,
    priceHistoryChange,
    volume,
    volume24hr,
    liquidity,
    openInterest,
    endDate: market.endDate || null,
    timeRemainingDays: timeRemainingDays === null ? null : round(timeRemainingDays),
    resolutionSource,
    resolutionCriteria: description.slice(0, 700) || "No detailed criteria returned by the public API.",
    score,
    scoreBreakdown: breakdown,
    confidence,
    dataConfidence,
    riskLevel,
    riskFlags,
    catalyst: catalystStrength >= 55 ? "High public activity and/or catalyst language detected." : "No strong external catalyst detected from metadata alone.",
    currentConsensus,
    yesCase: "YES research case: fresh public evidence could make the listed condition more likely before expiry.",
    noCase: "NO research case: the condition may fail, already be priced in, or rely on ambiguous reporting/resolution criteria.",
    whatWouldMoveIt: [
      "Official source updates related to the market question.",
      "Credible breaking news that directly changes the probability.",
      "Large odds move with matching volume and tight spreads."
    ],
    whatToMonitor: [
      "Resolution source and market rules.",
      "Best bid/ask spread before any paper decision.",
      "24h volume and whether the move is already crowded."
    ],
    whyToSkip:
      warnings.length > 0
        ? warnings.join(" ")
        : "Skip if you cannot explain the resolution rule, catalyst, and invalidation in one sentence.",
    invalidation: "Invalidated if the resolution source contradicts the thesis, odds move without liquidity, or wording/rules are unclear.",
    warnings
  };
}

function isTradableMarket(market: GammaMarket) {
  return (
    market.active === true &&
    market.closed !== true &&
    market.archived !== true &&
    market.enableOrderBook === true &&
    market.acceptingOrders !== false &&
    !["resolved", "proposed"].includes(String(market.umaResolutionStatus ?? "").toLowerCase())
  );
}

export async function fetchSmartMoneyWatch(): Promise<SmartMoneyWatch> {
  const warnings: string[] = [];
  let rows: LeaderboardRow[] = [];
  try {
    rows = await fetchJson<LeaderboardRow[]>(`${DATA_BASE_URL}/v1/leaderboard`);
  } catch (error) {
    warnings.push(error instanceof Error ? error.message : "Leaderboard fetch failed.");
  }

  const traders: SmartMoneyTrader[] = rows.slice(0, 12).map((row) => {
    const volume = toNumber(row.vol);
    const pnl = toNumber(row.pnl);
    const possibleTheme =
      volume > 250_000 ? "High-volume trader; inspect recent activity before drawing conclusions." : "High P/L leaderboard trader; theme concentration unavailable from leaderboard alone.";
    return {
      rank: String(row.rank ?? ""),
      userName: row.userName || "Unnamed trader",
      proxyWallet: row.proxyWallet || "",
      volume,
      pnl,
      xUsername: row.xUsername || "",
      verified: Boolean(row.verifiedBadge),
      possibleTheme,
      caution: "Do not copy blindly. Leaderboard P/L can be stale, hedged, or already reflected in current odds."
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    source: `${DATA_BASE_URL}/v1/leaderboard`,
    traders,
    repeatedThemes: [
      "Leaderboard exposes trader P/L and volume, not a guaranteed live thesis.",
      "High volume can identify accounts worth researching, but following late can be the trap."
    ],
    warnings
  };
}

export async function runPolymarketScan(): Promise<PolymarketScanResponse> {
  const warnings: string[] = [];
  const smartMoney = await fetchSmartMoneyWatch();
  let events: GammaEvent[] = [];

  try {
    events = await fetchJson<GammaEvent[]>(
      `${GAMMA_BASE_URL}/events?active=true&closed=false&order=volume_24hr&ascending=false&limit=50`
    );
  } catch (error) {
    warnings.push(error instanceof Error ? error.message : "Polymarket event fetch failed.");
  }

  const allActive = (
    await Promise.all(
      events.flatMap((event) =>
        (event.markets ?? [])
          .filter((market) => market.active === true && market.closed !== true && market.archived !== true)
          .map((market) => scoreMarket(event, market, smartMoney.traders.length > 0))
      )
    )
  );
  const scored = (
    await Promise.all(
      events.flatMap((event) =>
        (event.markets ?? [])
          .filter(isTradableMarket)
          .map((market) => scoreMarket(event, market, smartMoney.traders.length > 0))
      )
    )
  );

  const opportunities = scored
    .filter((market) => market.score >= 45 && market.liquidity >= 250 && market.volume24hr >= 25)
    .sort((a, b) => b.score - a.score)
    .slice(0, 12);

  const skipped = allActive
    .filter((market) => !opportunities.some((opportunity) => opportunity.id === market.id))
    .sort((a, b) => b.score - a.score)
    .slice(0, 20);

  return {
    generatedAt: new Date().toISOString(),
    disclaimer:
      "Research only, not financial advice. This is not a gambling signal and does not connect to a wallet or place Polymarket orders.",
    opportunities,
    skipped,
    smartMoney,
    warnings: [...warnings, ...smartMoney.warnings]
  };
}
