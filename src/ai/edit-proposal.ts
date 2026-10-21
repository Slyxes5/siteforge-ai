import { z } from "zod";
import {
  blockSchema,
  projectSchema,
  type Project,
} from "../project-schema/project";
import { assertGroundedContent } from "./generation-grounding";
import { liveEditSourceSchema, type LiveEditSource } from "./edit-source";

const updateSchema = z.strictObject({
  op: z.literal("update"),
  blockId: z.string().min(1).max(200),
  changes: z.record(z.string(), z.unknown()).refine((changes) => {
    const keys = Object.keys(changes);
    const editable = [
      ...visibleFields,
      "href",
      "ctaHref",
      "src",
      "tone",
      "layout",
      "items",
    ];
    try {
      return (
        keys.length > 0 &&
        keys.length <= 10 &&
        keys.every((key) => editable.includes(key)) &&
        JSON.stringify(changes).length <= 100_000
      );
    } catch {
      return false;
    }
  }, "Update changes must contain editable fields only; id and type are immutable."),
});
const operationSchema = z.discriminatedUnion("op", [
  updateSchema,
  z.strictObject({
    op: z.literal("add"),
    block: blockSchema,
    afterId: z.string().min(1).nullable(),
  }),
  z.strictObject({ op: z.literal("remove"), blockId: z.string().min(1) }),
  z.strictObject({
    op: z.literal("reorder"),
    blockIds: z.array(z.string().min(1)).max(200),
  }),
]);
export const editProposalSchema = z
  .strictObject({
    id: z.string().uuid(),
    version: z.literal(1),
    mode: z.enum(["mock", "live"]),
    source: liveEditSourceSchema.optional(),
    projectId: z.string().min(1),
    baseRevision: z.number().int().nonnegative(),
    baseSnapshot: z.string().min(1).max(8_000_000),
    request: z.string().trim().min(1).max(10000),
    summary: z.string().trim().min(1).max(2000),
    operations: z.array(operationSchema).min(1).max(100),
  })
  .refine(
    (value) => (value.mode === "live") === (value.source !== undefined),
    "Live proposals must identify their source; mock proposals cannot claim a live source.",
  );
export type EditProposal = z.infer<typeof editProposalSchema>;
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, item]) => [key, canonical(item)]),
    );
  }
  return value;
}
/** Canonical JSON: sorted object keys at every depth, array order preserved. */
export function projectSnapshot(project: Project): string {
  return JSON.stringify(canonical(projectSchema.parse(project)));
}
const visibleFields = [
  "text",
  "subtitle",
  "ctaText",
  "body",
  "alt",
  "email",
  "phone",
  "address",
];
function visibleContent(project: Project): string {
  return project.blocks
    .flatMap((block) => {
      const record = block as Record<string, unknown>;
      const values = visibleFields
        .map((key) => record[key])
        .filter((value): value is string => typeof value === "string");
      if (block.type === "features")
        values.push(
          ...block.items.flatMap((item) => [item.title, item.description]),
        );
      return values;
    })
    .join("\n");
}
function withoutUrls(source: string): string {
  return source.replace(/https?:\/\/[^\s"<>]+/gi, " ");
}
function factContent(value: unknown): unknown {
  if (typeof value === "string") return withoutUrls(value);
  if (Array.isArray(value)) return value.map(factContent);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, factContent(item)]),
    );
  return value;
}
function groundingRequest(request: string): string {
  // Remove command structure, never matching IDs inside the supplied JSON value.
  return request
    .split(/\r?\n/)
    .map((line) => {
      const source = line.trim();
      const update = /^(?:update|ubah)\s+\S+\s+\S+(?:\s+(.+))?$/.exec(source);
      const add = /^add\s+\S+\s+after\s+\S+(?:\s+(.+))?$/.exec(source);
      if (update || add) return withoutUrls((update ?? add)![1] ?? "");
      if (/^(?:remove|reorder)\s+/.test(source)) return "";
      return withoutUrls(source);
    })
    .join("\n");
}
const urlFields = ["href", "ctaHref", "src"];
function assertAnchors(current: Project, result: Project): void {
  // Only these block renderers emit a DOM id; other schema IDs are not targets.
  const renderedIds = (project: Project) =>
    new Set(
      project.blocks
        .filter((block) =>
          ["section", "features", "contact"].includes(block.type),
        )
        .map((block) => block.id),
    );
  const beforeIds = renderedIds(current);
  const afterIds = renderedIds(result);
  const original = new Map(current.blocks.map((block) => [block.id, block]));
  for (const block of result.blocks) {
    for (const field of urlFields) {
      const value = (block as Record<string, unknown>)[field];
      if (
        typeof value !== "string" ||
        !value.startsWith("#") ||
        value === "#" ||
        afterIds.has(value.slice(1))
      )
        continue;
      const previous = original.get(block.id) as
        Record<string, unknown> | undefined;
      if (previous?.[field] === value && !beforeIds.has(value.slice(1)))
        continue;
      throw new Error(
        `Dangling anchor ${value}: retain its target or change/remove the referring link.`,
      );
    }
  }
}
function assertGroundedUrls(
  current: Project,
  result: Project,
  request: string,
): void {
  const supplied = new Set<string>();
  for (const block of current.blocks) {
    const record = block as Record<string, unknown>;
    for (const field of urlFields)
      if (typeof record[field] === "string") supplied.add(record[field]);
  }
  for (const source of [
    current.name,
    current.description ?? "",
    visibleContent(current),
    request,
  ]) {
    for (const match of source.matchAll(
      /https?:\/\/[^\s"'<>\\]+|(?:^|[\s"'])(\/(?!\/)[^\s"'<>\\]+)/gi,
    ))
      supplied.add(match[1] ?? match[0]);
  }
  for (const block of result.blocks) {
    const record = block as Record<string, unknown>;
    for (const field of urlFields) {
      const value = record[field];
      if (
        typeof value === "string" &&
        value &&
        (field === "src" || /^https?:/i.test(value)) &&
        !supplied.has(value)
      ) {
        throw new Error(
          `Ungrounded URL or image source: supply the exact ${field} in the request.`,
        );
      }
    }
  }
}
export function createEditProposal(
  base: Project,
  request: string,
  operations: unknown[],
  source?: LiveEditSource,
): EditProposal {
  const proposal = editProposalSchema.parse({
    id: crypto.randomUUID(),
    version: 1,
    mode: source ? "live" : "mock",
    ...(source ? { source } : {}),
    projectId: base.id,
    baseRevision: base.revision,
    baseSnapshot: projectSnapshot(base),
    request,
    summary: `Preview ${operations.length} block edit(s).`,
    operations,
  });
  previewEditProposal(base, proposal);
  return structuredClone(proposal);
}
export function previewEditProposal(current: Project, input: unknown): Project {
  const proposal = editProposalSchema.parse(input);
  const result = projectSchema.parse(current);
  if (
    proposal.projectId !== current.id ||
    proposal.baseRevision !== current.revision ||
    proposal.baseSnapshot !== projectSnapshot(current)
  ) {
    throw new Error(
      "Stale proposal baseline: create a new proposal from the current project.",
    );
  }
  const usedIds = new Set(result.blocks.map((block) => block.id));
  for (const operation of proposal.operations) {
    if (operation.op === "add") {
      if (usedIds.has(operation.block.id))
        throw new Error(`Duplicate or reused block ID: ${operation.block.id}`);
      usedIds.add(operation.block.id);
      const index =
        operation.afterId === null
          ? -1
          : result.blocks.findIndex((block) => block.id === operation.afterId);
      if (operation.afterId !== null && index === -1)
        throw new Error(`Unknown add target: ${operation.afterId}`);
      result.blocks.splice(index + 1, 0, operation.block);
    } else if (operation.op === "reorder") {
      const blocks = new Map(result.blocks.map((block) => [block.id, block]));
      if (
        operation.blockIds.length !== blocks.size ||
        new Set(operation.blockIds).size !== blocks.size ||
        operation.blockIds.some((id) => !blocks.has(id))
      ) {
        throw new Error(
          "Reorder must be an exact full permutation of current block IDs.",
        );
      }
      result.blocks = operation.blockIds.map((id) => blocks.get(id)!);
    } else {
      const index = result.blocks.findIndex(
        (block) => block.id === operation.blockId,
      );
      if (index === -1)
        throw new Error(`Unknown block target: ${operation.blockId}`);
      if (operation.op === "remove") result.blocks.splice(index, 1);
      else
        result.blocks[index] = blockSchema.parse({
          ...result.blocks[index],
          ...operation.changes,
        });
    }
  }
  const parsed = projectSchema.parse(result);
  assertAnchors(current, parsed);
  assertGroundedUrls(current, parsed, proposal.request);
  // Reuse the generation helper's deterministic fact checks, not an assertion of
  // arbitrary prose truth (e.g. awards or nonnumeric street names in body text).
  try {
    assertGroundedContent(parsed.blocks.map(factContent), {
      name: withoutUrls(current.name),
      prompt: [
        withoutUrls(current.description ?? ""),
        withoutUrls(visibleContent(current)),
        groundingRequest(proposal.request),
      ].join("\n"),
    });
  } catch {
    throw new Error(
      "UNSUPPORTED_BUSINESS_FACT: supply numeric, email and contact facts in the request or original visible content.",
    );
  }
  return parsed;
}
