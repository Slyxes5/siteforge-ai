/** Safe classification only. Never attach provider bodies, API keys, or prompts. */
import type { GenerationProblem } from "../src/ai/generation-validation";
import {
  classifyProviderHttp,
  providerRpcStatusSchema,
  type ProviderRpcStatus,
} from "../src/ai/provider-http";
export class ProviderError extends Error {
  constructor(
    readonly code:
      | "NETWORK"
      | "HTTP"
      | "REFUSAL"
      | "INVALID_OUTPUT"
      | "TOO_LARGE"
      | "REQUEST_CONTRACT",
    readonly status?: number,
    readonly retryAfterMs?: number,
    readonly diagnostic?: GenerationProblem,
    readonly rpcStatus?: ProviderRpcStatus,
  ) {
    super("Provider request failed.");
  }
  get httpDiagnostics() {
    const http =
      this.code === "HTTP" ? classifyProviderHttp(this.status) : undefined;
    const rpc = providerRpcStatusSchema.safeParse(this.rpcStatus);
    return http
      ? { ...http, ...(rpc.success ? { providerRpcStatus: rpc.data } : {}) }
      : undefined;
  }
  get retryable() {
    return (
      this.code === "NETWORK" ||
      this.httpDiagnostics?.providerRetryable === true
    );
  }
}
