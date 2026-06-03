import type { Handler } from "@netlify/functions";
import { getSetupCheck } from "../../lib/server/env";
import { jsonResponse } from "../../lib/server/http";

export const handler: Handler = async () => {
  return jsonResponse(getSetupCheck());
};
