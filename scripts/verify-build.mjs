import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
const sentinel = "SITEFORGE_TEST_ONLY_" + randomUUID();
const publicEnv = {};
// Exclude credential-bearing names before any value lookup; inject synthetic keys only.
for (const name of Object.keys(process.env)) {
  if (!/(?:KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL)/i.test(name))
    publicEnv[name] = process.env[name];
}
const env = {
  ...publicEnv,
  SITEFORGE_GEMINI_API_KEY: sentinel,
  SITEFORGE_OPENROUTER_API_KEY: sentinel,
  SITEFORGE_BUILD_SENTINEL: sentinel,
};
// Synthetic sentinel only. This command never loads credentials or invokes any AI provider.
const command = process.platform === "win32" ? "npm.cmd" : "npm";
const build = spawnSync(command, ["run", "build"], {
  env,
  stdio: "inherit",
  shell: process.platform === "win32",
});
if (build.status !== 0) process.exit(build.status ?? 1);
const check = spawnSync(process.execPath, ["scripts/check-client-bundle.mjs"], {
  env,
  stdio: "inherit",
});
process.exit(check.status ?? 1);
