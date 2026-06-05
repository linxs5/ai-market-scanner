import type { Handler } from "@netlify/functions";
import type { RecommendationLedgerItem, RecommendationStatus } from "../../lib/shared/types";
import { sendAlert } from "../../lib/server/alerts";
import { connectBlobs } from "../../lib/server/blob-storage";
import { fetchQuote } from "../../lib/server/market-data";
import { runPolymarketScan } from "../../lib/server/polymarket";
import { jsonResponse } from "../../lib/server/http";
import { loadRecommendationLedger, saveRecommendationLedger } from "../../lib/server/recommendation-ledger";

const ENDPOINT = "active-trade-monitor";

function numberFromText(value: string) {
  const match = value.match(/([0-9]+(?:\.[0-9]+)?)/);
  return match ? Number(match[1]) : null;
}

function nextStockStatus(item: RecommendationLedgerItem, latestPrice: number): RecommendationStatus {
  const entry = numberFromText(item.entryZone);
  const target = numberFromText(item.target1);
  const stop = numberFromText(item.stopOrInvalidation);
  if (Date.now() > new Date(item.autoPaperTrade?.expiresAt ?? new Date(new Date(item.createdAt).getTime() + 2 * 86_400_000)).getTime() && ["recommended", "waiting_for_trigger"].includes(item.status)) return "expired";
  if (item.status === "user_skipped" && target !== null && latestPrice >= target) return "missed_winner";
  if (item.status === "user_skipped" && stop !== null && latestPrice <= stop) return "good_skip";
  if (item.status === "waiting_for_trigger" && entry !== null && latestPrice >= entry) return "triggered";
  if (target !== null && latestPrice >= target && item.recommendation !== "SKIP" && item.recommendation !== "AVOID") return "target_hit";
  if (stop !== null && latestPrice <= stop) return "stopped_out";
  if (Date.now() - new Date(item.createdAt).getTime() > 2 * 86_400_000 && item.status === "recommended") return "expired";
  return item.status;
}

async function maybePolymarketStatus(item: RecommendationLedgerItem): Promise<RecommendationStatus> {
  if (Date.now() > new Date(item.autoPaperTrade?.expiresAt ?? new Date(new Date(item.createdAt).getTime() + 7 * 86_400_000)).getTime() && ["recommended", "waiting_for_trigger"].includes(item.status)) return "expired";
  try {
    const scan = await runPolymarketScan();
    const market = scan.opportunities.find((candidate) => candidate.slug === item.tickerOrMarket || candidate.question === item.title);
    if (!market) return item.status;
    const current = item.recommendation === "PAPER_NO" ? market.noPrice : market.yesPrice;
    const start = numberFromText(item.currentPriceOrOddsAtRecommendation);
    if (current === null || start === null) return item.status;
    const currentCents = Math.round(current * 100);
    if (item.status === "user_skipped" && currentCents >= start + 10) return "missed_winner";
    if (item.status === "user_skipped" && currentCents <= Math.max(0, start - 10)) return "good_skip";
    if (item.status === "waiting_for_trigger" && currentCents >= start + 2) return "triggered";
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
        ? "STOP HIT"
        : nextStatus === "expired"
          ? "TRADE EXPIRED"
          : nextStatus === "triggered"
            ? "TRIGGER HIT"
            : nextStatus === "missed_winner"
              ? "MISSED WINNER"
              : nextStatus === "good_skip"
                ? "GOOD SKIP"
                : "STATE CHANGE";
  await sendAlert({
    title: `${label}: ${item.tickerOrMarket}`,
    message: [
      `${item.tradeCategory}`,
      `Action: ${item.directExecutionPlan.label}`,
      `Entry: ${item.directExecutionPlan.entryZone}`,
      `Invalidation: ${item.directExecutionPlan.stopOrInvalidation}`,
      `Target: ${item.directExecutionPlan.target1}`,
      `Status: ${label}`,
      `Why: ${item.beginnerThesis}`,
      `Direct steps: ${item.marketType === "polymarket" ? item.directExecutionPlan.polymarketSteps.slice(0, 4).join(" | ") : item.directExecutionPlan.robinhoodSteps.slice(0, 4).join(" | ")}`,
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

  try {
    connectBlobs(event);

    const ledger = await loadRecommendationLedger();
    const open = ledger.filter((item) => ["recommended", "waiting_for_trigger", "user_entered", "triggered", "user_skipped"].includes(item.status));
    const updated: RecommendationLedgerItem[] = [];
    const changes: Array<{ id: string; from: RecommendationStatus; to: RecommendationStatus }> = [];

    for (const item of ledger) {
      if (!open.some((candidate) => candidate.id === item.id)) {
        updated.push(item);
        continue;
      }

      let nextStatus = item.status;
      let currentPriceOrOdds = item.autoPaperTrade?.currentPriceOrOdds ?? item.currentPriceOrOddsAtRecommendation;
      if (item.marketType === "stock") {
        const quote = await fetchQuote(item.tickerOrMarket).catch(() => null);
        if (quote) {
          currentPriceOrOdds = `$${quote.price.toFixed(2)}`;
          nextStatus = nextStockStatus(item, quote.price);
        }
      } else {
        nextStatus = await maybePolymarketStatus(item);
        currentPriceOrOdds = "Latest Polymarket odds checked when available.";
      }

      const checked = {
        ...item,
        status: nextStatus,
        lastCheckedAt: new Date().toISOString(),
        autoPaperTrade: item.autoPaperTrade
          ? {
              ...item.autoPaperTrade,
              currentPriceOrOdds,
              theoreticalResult:
                nextStatus === "target_hit"
                  ? "Paper target hit."
                  : nextStatus === "stopped_out"
                    ? "Paper stop/invalidation hit."
                    : nextStatus === "triggered"
                      ? "Trigger hit. Paper trade is now active."
                      : nextStatus === "expired"
                        ? "Expired before a clean trigger."
                        : item.autoPaperTrade.theoreticalResult
            }
          : item.autoPaperTrade
      };
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
  } catch (error) {
    return jsonResponse({
      ok: false,
      error: error instanceof Error ? error.message : "Active trade monitor failed.",
      endpoint: ENDPOINT,
      timestamp: new Date().toISOString(),
      checked: 0,
      changes: [],
      recommendations: []
    }, 500);
  }
};
