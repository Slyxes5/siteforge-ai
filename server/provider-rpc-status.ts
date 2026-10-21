import {
  providerRpcStatusSchema,
  type ProviderRpcStatus,
} from "../src/ai/provider-http";

export const RPC_DIAGNOSTIC_LIMITS = Object.freeze({
  bytes: 4096,
  timeoutMs: 150,
});
/** Optional, bounded error-envelope inspection. Return ONLY an allowlisted enum.
 * Never retain/reflect message, details, body, headers or arbitrary status strings.
 * Unknown, oversized, malformed or stalled diagnostics must not replace the known HTTP error.
 */
export async function readProviderRpcStatus(
  response: Response,
  signal: AbortSignal,
): Promise<ProviderRpcStatus | undefined> {
  if (
    !response.body ||
    Number(response.headers.get("content-length")) > RPC_DIAGNOSTIC_LIMITS.bytes
  ) {
    void response.body?.cancel().catch(() => {});
    return;
  }
  let reader: ReadableStreamDefaultReader<Uint8Array>;
  try {
    reader = response.body.getReader();
  } catch {
    return;
  }
  const stopped = Symbol("diagnostic unavailable");
  let stop!: () => void;
  const deadline = new Promise<typeof stopped>((resolve) => {
    stop = () => {
      resolve(stopped);
      void reader.cancel().catch(() => {});
    };
  });
  const timer = setTimeout(stop, RPC_DIAGNOSTIC_LIMITS.timeoutMs);
  signal.addEventListener("abort", stop, { once: true });
  try {
    if (signal.aborted) return;
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const chunk = await Promise.race([reader.read(), deadline]);
      if (chunk === stopped || signal.aborted) return;
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > RPC_DIAGNOSTIC_LIMITS.bytes) return;
      chunks.push(chunk.value);
    }
    const data: unknown = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)),
    );
    if (typeof data !== "object" || data === null || !("error" in data)) return;
    const error = data.error;
    if (
      typeof error !== "object" ||
      error === null ||
      !("code" in error) ||
      error.code !== response.status ||
      !("status" in error)
    )
      return;
    const parsed = providerRpcStatusSchema.safeParse(error.status);
    return parsed.success ? parsed.data : undefined;
  } catch {
    return;
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", stop);
    void reader.cancel().catch(() => {});
    try {
      reader.releaseLock();
    } catch {
      /* Non-cooperative stream: never wait beyond the diagnostic bound. */
    }
  }
}
