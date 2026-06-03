import type { Handler } from "@netlify/functions";
import { errorResponse, jsonResponse } from "../../lib/server/http";
import { getSetupCheck } from "../../lib/server/env";
import { runMarketScan } from "../../lib/server/scan";

export const handler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return jsonResponse({});
  }

  if (!["GET", "POST"].includes(event.httpMethod)) {
    return errorResponse("Method not allowed.", 405);
  }

  const setup = getSetupCheck();
  if (setup.requiredMissing.length) {
    return errorResponse("Missing required environment variables.", 500, setup.requiredMissing);
  }

  try {
    return jsonResponse(await runMarketScan());
  } catch (error) {
    return errorResponse("Market scan failed.", 500, error instanceof Error ? error.message : error);
  }
};
