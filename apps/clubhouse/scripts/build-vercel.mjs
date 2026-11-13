/**
 * Builds the hosted Clubhouse for Vercel (Build Output API v3) into
 * apps/clubhouse/.vercel/output:
 *   static/          the web app (vite build)
 *   functions/api    the API: server/vercel.ts bundled with esbuild
 * Deploy with: vercel deploy --prebuilt --prod   (from apps/clubhouse)
 * Secrets (SESSION_SECRET, DEMO_KEYS) are Vercel environment variables, never files.
 */
import { execSync } from "node:child_process";
import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = fileURLToPath(new URL("..", import.meta.url));
const out = `${root}.vercel/output`;

execSync("pnpm --filter @accountkit/sdk build", { stdio: "inherit", cwd: root });
execSync("pnpm exec vite build", { stdio: "inherit", cwd: root });

rmSync(out, { recursive: true, force: true });
mkdirSync(`${out}/functions/api.func`, { recursive: true });
cpSync(`${root}dist`, `${out}/static`, { recursive: true });

await build({
  entryPoints: [`${root}server/vercel.ts`],
  outfile: `${out}/functions/api.func/index.mjs`,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  // Some dependencies are CommonJS and call require().
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  logLevel: "warning",
});

writeFileSync(
  `${out}/functions/api.func/.vc-config.json`,
  JSON.stringify({ runtime: "nodejs22.x", handler: "index.mjs", launcherType: "Nodejs", shouldAddHelpers: false, supportsResponseStreaming: true, maxDuration: 120 }, null, 2),
);

writeFileSync(
  `${out}/config.json`,
  JSON.stringify(
    {
      version: 3,
      routes: [
        // Every API path goes to the one function, which restores the original path.
        { src: "^/api/(.*)$", dest: "/api?__path=$1" },
        { handle: "filesystem" },
        // The web app is a single page: unknown paths load it and it routes itself.
        { src: "/(.*)", dest: "/index.html" },
      ],
    },
    null,
    2,
  ),
);
console.log(`built ${out}`);
