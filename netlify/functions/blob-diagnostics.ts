import type { Handler } from "@netlify/functions";
import { blobEnvironment, connectBlobs, getBlobStore } from "../../lib/server/blob-storage";
import { jsonResponse } from "../../lib/server/http";

export const handler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return jsonResponse({});
  connectBlobs(event);

  let readTestOk = false;
  let writeTestOk = false;
  let lastError: string | null = null;

  try {
    const store = getBlobStore("market-intelligence-diagnostics");
    const value = { checkedAt: new Date().toISOString() };
    await store.setJSON("blob-test", value);
    writeTestOk = true;
    const read = (await store.get("blob-test", { type: "json" })) as typeof value | null;
    readTestOk = Boolean(read?.checkedAt);
  } catch (error) {
    lastError = error instanceof Error ? error.message : "Blob diagnostics failed.";
  }

  return jsonResponse({
    blobAvailable: readTestOk && writeTestOk,
    readTestOk,
    writeTestOk,
    lastError,
    environment: blobEnvironment(event)
  });
};
