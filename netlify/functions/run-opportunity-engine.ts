import type { Handler } from "@netlify/functions";
import { errorResponse, jsonResponse } from "../../lib/server/http";
import { runOpportunityEngine } from "../../lib/server/opportunity-engine";

export const handler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return jsonResponse({});
  if (!["GET", "POST"].includes(event.httpMethod)) return errorResponse("Method not allowed.", 405);

  try {
    return jsonResponse(await runOpportunityEngine());
  } catch (error) {
    return errorResponse("Opportunity engine failed.", 500, error instanceof Error ? error.message : error);
  }
};
