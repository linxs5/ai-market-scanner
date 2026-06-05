import type {
  Candle,
  ConditionalCalloutPlan,
  FairValueGap,
  PriceActionAnalyzerResponse,
  PriceActionSignal,
  SupplyDemandZone,
  SwingPoint
} from "@/lib/shared/types";
import { fetchFinnhubCandles } from "./finnhub";
import { fetchPolygonCandles } from "./polygon";

const SUPPORTED_TICKERS = new Set(["QQQ", "SPY", "NVDA", "AMD", "TSLA", "PLTR", "MSFT", "GOOG"]);

function round(value: number) {
  return Math.round(value * 100) / 100;
}

function dollars(value: number) {
  return `$${round(value).toFixed(2)}`;
}

function body(candle: Candle) {
  return Math.abs(candle.close - candle.open);
}

function atr(candles: Candle[], period = 14) {
  if (candles.length < period + 1) return 0;
  const ranges = candles.slice(1).map((candle, index) => {
    const previous = candles[index];
    return Math.max(candle.high - candle.low, Math.abs(candle.high - previous.close), Math.abs(candle.low - previous.close));
  });
  const sample = ranges.slice(-period);
  return sample.reduce((sum, value) => sum + value, 0) / sample.length;
}

export function detectSwingPoints(candles: Candle[], fractal = 2): SwingPoint[] {
  const swings: SwingPoint[] = [];
  for (let index = fractal; index < candles.length - fractal; index += 1) {
    const candle = candles[index];
    const left = candles.slice(index - fractal, index);
    const right = candles.slice(index + 1, index + fractal + 1);
    if ([...left, ...right].every((item) => candle.high > item.high)) {
      swings.push({ index, timestamp: candle.timestamp, price: candle.high, type: "high" });
    }
    if ([...left, ...right].every((item) => candle.low < item.low)) {
      swings.push({ index, timestamp: candle.timestamp, price: candle.low, type: "low" });
    }
  }
  return swings;
}

function marketTrend(swings: SwingPoint[]) {
  const highs = swings.filter((swing) => swing.type === "high").slice(-2);
  const lows = swings.filter((swing) => swing.type === "low").slice(-2);
  if (highs.length < 2 || lows.length < 2) return "sideways" as const;
  if (highs[1].price > highs[0].price && lows[1].price > lows[0].price) return "bullish" as const;
  if (highs[1].price < highs[0].price && lows[1].price < lows[0].price) return "bearish" as const;
  return "sideways" as const;
}

function expandedMove(candles: Candle[], index: number, atrValue: number) {
  const candle = candles[index];
  const singleExpanded = body(candle) > atrValue * 1.5;
  const three = candles.slice(Math.max(0, index - 2), index + 1);
  const threeBody = three.reduce((sum, item) => sum + body(item), 0);
  const threeExpanded = three.length === 3 && threeBody > atrValue * 2;
  const net = candle.close - three[0].open;
  if ((singleExpanded || threeExpanded) && net > 0) return "bullish" as const;
  if ((singleExpanded || threeExpanded) && net < 0) return "bearish" as const;
  return null;
}

function detectFvgs(candles: Candle[]): FairValueGap[] {
  const gaps: FairValueGap[] = [];
  for (let index = 0; index < candles.length - 2; index += 1) {
    const first = candles[index];
    const third = candles[index + 2];
    if (first.high < third.low) {
      gaps.push({ id: `fvg-bullish-${index}`, type: "bullish", high: third.low, low: first.high, startIndex: index, endIndex: index + 2 });
    }
    if (first.low > third.high) {
      gaps.push({ id: `fvg-bearish-${index}`, type: "bearish", high: first.low, low: third.high, startIndex: index, endIndex: index + 2 });
    }
  }
  return gaps;
}

function recentSwingTarget(swings: SwingPoint[], type: "high" | "low", fallback: number) {
  return swings.filter((swing) => swing.type === type).at(-1)?.price ?? fallback;
}

function zoneHasFvg(fvgs: FairValueGap[], sourceIndex: number, direction: "bullish" | "bearish") {
  return fvgs.some((gap) => gap.type === direction && gap.startIndex >= sourceIndex && gap.startIndex <= sourceIndex + 4);
}

function detectZones(candles: Candle[], swings: SwingPoint[], fvgs: FairValueGap[], atrValue: number) {
  const demandZones: SupplyDemandZone[] = [];
  const supplyZones: SupplyDemandZone[] = [];
  for (let index = 3; index < candles.length; index += 1) {
    const direction = expandedMove(candles, index, atrValue);
    if (direction === "bullish") {
      const sourceIndex = candles.slice(0, index).findLastIndex((candle) => candle.close < candle.open);
      if (sourceIndex === -1) continue;
      const source = candles[sourceIndex];
      const midpoint = (source.high + source.low) / 2;
      demandZones.push({
        id: `demand-${sourceIndex}`,
        label: "DEMAND ZONE",
        high: round(source.high),
        low: round(source.low),
        midpoint: round(midpoint),
        entryZone: `${dollars(midpoint)}-${dollars(source.high)}`,
        stop: round(source.low - atrValue * 0.15),
        target: round(recentSwingTarget(swings, "high", candles[index].high)),
        highProbability: zoneHasFvg(fvgs, sourceIndex, "bullish"),
        sourceIndex
      });
    }
    if (direction === "bearish") {
      const sourceIndex = candles.slice(0, index).findLastIndex((candle) => candle.close > candle.open);
      if (sourceIndex === -1) continue;
      const source = candles[sourceIndex];
      const midpoint = (source.high + source.low) / 2;
      supplyZones.push({
        id: `supply-${sourceIndex}`,
        label: "SUPPLY ZONE",
        high: round(source.high),
        low: round(source.low),
        midpoint: round(midpoint),
        entryZone: `${dollars(source.low)}-${dollars(midpoint)}`,
        stop: round(source.high + atrValue * 0.15),
        target: round(recentSwingTarget(swings, "low", candles[index].low)),
        highProbability: zoneHasFvg(fvgs, sourceIndex, "bearish"),
        sourceIndex
      });
    }
  }
  return {
    demandZones: demandZones.slice(-4),
    supplyZones: supplyZones.slice(-4)
  };
}

function breakoutNotes(candles: Candle[], swings: SwingPoint[]) {
  const latest = candles.at(-1);
  const lastHigh = swings.filter((swing) => swing.type === "high").at(-1);
  const lastLow = swings.filter((swing) => swing.type === "low").at(-1);
  const confirmed: string[] = [];
  const failed: string[] = [];
  if (!latest) return { confirmed, failed };
  if (lastHigh && latest.close > lastHigh.price) confirmed.push(`Confirmed breakout: close above ${dollars(lastHigh.price)}.`);
  if (lastHigh && latest.high > lastHigh.price && latest.close < lastHigh.price) failed.push(`Failed breakout: high above ${dollars(lastHigh.price)} but close below it.`);
  if (lastLow && latest.close < lastLow.price) confirmed.push(`Confirmed breakdown: close below ${dollars(lastLow.price)}.`);
  if (lastLow && latest.low < lastLow.price && latest.close > lastLow.price) failed.push(`Failed breakdown: low below ${dollars(lastLow.price)} but close back above it.`);
  return { confirmed, failed };
}

function rr(entry: number, stop: number, target: number) {
  const risk = Math.abs(entry - stop);
  const reward = Math.abs(target - entry);
  if (risk <= 0) return null;
  return round(reward / risk);
}

function planFromZone(ticker: string, zone: SupplyDemandZone, trend: PriceActionSignal["trend"], failedBreakouts: string[]): ConditionalCalloutPlan | null {
  const long = zone.label === "DEMAND ZONE";
  const entry = long ? zone.high : zone.low;
  const target1 = zone.target;
  const target2 = long ? zone.target + Math.abs(zone.high - zone.low) : Math.max(0.01, zone.target - Math.abs(zone.high - zone.low));
  const rrRatio = rr(entry, zone.stop, target1);
  if (rrRatio === null || rrRatio < 2) return null;
  const noTrade = (long && trend === "bearish") || (!long && trend === "bullish") || failedBreakouts.length > 0;

  return {
    id: `pa-${ticker}-${zone.id}`,
    generatedAt: new Date().toISOString(),
    marketType: "stock",
    market: ticker,
    title: `LIVE CALLOUT - ${ticker} ${noTrade ? "NO TRADE" : long ? "LONG WATCH" : "SHORT WATCH"}`,
    direction: noTrade ? "NO TRADE" : long ? "LONG WATCH" : "SHORT WATCH",
    status: "Waiting",
    keyLevel: dollars(long ? zone.high : zone.low),
    trigger: `Wait for a candle to close ${long ? "above" : "below"} ${dollars(long ? zone.high : zone.low)}.`,
    confirmation: [
      "Volume increasing and no rejection wick.",
      "QQQ/SPY confirming the same direction.",
      "Market above VWAP for long watch or below VWAP for short watch.",
      "Higher low forms for long watch or lower high forms for short watch."
    ],
    entryZone: zone.entryZone,
    stopInvalidation: `${ticker} is wrong if price ${long ? "loses" : "reclaims"} ${dollars(zone.stop)}.`,
    target1: dollars(target1),
    target2: dollars(target2),
    volumeCondition: "Volume should increase on the candle close confirmation.",
    doNothingCondition: `If ${ticker} chops between ${dollars(zone.low)} and ${dollars(zone.high)}, do nothing.`,
    beginnerTranslation: "We are not guessing early. We are waiting for buyers or sellers to prove they are in control.",
    robinhoodSteps: [
      "Open Robinhood.",
      `Search ${ticker}.`,
      "Do not buy unless the trigger happens.",
      "If price is already far beyond entry, skip.",
      "Use a limit order only.",
      "Paper trade first.",
      "Max paper risk: $2-$5."
    ],
    futuresWarning:
      ticker === "QQQ"
        ? "NQ/MNQ concept only. Do not trade futures directly unless you understand margin. Use QQQ as the beginner proxy."
        : null,
    polymarketPlan: null,
    safetyLabels: noTrade ? ["WATCH ONLY", "NO TRADE", "HIGH RISK"] : ["WATCH ONLY", "PAPER TRADE ONLY"],
    rrRatio,
    sourceZoneId: zone.id
  };
}

function buildSignal(ticker: string, timeframe: string, candles: Candle[]): { signal: PriceActionSignal; plans: ConditionalCalloutPlan[] } {
  const swings = detectSwingPoints(candles);
  const fairValueGaps = detectFvgs(candles);
  const atrValue = atr(candles);
  const { demandZones, supplyZones } = detectZones(candles, swings, fairValueGaps, atrValue);
  const { confirmed, failed } = breakoutNotes(candles, swings);
  const trend = marketTrend(swings);
  const signal: PriceActionSignal = {
    ticker,
    timeframe,
    trend,
    lastSwingHigh: swings.filter((swing) => swing.type === "high").at(-1) ?? null,
    lastSwingLow: swings.filter((swing) => swing.type === "low").at(-1) ?? null,
    demandZones,
    supplyZones,
    fairValueGaps: fairValueGaps.slice(-8),
    confirmedBreakouts: confirmed,
    failedBreakouts: failed,
    warnings: atrValue ? [] : ["Not enough candle history to calculate ATR(14)."]
  };
  const plans = [...demandZones.slice(-2), ...supplyZones.slice(-2)]
    .map((zone) => planFromZone(ticker, zone, trend, failed))
    .filter((plan): plan is ConditionalCalloutPlan => Boolean(plan));
  return { signal, plans };
}

export async function runPriceActionAnalyzer(tickerInput: string, timeframeInput: string): Promise<PriceActionAnalyzerResponse> {
  const ticker = tickerInput.toUpperCase();
  const timeframe = timeframeInput || "15m";
  const warnings: string[] = [];
  if (!SUPPORTED_TICKERS.has(ticker)) warnings.push(`${ticker} is outside the first supported proxy list.`);

  let source: PriceActionAnalyzerResponse["source"] = "none";
  let candles = await fetchPolygonCandles(ticker, timeframe);
  if (candles.length) source = "polygon";
  if (!candles.length) {
    candles = await fetchFinnhubCandles(ticker, timeframe).catch(() => []);
    if (candles.length) source = "finnhub";
  }

  if (candles.length < 30) {
    return {
      generatedAt: new Date().toISOString(),
      ticker,
      timeframe,
      higherTimeframe: "1H or 4H trend filter needs provider candle support.",
      lowerTimeframe: "5M or 15M trigger confirmation needs provider candle support.",
      source,
      candles,
      signal: null,
      calloutPlans: [],
      error: "Needs intraday provider support: no usable OHLC candle data returned. No candles were fabricated.",
      warnings
    };
  }

  const { signal, plans } = buildSignal(ticker, timeframe, candles);
  return {
    generatedAt: new Date().toISOString(),
    ticker,
    timeframe,
    higherTimeframe: "Use 1H/4H as trend filter when provider supports those candles.",
    lowerTimeframe: "Use 5M/15M for candle-close trigger confirmation.",
    source,
    candles,
    signal,
    calloutPlans: plans,
    error: null,
    warnings: [...warnings, ...signal.warnings]
  };
}
