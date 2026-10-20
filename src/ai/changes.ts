import { z } from "zod";
import { projectSchema, type Project } from "../project-schema/project";
export const changeSetSchema = z.strictObject({
  projectId: z.string().min(1),
  baseRevision: z.number().int().nonnegative(),
  operations: z
    .array(
      z.strictObject({
        type: z.literal("setText"),
        blockId: z.string().min(1),
        text: z.string().min(1).max(10000),
      }),
    )
    .min(1)
    .max(200),
});
export type ChangeSet = z.infer<typeof changeSetSchema>;
/** Pure, atomic operation: never mutates the caller's document. */
export function applyChanges(project: Project, input: unknown): Project {
  const current = projectSchema.parse(project);
  const changes = changeSetSchema.parse(input);
  if (changes.projectId !== current.id) throw new Error("Project mismatch");
  if (changes.baseRevision !== current.revision)
    throw new Error("Revision conflict");
  for (const operation of changes.operations) {
    const block = current.blocks.find(
      (block) => block.id === operation.blockId,
    );
    if (!block) throw new Error("Unknown block");
    block.text = operation.text;
  }
  return projectSchema.parse({ ...current, revision: current.revision + 1 });
}
