import type { Handler } from "@netlify/functions";
import type { RecommendationLedgerItem } from "../../lib/shared/types";
import { sendAlert } from "../../lib/server/alerts";
import { connectBlobs } from "../../lib/server/blob-storage";
import { errorResponse, jsonResponse } from "../../lib/server/http";
import { runOpportunityEngine } from "../../lib/server/opportunity-engine";
import { appendRecommendations, loadRecommendationLedger, recommendationsFromEngine } from "../../lib/server/recommendation-ledger";

const ENDPOINT = "run-opportunity-engine";

async function sendAutoPaperCreatedAlert(item: RecommendationLedgerItem) {
  const isPoly = item.marketType === "polymarket";
  await sendAlert({
    title: isPoly ? `URGENT POLYMARKET WATCH: ${item.tickerOrMarket}` : `ACTIONABLE OPPORTUNITY: ${item.tickerOrMarket}`,
    message: isPoly
      ? [
          "URGENT POLYMARKET WATCH",
          `Market: ${item.title}`,
          `YES Means: Event happens under the market rules.`,
          `NO Means: Event does not happen under the market rules.`,
          `Current YES/NO: ${item.currentPriceOrOddsAtRecommendation}`,
          `Event Time: ${item.catalystCountdown}`,
          `Confidence: ${item.confidence}`,
          `Expected Value: ${item.directExecutionPlan.expectedValueEstimate}`,
          `Action: ${item.recommendation}`,
          `Max Risk: ${item.maxRisk} from $50 account.`,
          `Why Now: ${item.whyNow}`,
          `Why Skip: ${item.whySkip}`,
          `Next Check: ${item.nextSuggestedCheck}`,
          "Manual Only"
        ].join("\n")
      : [
          "ACTIONABLE OPPORTUNITY",
          `Type: ${item.tradeCategory}`,
          `Ticker/Market: ${item.tickerOrMarket}`,
          `Confidence: ${item.confidence}`,
          `Readiness: ${item.readinessLabel} ${item.executionReadinessScore}/100`,
          `Entry: ${item.directExecutionPlan.exactEntry}`,
          `Stop: ${item.directExecutionPlan.exactStop}`,
          `Target: ${item.directExecutionPlan.exactTarget1}`,
          `Risk: ${item.directExecutionPlan.riskPerShare}; max paper risk ${item.maxRisk}`,
          `Why Now: ${item.whyNow}`,
          `Catalyst: ${item.catalystType}`,
          `What Could Fail: ${item.whySkip}`,
          `Next Check: ${item.nextSuggestedCheck}`,
          "Manual Execution Only"
        ].join("\n"),
    severity: item.riskLevel,
    alertType: item.marketType === "polymarket" ? "polymarket mover" : "stock mover",
    channels: ["telegram"]
  });
}

export const handler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return jsonResponse({});

  try {
    if (!["GET", "POST"].includes(event.httpMethod)) return errorResponse("Method not allowed.", 405, null, ENDPOINT);
    connectBlobs(event);
    const engine = await runOpportunityEngine();
    let ledgerSaved = false;
    let ledgerWarning: string | null = null;
    try {
      const existing = await loadRecommendationLedger();
      const existingIds = new Set(existing.map((item) => item.id));
      const generated = recommendationsFromEngine(engine, existing);
      await appendRecommendations(generated);
      const newAutoPaper = generated
        .filter((item) => item.autoPaperEligible && item.executionReadinessScore >= 70 && !existingIds.has(item.id))
        .slice(0, 3);
      for (const item of newAutoPaper) {
        await sendAutoPaperCreatedAlert(item).catch(() => null);
      }
      ledgerSaved = true;
    } catch (error) {
      ledgerWarning = error instanceof Error ? error.message : "Recommendation ledger save failed.";
    }
    return jsonResponse({ ...engine, recommendationLedger: { saved: ledgerSaved, warning: ledgerWarning } });
  } catch (error) {
    return errorResponse("Opportunity engine failed.", 500, error instanceof Error ? error.message : error, ENDPOINT);
  }
};
