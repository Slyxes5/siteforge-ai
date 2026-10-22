import { createGenerationServer } from "./generation-server";
import { backendPort, providerFromEnvironment } from "./config";
import { editProviderFromEnvironment } from "./edit-provider";
/** Library startup for owned loopback servers. CLI entrypoint is intentionally separate. */
export async function startGenerationServer(
  env: NodeJS.ProcessEnv,
  options: {
    port?: number;
    log?: (message: string) => void;
    editTransport?: typeof globalThis.fetch;
  } = {},
) {
  const provider = providerFromEnvironment(env);
  const server = createGenerationServer({
    provider,
    editProvider: editProviderFromEnvironment(env, options.editTransport),
  });
  await new Promise<void>((done, reject) => {
    server.once("error", reject);
    server.listen(options.port ?? backendPort(env), "127.0.0.1", () => {
      server.removeListener("error", reject);
      done();
    });
  });
  const address = server.address();
  if (address && typeof address !== "string")
    (options.log ?? console.log)(
      `http://127.0.0.1:${address.port} mode=${provider ? (provider.id === "mock" ? "mock" : "live") : "disabled"}`,
    );
  return server;
}
