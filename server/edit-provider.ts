import {
  createSyntheticEditProvider,
  type EditProviderRequest,
  type StructuredEditProvider,
} from "../src/ai/structured-edit";
import { editRequestSchema } from "../src/ai/edit-contract";

/** Stage 1 accepts synthetic providers only. No generation-provider adaptation or live factory. */
export interface BackendEditProvider extends StructuredEditProvider {
  readonly id: "synthetic";
}

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

/** Independent opt-in. Never read credentials, live-provider settings, or model discovery. */
export function editProviderFromEnvironment(
  env: NodeJS.ProcessEnv,
): BackendEditProvider | undefined {
  return env.SITEFORGE_EDIT_PROVIDER === "mock" &&
    env.SITEFORGE_AI_TEST_MODE === "true"
    ? createMockEditProvider()
    : undefined;
}
