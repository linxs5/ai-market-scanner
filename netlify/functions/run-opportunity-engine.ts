import type { Handler } from "@netlify/functions";
import { connectBlobs } from "../../lib/server/blob-storage";
import { errorResponse, jsonResponse } from "../../lib/server/http";
import { runOpportunityEngine } from "../../lib/server/opportunity-engine";
import { appendRecommendations, loadRecommendationLedger, recommendationsFromEngine } from "../../lib/server/recommendation-ledger";

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
      await appendRecommendations(recommendationsFromEngine(engine, existing));
      ledgerSaved = true;
    } catch (error) {
      ledgerWarning = error instanceof Error ? error.message : "Recommendation ledger save failed.";
    }
    return jsonResponse({ ...engine, recommendationLedger: { saved: ledgerSaved, warning: ledgerWarning } });
  } catch (error) {
    return errorResponse("Opportunity engine failed.", 500, error instanceof Error ? error.message : error);
  }
};
