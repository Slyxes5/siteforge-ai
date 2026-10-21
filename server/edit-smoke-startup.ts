import { createGenerationServer } from "./generation-server";
import { editProviderFromEnvironment } from "./edit-provider";
import { singleUseTransport } from "./smoke-startup";
import {
  createSmokeTransportAudit,
  type SmokeTransportEvent,
} from "./smoke-transport-audit";

/** One approved editing attempt; generation stays disabled, including with ambient settings. */
export function createEditSmokeServer(
  env: NodeJS.ProcessEnv,
  args: readonly string[],
  transport: typeof fetch = globalThis.fetch,
  record: (event: SmokeTransportEvent) => void = () => {},
) {
  if (args.length !== 1 || args[0] !== "--live")
    throw new Error("Explicit --live approval required.");
  const budget = singleUseTransport(
    createSmokeTransportAudit(transport, record),
  );
  const editProvider = editProviderFromEnvironment(env, budget.fetch);
  if (editProvider?.id !== "openrouter-edit")
    throw new Error("Live editing configuration required.");
  return {
    server: createGenerationServer({ editProvider, maxAttempts: 1 }),
    outboundRequests: budget.outboundRequests,
  };
}
