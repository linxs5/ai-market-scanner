import type { Handler } from "@netlify/functions";
import { z } from "zod";
import type { RecommendationLedgerItem } from "../../lib/shared/types";
import { connectBlobs } from "../../lib/server/blob-storage";
import { errorResponse, jsonResponse } from "../../lib/server/http";
import {
  analyzeRecommendationLedger,
  appendRecommendations,
  loadRecommendationLedger,
  saveRecommendationLedger,
  updateRecommendation
} from "../../lib/server/recommendation-ledger";

const updateSchema = z.object({
  id: z.string(),
  update: z.custom<Partial<RecommendationLedgerItem>>()
});

const postSchema = z.object({
  recommendations: z.array(z.custom<RecommendationLedgerItem>()).optional(),
  update: updateSchema.optional(),
  clear: z.boolean().optional()
});

export const handler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return jsonResponse({});
  if (!["GET", "POST", "DELETE"].includes(event.httpMethod)) return errorResponse("Method not allowed.", 405);
  connectBlobs(event);

  try {
    if (event.httpMethod === "DELETE") {
      return jsonResponse({
        ok: true,
        storageSource: "server",
        recommendations: await saveRecommendationLedger([]),
        analytics: analyzeRecommendationLedger([])
      });
    }

    if (event.httpMethod === "GET") {
      const recommendations = await loadRecommendationLedger();
      return jsonResponse({ ok: true, storageSource: "server", recommendations, analytics: analyzeRecommendationLedger(recommendations) });
    }

    const parsed = postSchema.safeParse(JSON.parse(event.body || "{}"));
    if (!parsed.success) return errorResponse("Invalid recommendation ledger payload.", 400, parsed.error.flatten());
    if (parsed.data.clear) {
      const recommendations = await saveRecommendationLedger([]);
      return jsonResponse({ ok: true, storageSource: "server", recommendations, analytics: analyzeRecommendationLedger(recommendations) });
    }
    if (parsed.data.update) {
      const recommendations = await updateRecommendation(parsed.data.update.id, parsed.data.update.update);
      return jsonResponse({ ok: true, storageSource: "server", recommendations, analytics: analyzeRecommendationLedger(recommendations) });
    }
    const recommendations = await appendRecommendations(parsed.data.recommendations ?? []);
    return jsonResponse({ ok: true, storageSource: "server", recommendations, analytics: analyzeRecommendationLedger(recommendations) });
  } catch (error) {
    return jsonResponse({
      ok: false,
      storageSource: "local fallback",
      recommendations: [],
      analytics: analyzeRecommendationLedger([]),
      fallback: "localStorage",
      error: error instanceof Error ? error.message : "Recommendation ledger storage unavailable."
    });
  }
};
