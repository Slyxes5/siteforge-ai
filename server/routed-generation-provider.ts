import {
  GENERATION_LIMITS,
  type WebsiteGenerationProvider,
  type WebsiteGenerationRequest,
} from "../src/ai/website-generation";
import {
  modelRouterConfigSchema,
  type ModelRouterConfig,
} from "./model-router-config";
import { createModelRouter } from "./model-router";
import { buildWebsitePlanRequestBody } from "./website-plan-request";

export function createRoutedGenerationProvider(
  config: ModelRouterConfig,
  factory: (model: string) => WebsiteGenerationProvider,
): WebsiteGenerationProvider {
  const parsed = modelRouterConfigSchema.safeParse(config);
  if (!parsed.success) throw new Error("Model router configuration refused.");
  const settings = parsed.data;
  const providers = settings.models.map((model) => {
    const provider = factory(model);
    if (
      provider.model !== model ||
      provider.outputFormat !== "website-plan-v1" ||
      provider.id !== "gemini"
    )
      throw new Error("Incompatible model adapter.");
    return provider;
  });
  const router = createModelRouter<WebsiteGenerationRequest, { text: string }>({
    ...settings,
    totalTimeoutMs: Math.min(
      settings.totalTimeoutMs,
      GENERATION_LIMITS.totalTimeoutMs,
    ),
    validate: (input) => {
      buildWebsitePlanRequestBody(input);
    },
    models: providers.map((provider) => ({
      model: provider.model,
      invoke: (request, signal, dispatch) =>
        provider.generate(request, signal, { onTransportCall: dispatch }),
    })),
  });
  return {
    id: "gemini",
    model: providers[0].model,
    outputFormat: "website-plan-v1",
    attemptPolicy: "router",
    async generate(request, signal, context) {
      const result = await router.run(
        request,
        signal,
        context?.onRoutingUpdate,
        context?.onTransportCall,
      );
      return { text: result.value.text, model: result.model };
    },
  };
}
