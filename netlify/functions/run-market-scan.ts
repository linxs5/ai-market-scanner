import type { Handler } from "@netlify/functions";
import { errorResponse, jsonResponse } from "../../lib/server/http";
import { getSetupCheck } from "../../lib/server/env";
import { runMarketScan } from "../../lib/server/scan";

const ENDPOINT = "run-market-scan";

export const handler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return jsonResponse({});
  }

  try {
    if (!["GET", "POST"].includes(event.httpMethod)) {
      return errorResponse("Method not allowed.", 405, null, ENDPOINT);
    }

    const setup = getSetupCheck();
    if (setup.requiredMissing.length) {
      return errorResponse("Missing required environment variables.", 500, setup.requiredMissing, ENDPOINT);
    }

    return jsonResponse(await runMarketScan());
  } catch (error) {
    return errorResponse("Market scan failed.", 500, error instanceof Error ? error.message : error, ENDPOINT);
  }
};
