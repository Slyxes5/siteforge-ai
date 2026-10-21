import { z } from "zod";
import {
  blockSchema,
  projectSchema,
  type Project,
} from "../project-schema/project";
import { createEditProposal, type EditProposal } from "./edit-proposal";
import { abortableGeneration, abortFailure } from "./generation-runtime";
import { liveEditSourceSchema, type LiveEditSource } from "./edit-source";

const generatedBlockSchema = z.discriminatedUnion("type", [
  blockSchema.options[0].omit({ id: true }),
  blockSchema.options[1].omit({ id: true }),
  blockSchema.options[2].omit({ id: true }),
  blockSchema.options[3].omit({ id: true }),
  blockSchema.options[4].omit({ id: true }),
  blockSchema.options[5].omit({ id: true }),
  blockSchema.options[6].omit({ id: true }),
  blockSchema.options[7].omit({ id: true }),
]);
const editable = new Set([
  "text",
  "subtitle",
  "ctaText",
  "body",
  "alt",
  "email",
  "phone",
  "address",
  "href",
  "ctaHref",
  "src",
  "tone",
  "layout",
  "items",
]);
const updateSchema = z.strictObject({
  op: z.literal("update"),
  blockId: z.string().min(1).max(200),
  changes: z.record(z.string(), z.unknown()).refine((changes) => {
    const keys = Object.keys(changes);
    try {
      return (
        keys.length > 0 &&
        keys.length <= 10 &&
        keys.every((key) => editable.has(key)) &&
        JSON.stringify(changes).length <= 100_000
      );
    } catch {
      return false;
    }
  }),
});
export const structuredEditResponseSchema = z.strictObject({
  version: z.literal(1),
  operations: z
    .array(
      z.discriminatedUnion("op", [
        updateSchema,
        z.strictObject({
          op: z.literal("add"),
          afterId: z.string().min(1).max(200).nullable(),
          block: generatedBlockSchema,
        }),
        z.strictObject({
          op: z.literal("remove"),
          blockId: z.string().min(1).max(200),
        }),
        z.strictObject({
          op: z.literal("reorder"),
          blockIds: z.array(z.string().min(1).max(200)).max(200),
        }),
      ]),
    )
    .min(1)
    .max(100),
});
export type StructuredEditOperations = z.infer<
  typeof structuredEditResponseSchema
>;
export type EditProviderRequest = Readonly<{
  instruction: string;
  context: Readonly<Pick<Project, "name" | "description" | "blocks">>;
}>;
export interface StructuredEditProvider {
  readonly id: string;
  readonly source?: LiveEditSource;
  /** Raw untrusted JSON; the host alone validates and creates proposal metadata. */
  propose(request: EditProviderRequest, signal: AbortSignal): Promise<string>;
}
const LIMITS = {
  responseBytes: 131_072,
  contextBytes: 131_072,
  timeoutMs: 45_000,
} as const;
const bytes = (text: string) => new TextEncoder().encode(text).byteLength;

/** No backend, network, credentials, or live model. A fixture may inject synthetic transport. */
export function createSyntheticEditProvider(
  transport: (
    request: EditProviderRequest,
    signal: AbortSignal,
  ) => Promise<string> = async () => {
    throw new Error("Synthetic edit fixture unavailable for this instruction.");
  },
): StructuredEditProvider {
  return { id: "synthetic", propose: transport };
}

/** Provider output cannot supply project identity, revision, snapshot, proposal ID, or new block IDs. */
export async function createStructuredEditProposal(
  base: Project,
  instruction: string,
  provider: StructuredEditProvider,
  signal: AbortSignal,
  timeoutMs: number = LIMITS.timeoutMs,
): Promise<EditProposal> {
  const project = projectSchema.parse(base);
  let source: LiveEditSource | undefined;
  if (provider.id === "openrouter-edit")
    source = liveEditSourceSchema.parse(provider.source);
  else if (provider.source !== undefined)
    throw new Error("Invalid edit provider source.");
  if (
    typeof instruction !== "string" ||
    !instruction.trim() ||
    instruction.length > 10_000
  )
    throw new Error("Invalid edit instruction.");
  // Never expose the canonical baseline to even an injected transport.
  const context = structuredClone({
    name: project.name,
    ...(project.description === undefined
      ? {}
      : { description: project.description }),
    blocks: project.blocks,
  });
  if (bytes(JSON.stringify(context)) > LIMITS.contextBytes)
    throw new Error("Edit context is too large.");
  const controller = new AbortController();
  const relay = () => controller.abort(signal.reason);
  if (signal.aborted) relay();
  else signal.addEventListener("abort", relay, { once: true });
  const bounded = Number.isFinite(timeoutMs)
    ? Math.min(LIMITS.timeoutMs, Math.max(1, timeoutMs))
    : LIMITS.timeoutMs;
  const deadline = performance.now() + bounded;
  const timeout = () =>
    controller.abort(new DOMException("Edit deadline", "TimeoutError"));
  // A synchronous transport/validator can delay the event loop's timer callback.
  const assertActive = () => {
    if (!controller.signal.aborted && performance.now() >= deadline) timeout();
    if (controller.signal.aborted) throw abortFailure(controller.signal);
  };
  const timer = setTimeout(timeout, bounded);
  try {
    const raw = await abortableGeneration(
      () => provider.propose({ instruction, context }, controller.signal),
      controller.signal,
    );
    assertActive();
    if (typeof raw !== "string" || bytes(raw) > LIMITS.responseBytes)
      throw new Error("Invalid edit response size.");
    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch {
      throw new Error("Invalid edit response JSON.");
    }
    const parsed = structuredEditResponseSchema.safeParse(value);
    if (!parsed.success) throw new Error("Invalid structured edit response.");
    assertActive();
    const used = new Set(project.blocks.map((block) => block.id));
    const operations = parsed.data.operations.map((operation) => {
      if (operation.op !== "add") return operation;
      let id = crypto.randomUUID();
      while (used.has(id)) id = crypto.randomUUID();
      used.add(id);
      return { ...operation, block: { ...operation.block, id } };
    });
    const proposal = createEditProposal(
      project,
      instruction,
      operations,
      source,
    );
    assertActive();
    return proposal;
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", relay);
  }
}
