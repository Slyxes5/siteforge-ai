import { z } from "zod";

export const designPresetIds = [
  "sage-editorial",
  "ocean-modern",
  "ember-studio",
  "midnight-product",
] as const;
export const designPresetSchema = z.enum(designPresetIds);
export type DesignPreset = z.infer<typeof designPresetSchema>;
export const projectDesignSchema = z.strictObject({
  preset: designPresetSchema,
});
export const designPresets = [
  {
    id: "sage-editorial",
    label: "Sage editorial",
    description: "Natural greens, serif headlines, generous space.",
  },
  {
    id: "ocean-modern",
    label: "Ocean modern",
    description: "Clear blues, bold sans serif, split hero layout.",
  },
  {
    id: "ember-studio",
    label: "Ember studio",
    description: "Warm terracotta, expressive type, centered introduction.",
  },
  {
    id: "midnight-product",
    label: "Midnight product",
    description: "Dark surfaces, blue accents, compact modern layout.",
  },
] satisfies { id: DesignPreset; label: string; description: string }[];
