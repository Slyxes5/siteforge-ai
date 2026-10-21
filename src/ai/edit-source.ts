import { z } from "zod";

// Public identity only. No credential or provider configuration belongs in the browser.
export const OPENROUTER_EDIT_MODEL = "nvidia/nemotron-3.5-super-vl:free";
export const liveEditSourceSchema = z.strictObject({
  provider: z.literal("openrouter"),
  model: z.literal(OPENROUTER_EDIT_MODEL),
});
export type LiveEditSource = z.infer<typeof liveEditSourceSchema>;
