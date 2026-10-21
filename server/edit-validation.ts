import { blockSchema } from "../src/project-schema/project";
import type {
  EditProviderRequest,
  StructuredEditOperations,
} from "../src/ai/structured-edit";

/** Check references/types in detached scratch state; never create a project, proposal, or new block ID.
 * Full snapshot, anchor and grounding validation remains createStructuredEditProposal's job.
 */
export function assertEditTargets(
  context: EditProviderRequest["context"],
  response: StructuredEditOperations,
): void {
  const blocks = new Map(context.blocks.map((block) => [block.id, block]));
  let additions = 0;
  for (const operation of response.operations) {
    if (operation.op === "add") {
      if (operation.afterId !== null && !blocks.has(operation.afterId))
        throw new Error("Unknown edit target.");
      additions++;
    } else if (operation.op === "reorder") {
      if (
        operation.blockIds.length !== blocks.size + additions ||
        new Set(operation.blockIds).size !== operation.blockIds.length ||
        operation.blockIds.some((id) => !blocks.has(id))
      )
        throw new Error("Invalid edit order.");
    } else {
      const block = blocks.get(operation.blockId);
      if (!block) throw new Error("Unknown edit target.");
      if (operation.op === "remove") blocks.delete(operation.blockId);
      else
        blocks.set(
          block.id,
          blockSchema.parse({ ...block, ...operation.changes }),
        );
    }
  }
  if (blocks.size + additions > 200) throw new Error("Too many blocks.");
}
