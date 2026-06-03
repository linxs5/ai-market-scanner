import type { AppStatePersistenceResponse, PersistedAppState } from "@/lib/shared/types";

const APP_STATE_KEY = "market-intelligence-app-state";

export function loadLocalAppState(): PersistedAppState | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(APP_STATE_KEY);
    return raw ? ({ ...(JSON.parse(raw) as PersistedAppState), source: "local" } as PersistedAppState) : null;
  } catch {
    return null;
  }
}

export function saveLocalAppState(state: PersistedAppState) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(APP_STATE_KEY, JSON.stringify({ ...state, source: "local" }));
}

export function clearLocalAppState() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(APP_STATE_KEY);
}

export async function loadServerAppState(): Promise<AppStatePersistenceResponse> {
  if (typeof window === "undefined") return { available: false, state: null };

  try {
    const response = await fetch("/.netlify/functions/app-state");
    if (!response.ok) return { available: false, state: null, warning: "Saved app state did not respond." };
    const payload = (await response.json()) as AppStatePersistenceResponse;
    return {
      ...payload,
      state: payload.state ? { ...payload.state, source: "server" } : null
    };
  } catch (error) {
    return {
      available: false,
      state: null,
      warning: error instanceof Error ? error.message : "Saved app state is unavailable."
    };
  }
}

export async function saveServerAppState(state: PersistedAppState): Promise<AppStatePersistenceResponse> {
  if (typeof window === "undefined") return { available: false, state: null };

  try {
    const response = await fetch("/.netlify/functions/app-state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...state, source: "server" })
    });
    if (!response.ok) return { available: false, state: null, warning: "Saved app state did not save." };
    return (await response.json()) as AppStatePersistenceResponse;
  } catch (error) {
    return {
      available: false,
      state: null,
      warning: error instanceof Error ? error.message : "Saved app state is unavailable."
    };
  }
}

export async function clearServerAppState(): Promise<AppStatePersistenceResponse> {
  if (typeof window === "undefined") return { available: false, state: null };

  try {
    const response = await fetch("/.netlify/functions/app-state", { method: "DELETE" });
    if (!response.ok) return { available: false, state: null, warning: "Saved app state did not clear." };
    return (await response.json()) as AppStatePersistenceResponse;
  } catch (error) {
    return {
      available: false,
      state: null,
      warning: error instanceof Error ? error.message : "Saved app state is unavailable."
    };
  }
}
