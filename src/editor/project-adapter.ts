import { z } from "zod";
import type { Data } from "@puckeditor/core";
import {
  projectSchema,
  type Project,
  type Block,
} from "../project-schema/project";
export type Components = {
  [T in Block["type"]]: Omit<Extract<Block, { type: T }>, "id" | "type">;
};
const empty = z.strictObject({});
const puckEnvelope = z.strictObject({
  root: z.strictObject({ props: empty.optional() }),
  content: z
    .array(
      z.strictObject({
        type: z.string(),
        props: z.record(z.string(), z.unknown()),
      }),
    )
    .max(200),
  zones: z
    .record(z.string(), z.unknown())
    .optional()
    .refine(
      (zones) => !zones || Object.keys(zones).length === 0,
      "Nested zones are not supported in M1",
    ),
});
export function toPuckData(project: Project): Data<Components> {
  const valid = projectSchema.parse(project);
  return {
    root: { props: {} },
    content: valid.blocks.map(({ type, ...props }) => ({
      type,
      props,
    })) as Data<Components>["content"],
  };
}
export function fromPuckData(data: unknown, project: Project): Project {
  const envelope = puckEnvelope.parse(data);
  const base = projectSchema.parse(project);
  return projectSchema.parse({
    ...base,
    blocks: envelope.content.map(({ type, props }) => {
      if ("type" in props) throw new Error("Reserved component property: type");
      return { ...props, type };
    }),
  });
}
