import type { OpportunityEngineResponse, PolymarketScanResponse, ScanResponse } from "@/lib/shared/types";
import { WATCHLIST } from "@/lib/shared/watchlist";
import { connectBlobs, getBlobStore } from "./blob-storage";
import { buildCrossMarketInsights } from "./cross-market";
import type { EarningsSignal } from "./earnings";
import { fetchEarningsSignals } from "./earnings";
import { getSetupCheck } from "./env";
import { getMacroRiskToday } from "./macro";
import { makeEarningsWatchItems, makeReport, polymarketToOpportunity, stockToOpportunity } from "./opportunity-engine";
import { runPolymarketScan } from "./polymarket";
import { appendRecommendations, loadRecommendationLedger, recommendationsFromEngine } from "./recommendation-ledger";
import { runFastMarketScan } from "./scan";
import type { SecEightKSignal } from "./sec";
import { fetchSecEightKSignals } from "./sec";

const STORE_NAME = "market-intelligence-opportunity-pipeline";
const FAST_SCAN_KEY = "latest-fast-scan";
const SCORE_KEY = "latest-opportunity-score";
const ENGINE_KEY = "latest-recommendation-engine";
const SLOW_OPERATION_MS = 5_000;

function store() {
  return getBlobStore(STORE_NAME);
}

export type StageTiming = {
  name: string;
  ms: number;
  slow: boolean;
};

async function timed<T>(name: string, fn: () => Promise<T>) {
  const start = Date.now();
  const result = await fn();
  const ms = Date.now() - start;
  const timing = { name, ms, slow: ms > SLOW_OPERATION_MS };
  if (timing.slow) console.warn(`WARN: Slow operation detected: ${name} ${ms}ms`);
  return { result, timing };
}

export type FastScanSnapshot = {
  ok: true;
  generatedAt: string;
  stockScan: ScanResponse | null;
  stockError: string | null;
  polymarketScan: PolymarketScanResponse;
  secSignals: Record<string, SecEightKSignal>;
  earningsSignals: Record<string, EarningsSignal>;
  warnings: string[];
  timings: StageTiming[];
};

export type OpportunityScoreSnapshot = {
  ok: true;
  generatedAt: string;
  fastScanGeneratedAt: string;
  engine: OpportunityEngineResponse;
  timings: StageTiming[];
  warnings: string[];
};

export type RecommendationBuildSnapshot = OpportunityScoreSnapshot & {
  recommendationLedger: {
    saved: boolean;
    warning: string | null;
  };
};

export async function savePipelineValue<T>(key: string, value: T) {
  await store().setJSON(key, value);
  return value;
}

export async function loadFastScan() {
  return ((await store().get(FAST_SCAN_KEY, { type: "json" })) ?? null) as FastScanSnapshot | null;
}

export async function loadOpportunityScore() {
  return ((await store().get(SCORE_KEY, { type: "json" })) ?? null) as OpportunityScoreSnapshot | null;
}

export async function runFastScanStage(event?: unknown): Promise<FastScanSnapshot> {
  connectBlobs(event);
  const warnings: string[] = [];
  const timings: StageTiming[] = [];
  const setup = getSetupCheck();

  const stockStage = await timed("Finnhub market scan", async () => {
    if (setup.requiredMissing.length) {
      warnings.push(`Stock scan skipped; missing ${setup.requiredMissing.join(", ")}.`);
      return { stockScan: null, stockError: `Stock scan skipped; missing ${setup.requiredMissing.join(", ")}.` };
    }
    try {
      return { stockScan: await runFastMarketScan(), stockError: null };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Stock scan failed.";
      warnings.push(message);
      return { stockScan: null, stockError: message };
    }
  });
  timings.push(stockStage.timing);

  const polyStage = await timed("Polymarket scan", () => runPolymarketScan());
  timings.push(polyStage.timing);

  const watchedTickers = [...new Set([...WATCHLIST, ...(stockStage.result.stockScan?.setups.map((setupReport) => setupReport.ticker) ?? [])])];
  const secStage = await timed("SEC scan", () =>
    fetchSecEightKSignals(watchedTickers).catch((error) => {
      warnings.push(error instanceof Error ? error.message : "SEC 8-K watcher failed.");
      return {} as Record<string, SecEightKSignal>;
    })
  );
  timings.push(secStage.timing);

  const earningsStage = await timed("Earnings scan", () =>
    fetchEarningsSignals(watchedTickers).catch((error) => {
      warnings.push(error instanceof Error ? error.message : "Earnings watcher failed.");
      return {} as Record<string, EarningsSignal>;
    })
  );
  timings.push(earningsStage.timing);

  const snapshot: FastScanSnapshot = {
    ok: true,
    generatedAt: new Date().toISOString(),
    stockScan: stockStage.result.stockScan,
    stockError: stockStage.result.stockError,
    polymarketScan: polyStage.result,
    secSignals: secStage.result,
    earningsSignals: earningsStage.result,
    warnings: [...warnings, ...polyStage.result.warnings],
    timings
  };
  return savePipelineValue(FAST_SCAN_KEY, snapshot);
}

export async function runOpportunityScoreStage(event?: unknown): Promise<OpportunityScoreSnapshot> {
  connectBlobs(event);
  const fastScan = await loadFastScan();
  if (!fastScan) throw new Error("Fast scan snapshot missing. Run Fast Scan first.");
  const scoreStage = await timed("Opportunity scoring", async () => {
    const crossMarketInsights = buildCrossMarketInsights(fastScan.stockScan, fastScan.polymarketScan);
    const stockOpportunities =
      fastScan.stockScan?.setups.map((setupReport) => stockToOpportunity(setupReport, fastScan.secSignals[setupReport.ticker], fastScan.earningsSignals[setupReport.ticker])) ?? [];
    const polymarketOpportunities = fastScan.polymarketScan.opportunities.map(polymarketToOpportunity);
    const opportunities = [...stockOpportunities, ...polymarketOpportunities].sort(
      (a, b) => b.attentionPriority - a.attentionPriority || b.score - a.score
    );
    const topCrossMarketInsight = crossMarketInsights[0] ?? null;
    const engine: OpportunityEngineResponse = {
      generatedAt: new Date().toISOString(),
      disclaimer: "Research only. No auto-trading, no wallet connection, no private keys, and no guaranteed outcomes.",
      opportunities,
      stockScan: fastScan.stockScan,
      polymarketScan: fastScan.polymarketScan,
      crossMarketInsights,
      reports: [],
      macroRiskToday: getMacroRiskToday(),
      earningsWatch: makeEarningsWatchItems(fastScan.earningsSignals),
      warnings: fastScan.warnings
    };
    engine.reports = [
      makeReport("Morning Brief", opportunities, topCrossMarketInsight),
      makeReport("Midday Update", opportunities, topCrossMarketInsight),
      makeReport("Closing Watchlist", opportunities, topCrossMarketInsight),
      makeReport("Weekend Deep Dive", opportunities, topCrossMarketInsight)
    ];
    return engine;
  });
  const snapshot: OpportunityScoreSnapshot = {
    ok: true,
    generatedAt: new Date().toISOString(),
    fastScanGeneratedAt: fastScan.generatedAt,
    engine: scoreStage.result,
    timings: [...fastScan.timings, scoreStage.timing],
    warnings: fastScan.warnings
  };
  return savePipelineValue(SCORE_KEY, snapshot);
}

export async function runRecommendationBuilderStage(event?: unknown): Promise<RecommendationBuildSnapshot> {
  connectBlobs(event);
  const scored = await loadOpportunityScore();
  if (!scored) throw new Error("Opportunity score snapshot missing. Run scoring first.");
  const buildStage = await timed("Recommendation builder", async () => {
    let ledgerSaved = false;
    let ledgerWarning: string | null = null;
    try {
      const existing = await loadRecommendationLedger();
      await appendRecommendations(recommendationsFromEngine(scored.engine, existing));
      ledgerSaved = true;
    } catch (error) {
      ledgerWarning = error instanceof Error ? error.message : "Recommendation ledger save failed.";
    }
    return { ledgerSaved, ledgerWarning };
  });
  const snapshot: RecommendationBuildSnapshot = {
    ...scored,
    generatedAt: new Date().toISOString(),
    timings: [...scored.timings, buildStage.timing],
    recommendationLedger: {
      saved: buildStage.result.ledgerSaved,
      warning: buildStage.result.ledgerWarning
    }
  };
  return savePipelineValue(ENGINE_KEY, snapshot);
}
