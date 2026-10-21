import { z } from "zod";
import { designPresetSchema } from "../project-schema/design";
import type { Project } from "../project-schema/project";
import type { GenerationDiagnostics } from "./generation-observation";
import type { ModelRouting } from "./model-routing";
export const GENERATION_PROMPT_VERSION = 2 as const;
export const GENERATION_LIMITS = {
  promptCharacters: 4000,
  blocks: 12,
  textCharacters: 2000,
  outputTokens: 4096,
  responseBytes: 131072,
  requestBytes: 16384,
  timeoutMs: 45000,
  totalTimeoutMs: 90000,
  maxAttempts: 2,
} as const;
export const websiteGenerationRequestSchema = z.strictObject({
  name: z.string().trim().min(1).max(200),
  prompt: z.string().trim().min(1).max(GENERATION_LIMITS.promptCharacters),
  designPreference: designPresetSchema.optional(),
});
export type WebsiteGenerationRequest = z.infer<
  typeof websiteGenerationRequestSchema
>;
/** Separate from AIProvider.proposeChanges: only new website content, never edits or persistence. */
export interface WebsiteGenerationProvider {
  readonly id: "gemini" | "openrouter" | "mock";
  readonly model: string;
  /** Absent means legacy M2C content; explicit plan selection never falls back on parse errors. */
  readonly outputFormat?: "website-plan-v1" | "m2c";
  /** Prevent the HTTP server from adding retries outside a single-call adapter/router. */
  readonly attemptPolicy?: "single" | "router";
  /** Synthetic envelopes can retain honest mock provenance with transport identity metadata. */
  readonly telemetryProvider?: "openrouter";
  generate(
    request: WebsiteGenerationRequest,
    signal: AbortSignal,
    context?: {
      onTransportCall?: () => void;
      /** Numeric upstream HTTP status only; no headers, raw bodies or credentials. */
      onProviderStatus?: (status: number) => void;
      onRoutingUpdate?: (routing: ModelRouting) => void;
    },
  ): Promise<{ text: string; model?: string }>;
}
export type GenerationStatus = {
  mode: "disabled" | "mock" | "live";
  model: string;
  sessionToken: string;
};
export type GenerationResult = {
  candidate: Project;
  mode: "mock" | "live";
  diagnostics?: GenerationDiagnostics;
};
