export async function safeJsonFetch<T>(endpoint: string, init?: RequestInit): Promise<T> {
  const response = await fetch(endpoint, init);
  const contentType = response.headers.get("content-type") ?? "";
  const text = await response.text();

  if (!contentType.toLowerCase().includes("application/json")) {
    throw new Error(`Function returned non-JSON response from ${endpoint}. Status ${response.status}. Body: ${text.slice(0, 200)}`);
  }

  let payload: unknown;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Function returned invalid JSON from ${endpoint}. Status ${response.status}. Body: ${text.slice(0, 200)}`);
  }

  if (!response.ok) {
    const error = payload && typeof payload === "object" && "error" in payload ? String((payload as { error?: unknown }).error) : "Function request failed.";
    throw new Error(`${error} (${endpoint}, status ${response.status})`);
  }

  return payload as T;
}
