import {
  createSyntheticEditProvider,
  type EditProviderRequest,
  type StructuredEditProvider,
} from "../src/ai/structured-edit";
import { editRequestSchema } from "../src/ai/edit-contract";
import {
  type LiveEditSource,
  OPENROUTER_EDIT_MODEL,
} from "../src/ai/edit-source";
import { createOpenRouterEditProvider } from "./openrouter-edit-provider";

export type BackendEditProvider = StructuredEditProvider &
  (
    | { readonly id: "synthetic"; readonly source?: never }
    | { readonly id: "openrouter-edit"; readonly source: LiveEditSource }
  );

/** A single named fixture, not a natural-language model or general-purpose command parser. */
export const MOCK_EDIT_INSTRUCTION = 'Set the first heading to "Welcome".';
export function createMockEditProvider(
  transport: (
    request: EditProviderRequest,
    signal: AbortSignal,
  ) => Promise<string> = async (request, signal) => {
    signal.throwIfAborted();
    const parsed = editRequestSchema.parse(request);
    const heading = parsed.context.blocks.find(
      (block) => block.type === "heading",
    );
    if (parsed.instruction !== MOCK_EDIT_INSTRUCTION || !heading)
      throw new Error("Synthetic edit fixture unavailable.");
    return JSON.stringify({
      version: 1,
      operations: [
        { op: "update", blockId: heading.id, changes: { text: "Welcome" } },
      ],
    });
  },
): BackendEditProvider {
  const fixture = createSyntheticEditProvider(transport);
  return { id: "synthetic", propose: fixture.propose };
}

/** Independent opt-in. Disabled/mock paths never read credentials or generation settings. */
export function editProviderFromEnvironment(
  env: NodeJS.ProcessEnv,
  transport?: typeof globalThis.fetch,
): BackendEditProvider | undefined {
  const selection = env.SITEFORGE_EDIT_PROVIDER;
  if (selection === "mock")
    return env.SITEFORGE_AI_TEST_MODE === "true"
      ? createMockEditProvider()
      : undefined;
  if (
    selection !== "openrouter" ||
    env.SITEFORGE_EDIT_ALLOW_LIVE !== "true" ||
    env.SITEFORGE_AI_TEST_MODE === "true" ||
    env.SITEFORGE_EDIT_FREE_ONLY_CONFIRMED !== "true"
  )
    return undefined;
  const model = env.SITEFORGE_EDIT_MODEL ?? OPENROUTER_EDIT_MODEL;
  if (model !== OPENROUTER_EDIT_MODEL)
    throw new Error("Unsupported edit model.");
  const apiKey = env.SITEFORGE_EDIT_OPENROUTER_API_KEY;
  if (!apiKey?.trim()) return undefined;
  const provider = createOpenRouterEditProvider({
    apiKey,
    model,
    fetch: transport ?? globalThis.fetch,
    timeoutMs: Number(env.SITEFORGE_EDIT_TIMEOUT_MS ?? "45000"),
  });
  return {
    ...provider,
    id: "openrouter-edit",
    source: { provider: "openrouter", model },
  };
}
