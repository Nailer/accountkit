/**
 * Hosted entry point: the same routes as the local server, as one Node
 * function. scripts/build-vercel.mjs bundles this file and routes every
 * /api/* request here as /api?__path=<rest>; this restores the original path.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { handle } from "./app.js";

export default function vercelHandler(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? "/", "http://localhost");
  const rest = url.searchParams.get("__path");
  if (rest !== null && !url.pathname.startsWith("/api/")) {
    url.searchParams.delete("__path");
    const q = url.searchParams.toString();
    req.url = `/api/${rest}${q ? `?${q}` : ""}`;
  }
  return handle(req, res);
}
