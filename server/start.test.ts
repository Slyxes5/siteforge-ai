import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { expect, test, vi } from "vitest";
import { startGenerationServer } from "./startup";
test("mock bootstrap dynamic import starts the actual CLI entrypoint", async () => {
  const reservation = createServer();
  await new Promise<void>((r) => reservation.listen(0, "127.0.0.1", r));
  const address = reservation.address();
  if (!address || typeof address === "string") throw Error("address");
  const port = address.port;
  await new Promise<void>((r) => reservation.close(() => r()));
  const child = spawn(
    process.execPath,
    ["--import", "tsx", "scripts/mock-backend.ts"],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        SITEFORGE_BACKEND_PORT: String(port),
        SITEFORGE_AI_ALLOW_LIVE: "false",
        SITEFORGE_GEMINI_API_KEY: "",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  try {
    const output = await new Promise<string>((resolve, reject) => {
      let stdout = "";
      const timer = setTimeout(
        () => reject(Error("CLI startup timed out")),
        2000,
      );
      child.stdout.on("data", (chunk) => {
        stdout += chunk;
        if (stdout.includes("mode=mock")) {
          clearTimeout(timer);
          resolve(stdout);
        }
      });
      child.once("exit", () => {
        clearTimeout(timer);
        reject(Error("CLI exited without listening"));
      });
      child.once("error", reject);
    });
    expect(output.trim()).toBe(`http://127.0.0.1:${port} mode=mock`);
    const status = await fetch(
      `http://127.0.0.1:${port}/api/generation/status`,
    );
    expect(await status.json()).toMatchObject({
      mode: "mock",
      model: "test-fixture",
    });
  } finally {
    if (child.exitCode === null) {
      child.kill();
      await new Promise<void>((resolve) => child.once("exit", () => resolve()));
    }
  }
});
test("startup binds loopback only in explicit mock mode and logs only address and mode", async () => {
  const log = vi.fn();
  const server = await startGenerationServer(
    { SITEFORGE_AI_PROVIDER: "mock", SITEFORGE_AI_TEST_MODE: "true" },
    { port: 0, log },
  );
  try {
    expect(server.listening).toBe(true);
    const address = server.address();
    expect(address).toMatchObject({ address: "127.0.0.1" });
    if (!address || typeof address === "string") throw Error("address");
    expect(log).toHaveBeenCalledExactlyOnceWith(
      `http://127.0.0.1:${address.port} mode=mock`,
    );
    const status = await fetch(
      `http://127.0.0.1:${address.port}/api/generation/status`,
    );
    expect(await status.json()).toMatchObject({
      mode: "mock",
      model: "test-fixture",
    });
  } finally {
    await new Promise<void>((resolve) => {
      server.closeAllConnections();
      server.close(() => resolve());
    });
  }
});
