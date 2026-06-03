import { connectLambda, getStore } from "@netlify/blobs";

type LambdaLikeEvent = {
  blobs?: string;
  headers?: Record<string, string>;
};

let connected = false;

export function connectBlobs(event?: unknown) {
  const lambdaEvent = event as LambdaLikeEvent | undefined;
  if (!connected && lambdaEvent?.blobs) {
    connectLambda(lambdaEvent as Parameters<typeof connectLambda>[0]);
    connected = true;
  }
}

export function getBlobStore(name: string) {
  return getStore(name);
}

export function blobEnvironment(event?: unknown) {
  const lambdaEvent = event as LambdaLikeEvent | undefined;
  return {
    hasNetlify: Boolean(process.env.NETLIFY || process.env.CONTEXT || process.env.URL),
    hasSiteId: Boolean(process.env.SITE_ID || process.env.NETLIFY_SITE_ID),
    hasBlobsContext: Boolean(process.env.NETLIFY_BLOBS_CONTEXT || globalThis.netlifyBlobsContext || lambdaEvent?.blobs),
    nodeEnv: process.env.NODE_ENV ?? "unknown"
  };
}
