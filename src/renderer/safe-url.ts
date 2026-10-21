import { safeUrlSchema } from "../project-schema/project";
/** Puck renders transient input before the canonical adapter accepts it. */
export function safeRenderUrl(value: string): string | undefined {
  return value && safeUrlSchema.safeParse(value).success ? value : undefined;
}
