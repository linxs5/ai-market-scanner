import type { Handler } from "@netlify/functions";
import { runScheduledDailyReport } from "../../lib/server/scheduled-report-runner";
import { jsonResponse } from "../../lib/server/http";

export const config = {
  // 8:30 AM ET = 13:30 UTC during EST, 12:30 UTC during EDT.
  // Netlify cron is fixed UTC; current config follows 8:30 AM ET during EDT.
  schedule: "30 12 * * 1-5"
};

export const handler: Handler = async () => {
  return jsonResponse(await runScheduledDailyReport("morning"));
};
