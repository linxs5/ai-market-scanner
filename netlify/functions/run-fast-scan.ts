import type { Handler } from "@netlify/functions";
import { errorResponse, jsonResponse } from "../../lib/server/http";
import { runFastScanStage } from "../../lib/server/opportunity-pipeline";

const ENDPOINT = "run-fast-scan";

export const handler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return jsonResponse({});
  try {
    if (!["GET", "POST"].includes(event.httpMethod)) return errorResponse("Method not allowed.", 405, null, ENDPOINT);
    return jsonResponse(await runFastScanStage(event));
  } catch (error) {
    return errorResponse("Fast scan failed.", 500, error instanceof Error ? error.message : error, ENDPOINT);
  }
};
