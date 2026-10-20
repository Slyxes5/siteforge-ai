import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
export function observerSelection(
  args: readonly string[],
): {
  mode: "mock" | "live-approved";
  pid?: number;
  scenario?: "coffee-shop";
} | null {
  const coffee = args.at(-1) === "--scenario=coffee-shop";
  const selected = coffee ? { scenario: "coffee-shop" as const } : {};
  if (coffee) args = args.slice(0, -1);
  if (args.length === 0) {
    if (coffee) throw new Error("Observer selection refused");
    return null;
  }
  if (args.length === 1 && args[0] === "--mock")
    return { mode: "mock", ...selected };
  if (
    args.length === 2 &&
    args[0] === "--live-approved" &&
    /^--pid=[1-9][0-9]{0,9}$/.test(args[1])
  ) {
    const pid = Number(args[1].slice(6));
    if (Number.isSafeInteger(pid))
      return { mode: "live-approved", pid, ...selected };
  }
  throw new Error("Observer selection refused");
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  // The observer never needs a provider credential, even for an authorized live backend.
  delete process.env.SITEFORGE_GEMINI_API_KEY;
  try {
    const selection = observerSelection(process.argv.slice(2));
    if (!selection) {
      console.log(
        "Observer disabled. Select --mock; live needs new approval and an explicit launcher PID.",
      );
    } else {
      const env: NodeJS.ProcessEnv = {};
      for (const key of [
        "PATH",
        "Path",
        "SystemRoot",
        "WINDIR",
        "PATHEXT",
        "COMSPEC",
        "USERPROFILE",
        "HOMEDRIVE",
        "HOMEPATH",
        "APPDATA",
        "LOCALAPPDATA",
        "TEMP",
        "TMP",
        "TMPDIR",
      ])
        if (process.env[key]) env[key] = process.env[key];
      Object.assign(env, {
        SITEFORGE_AI_ALLOW_LIVE: "false",
        SITEFORGE_GEMINI_API_KEY: "",
        SITEFORGE_OBSERVER_MODE: selection.mode,
        SITEFORGE_OBSERVER_PID: String(selection.pid ?? ""),
        SITEFORGE_OBSERVER_SCENARIO: selection.scenario ?? "smoke-two-blocks",
      });
      const result = spawnSync(
        process.execPath,
        [
          "node_modules/@playwright/test/cli.js",
          "test",
          "--config",
          "playwright.smoke.config.ts",
        ],
        { env, stdio: "inherit", timeout: 175000 },
      );
      process.exitCode = result.status ?? 1;
    }
  } catch {
    console.error("Observer refused to run. No retry was attempted.");
    process.exitCode = 1;
  }
}
