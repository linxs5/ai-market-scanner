import type { Handler } from "@netlify/functions";
import { connectBlobs } from "../../lib/server/blob-storage";
import { runScheduledDailyReport } from "../../lib/server/scheduled-report-runner";
import { jsonResponse } from "../../lib/server/http";

export const config = {
  // 12:30 PM ET = 17:30 UTC during EST, 16:30 UTC during EDT.
  // Netlify cron is fixed UTC; current config follows 12:30 PM ET during EDT.
  schedule: "30 16 * * 1-5"
};

export const handler: Handler = async (event) => {
  connectBlobs(event);
  return jsonResponse(await runScheduledDailyReport("midday"));
};
