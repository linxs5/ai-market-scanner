import type { Handler } from "@netlify/functions";
import { connectBlobs } from "../../lib/server/blob-storage";
import { errorResponse, jsonResponse } from "../../lib/server/http";
import { analyzeRecommendationLedger, loadRecommendationLedger } from "../../lib/server/recommendation-ledger";

const ENDPOINT = "run-learning";

export const handler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return jsonResponse({});
  try {
    if (!["GET", "POST"].includes(event.httpMethod)) return errorResponse("Method not allowed.", 405, null, ENDPOINT);
    connectBlobs(event);
    const startedAt = Date.now();
    const recommendations = await loadRecommendationLedger();
    const analytics = analyzeRecommendationLedger(recommendations);
    const ms = Date.now() - startedAt;
    if (ms > 5_000) console.warn(`WARN: Slow operation detected: learning ${ms}ms`);
    return jsonResponse({
      ok: true,
      generatedAt: new Date().toISOString(),
      recommendationsChecked: recommendations.length,
      analytics,
      timings: [{ name: "Learning", ms, slow: ms > 5_000 }]
    });
  } catch (error) {
    return errorResponse("Learning stage failed.", 500, error instanceof Error ? error.message : error, ENDPOINT);
  }
};
