/**
 * Clubhouse API, local server. The routes live in server/app.ts; the hosted
 * deployment runs the same routes as a function (server/vercel.ts).
 *
 *   PORT  default 8787
 *   HOST  interface to listen on (default 127.0.0.1: this machine only, since the live run signs testnet transactions)
 */
import { createServer } from "node:http";
import { handle, info } from "./app.js";

const PORT = Number(process.env.PORT ?? 8787);
const HOST = process.env.HOST?.trim() || "127.0.0.1";

const server = createServer(handle).listen(PORT, HOST, () => {
  const i = info();
  console.log(`Clubhouse API on http://${HOST}:${PORT}  network=${i.network} chainId=${i.chainId} club=${i.club ?? "(any HoS name)"}`);
});

// Stop cleanly on Ctrl-C or a platform shutdown: refuse new connections, let in-flight
// requests finish, and give a running live run up to 10 seconds before exiting.
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    const running = info().demoRunning;
    console.log(`${signal}: shutting down${running ? ` (a ${running} run is in progress)` : ""}`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 10_000).unref();
  });
}
