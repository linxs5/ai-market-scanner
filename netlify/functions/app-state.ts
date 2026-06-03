import type { Handler } from "@netlify/functions";
import type { PersistedAppState } from "../../lib/shared/types";
import { connectBlobs, getBlobStore } from "../../lib/server/blob-storage";
import { errorResponse, jsonResponse } from "../../lib/server/http";

const APP_STATE_KEY = "latest-app-state";

function appStateStore() {
  return getBlobStore("market-intelligence-app-state");
}

export const handler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return jsonResponse({});
  if (!["GET", "POST", "DELETE"].includes(event.httpMethod)) return errorResponse("Method not allowed.", 405);
  connectBlobs(event);

  try {
    const store = appStateStore();

    if (event.httpMethod === "GET") {
      const state = ((await store.get(APP_STATE_KEY, { type: "json" })) ?? null) as PersistedAppState | null;
      return jsonResponse({ ok: true, available: true, state });
    }

    if (event.httpMethod === "DELETE") {
      await store.delete(APP_STATE_KEY);
      return jsonResponse({ ok: true, available: true, state: null });
    }

    const state = JSON.parse(event.body || "{}") as PersistedAppState;
    await store.setJSON(APP_STATE_KEY, state);
    return jsonResponse({ ok: true, available: true, state });
  } catch (error) {
    return jsonResponse({
      ok: false,
      available: false,
      fallback: "localStorage",
      state: null,
      error: error instanceof Error ? error.message : "Netlify Blob app-state storage is unavailable.",
      warning: error instanceof Error ? error.message : "Netlify Blob app-state storage is unavailable."
    });
  }
};
