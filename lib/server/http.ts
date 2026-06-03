export function jsonResponse(body: unknown, statusCode = 200) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS"
    },
    body: JSON.stringify(body)
  };
}

export function errorResponse(message: string, statusCode = 500, details?: unknown) {
  return jsonResponse({ error: message, details }, statusCode);
}
