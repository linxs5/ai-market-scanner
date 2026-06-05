import type { Handler } from "@netlify/functions";
import type { RecommendationLedgerItem } from "../../lib/shared/types";
import { sendAlert } from "../../lib/server/alerts";
import { connectBlobs } from "../../lib/server/blob-storage";
import { errorResponse, jsonResponse } from "../../lib/server/http";
import { runOpportunityEngine } from "../../lib/server/opportunity-engine";
import { appendRecommendations, loadRecommendationLedger, recommendationsFromEngine } from "../../lib/server/recommendation-ledger";

async function sendAutoPaperCreatedAlert(item: RecommendationLedgerItem) {
  await sendAlert({
    title: `AUTO PAPER CREATED: ${item.tickerOrMarket}`,
    message: [
      `Category: ${item.tradeCategory}`,
      `Action: ${item.directExecutionPlan.label}`,
      `Entry: ${item.directExecutionPlan.entryZone}`,
      `Invalidation: ${item.directExecutionPlan.stopOrInvalidation}`,
      `Target: ${item.directExecutionPlan.target1}`,
      `Max risk: ${item.maxRisk}`,
      `Direct steps: ${item.marketType === "polymarket" ? item.directExecutionPlan.polymarketSteps.slice(0, 5).join(" | ") : item.directExecutionPlan.robinhoodSteps.slice(0, 5).join(" | ")}`,
      "Status: auto-paper created / waiting for trigger.",
      "Manual approval only. No real auto-trading."
    ].join("\n"),
    severity: item.riskLevel,
    alertType: item.marketType === "polymarket" ? "polymarket mover" : "stock mover",
    channels: ["telegram"]
  });
}

export const handler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return jsonResponse({});
  if (!["GET", "POST"].includes(event.httpMethod)) return errorResponse("Method not allowed.", 405);
  connectBlobs(event);

  try {
    const engine = await runOpportunityEngine();
    let ledgerSaved = false;
    let ledgerWarning: string | null = null;
    try {
      const existing = await loadRecommendationLedger();
      const existingIds = new Set(existing.map((item) => item.id));
      const generated = recommendationsFromEngine(engine, existing);
      await appendRecommendations(generated);
      const newAutoPaper = generated
        .filter((item) => item.autoPaperEligible && item.confidence === "high" && !existingIds.has(item.id))
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
    return errorResponse("Opportunity engine failed.", 500, error instanceof Error ? error.message : error);
  }
};
