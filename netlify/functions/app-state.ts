import type { Handler } from "@netlify/functions";
import { getStore } from "@netlify/blobs";
import type { PersistedAppState } from "../../lib/shared/types";
import { errorResponse, jsonResponse } from "../../lib/server/http";

const APP_STATE_KEY = "latest-app-state";

function appStateStore() {
  return getStore({
    name: "market-intelligence-app-state",
    consistency: "strong"
  });
}

export const handler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return jsonResponse({});
  if (!["GET", "POST", "DELETE"].includes(event.httpMethod)) return errorResponse("Method not allowed.", 405);

  try {
    const store = appStateStore();

    if (event.httpMethod === "GET") {
      const state = ((await store.get(APP_STATE_KEY, { type: "json" })) ?? null) as PersistedAppState | null;
      return jsonResponse({ available: true, state });
    }

    if (event.httpMethod === "DELETE") {
      await store.delete(APP_STATE_KEY);
      return jsonResponse({ available: true, state: null });
    }

    const state = JSON.parse(event.body || "{}") as PersistedAppState;
    await store.setJSON(APP_STATE_KEY, state);
    return jsonResponse({ available: true, state });
  } catch (error) {
    return jsonResponse({
      available: false,
      state: null,
      warning: error instanceof Error ? error.message : "Netlify Blob app-state storage is unavailable."
    });
  }
};
