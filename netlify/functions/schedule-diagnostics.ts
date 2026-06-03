import type { Handler } from "@netlify/functions";
import { connectBlobs } from "../../lib/server/blob-storage";
import { loadScheduleDiagnostics } from "../../lib/server/daily-reports";
import { jsonResponse } from "../../lib/server/http";

export const handler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return jsonResponse({});
  connectBlobs(event);
  return jsonResponse(await loadScheduleDiagnostics());
};
