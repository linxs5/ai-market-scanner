import type { Handler } from "@netlify/functions";
import type { RecommendationLedgerItem, RecommendationStatus } from "../../lib/shared/types";
import { sendAlert } from "../../lib/server/alerts";
import { connectBlobs } from "../../lib/server/blob-storage";
import { fetchQuote } from "../../lib/server/market-data";
import { runPolymarketScan } from "../../lib/server/polymarket";
import { jsonResponse } from "../../lib/server/http";
import { loadRecommendationLedger, saveRecommendationLedger } from "../../lib/server/recommendation-ledger";

function numberFromText(value: string) {
  const match = value.match(/([0-9]+(?:\.[0-9]+)?)/);
  return match ? Number(match[1]) : null;
}

function nextStockStatus(item: RecommendationLedgerItem, latestPrice: number): RecommendationStatus {
  const target = numberFromText(item.target1);
  const stop = numberFromText(item.stopOrInvalidation);
  if (target !== null && latestPrice >= target && item.recommendation !== "SKIP" && item.recommendation !== "AVOID") return "target_hit";
  if (stop !== null && latestPrice <= stop) return "stopped_out";
  if (Date.now() - new Date(item.createdAt).getTime() > 2 * 86_400_000 && item.status === "recommended") return "expired";
  return item.status;
}

async function maybePolymarketStatus(item: RecommendationLedgerItem): Promise<RecommendationStatus> {
  if (Date.now() - new Date(item.createdAt).getTime() > 7 * 86_400_000 && item.status === "recommended") return "expired";
  try {
    const scan = await runPolymarketScan();
    const market = scan.opportunities.find((candidate) => candidate.slug === item.tickerOrMarket || candidate.question === item.title);
    if (!market) return item.status;
    const current = item.recommendation === "PAPER_NO" ? market.noPrice : market.yesPrice;
    const start = numberFromText(item.currentPriceOrOddsAtRecommendation);
    if (current === null || start === null) return item.status;
    if (current * 100 >= start + 10) return "target_hit";
    if (current * 100 <= Math.max(0, start - 10)) return "stopped_out";
  } catch {
    return item.status;
  }
  return item.status;
}

async function alertStateChange(item: RecommendationLedgerItem, nextStatus: RecommendationStatus) {
  if (item.lastAlertedStatus === nextStatus) return;
  const label =
    nextStatus === "target_hit"
      ? "TARGET HIT"
      : nextStatus === "stopped_out"
        ? "STOP/INVALIDATION HIT"
        : nextStatus === "expired"
          ? "TRADE EXPIRED"
          : nextStatus === "triggered"
            ? "CHECK THIS NOW"
            : "STATE CHANGE";
  await sendAlert({
    title: `${label}: ${item.tickerOrMarket}`,
    message: [
      `${item.tradeCategory}`,
      `Action: ${label}`,
      `Why: ${item.beginnerThesis}`,
      `Do this: Review manually before any decision.`,
      `Do not touch if: ${item.whySkip}`,
      `Max risk: ${item.maxRisk}`,
      "Manual approval only."
    ].join("\n"),
    severity: nextStatus === "stopped_out" ? "high" : "medium",
    alertType: "risk warning",
    channels: ["telegram"]
  });
}

export const handler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return jsonResponse({});
  connectBlobs(event);

  const ledger = await loadRecommendationLedger();
  const open = ledger.filter((item) => ["recommended", "user_entered", "triggered"].includes(item.status));
  const updated: RecommendationLedgerItem[] = [];
  const changes: Array<{ id: string; from: RecommendationStatus; to: RecommendationStatus }> = [];

  for (const item of ledger) {
    if (!open.some((candidate) => candidate.id === item.id)) {
      updated.push(item);
      continue;
    }

    let nextStatus = item.status;
    if (item.marketType === "stock") {
      const quote = await fetchQuote(item.tickerOrMarket).catch(() => null);
      if (quote) nextStatus = nextStockStatus(item, quote.price);
    } else {
      nextStatus = await maybePolymarketStatus(item);
    }

    const checked = { ...item, status: nextStatus, lastCheckedAt: new Date().toISOString() };
    if (nextStatus !== item.status) {
      changes.push({ id: item.id, from: item.status, to: nextStatus });
      await alertStateChange(checked, nextStatus).catch(() => null);
      updated.push({ ...checked, lastAlertedStatus: nextStatus });
    } else {
      updated.push(checked);
    }
  }

  const recommendations = await saveRecommendationLedger(updated);
  return jsonResponse({ ok: true, checked: open.length, changes, recommendations });
};
