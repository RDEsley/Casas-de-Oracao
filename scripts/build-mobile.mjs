import { spawnSync } from "node:child_process";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "https://relatorio-ccb-brasilia.vercel.app";

function run(command, env = {}) {
  const result = spawnSync(command, { stdio: "inherit", shell: true, env: { ...process.env, ...env } });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run("npx next build", { BUILD_TARGET: "mobile", NEXT_PUBLIC_API_BASE: API_BASE });
run("npx cap sync android");
console.log(`App sincronizado. Distâncias calculadas por ${API_BASE}/api/distances.`);
