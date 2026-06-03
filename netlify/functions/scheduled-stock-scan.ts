import type { Handler } from "@netlify/functions";
import { getSetupCheck } from "../../lib/server/env";
import { errorResponse, jsonResponse } from "../../lib/server/http";
import { runMarketScan } from "../../lib/server/scan";

export const config = {
  schedule: "30 12,16,19 * * 1-5"
};

export const handler: Handler = async () => {
  const setup = getSetupCheck();
  if (setup.requiredMissing.length) {
    return errorResponse("Scheduled stock scan skipped because required env vars are missing.", 500, setup.requiredMissing);
  }

  return jsonResponse(await runMarketScan());
};
