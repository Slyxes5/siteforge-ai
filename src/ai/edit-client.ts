import {
  EDIT_LIMITS,
  editRequestSchema,
  editStatusSchema,
  editResultSchema,
} from "./edit-contract";
import type { StructuredEditProvider } from "./structured-edit";
import { OPENROUTER_EDIT_MODEL } from "./edit-source";

type EditClientOutcome =
  | "cancelled"
  | "timeout"
  | "validation_error"
  | "provider_error"
  | "disabled"
  | "refused";
const messages: Record<EditClientOutcome, string> = {
  cancelled: "Edit request cancelled.",
  timeout: "Edit request timed out.",
  validation_error: "Invalid edit request or response.",
  provider_error: "Edit backend unavailable.",
  disabled: "Editing is disabled.",
  refused:
    "The edit request could not be fulfilled. Clarify the target or instruction.",
};
export class EditClientFailure extends Error {
  constructor(readonly outcome: EditClientOutcome) {
    super(messages[outcome]);
    this.name = "EditClientFailure";
  }
}

/** Never let a body cancellation promise delay rejection. */
function cancelBody(body: { cancel(): Promise<unknown> } | null) {
  try {
    void body?.cancel().catch(() => {});
  } catch {
    // A locked or noncooperative body must not mask the original failure.
  }
}

function createDeadline(caller: AbortSignal, requested: number) {
  const controller = new AbortController();
  const bounded = Number.isFinite(requested)
    ? Math.min(EDIT_LIMITS.timeoutMs, Math.max(1, requested))
    : EDIT_LIMITS.timeoutMs;
  const deadline = performance.now() + bounded;
  let timedOut = false;
  const timeout = () => {
    if (!controller.signal.aborted) {
      timedOut = true;
      controller.abort();
    }
  };
  // Caller reasons are untrusted and cannot impersonate our deadline outcome.
  const relay = () => controller.abort();
  if (caller.aborted) relay();
  else caller.addEventListener("abort", relay, { once: true });
  const timer = setTimeout(timeout, bounded);
  const assertActive = () => {
    if (!controller.signal.aborted && performance.now() >= deadline) timeout();
    if (controller.signal.aborted)
      throw new EditClientFailure(timedOut ? "timeout" : "cancelled");
  };
  /** Race settlement, not just the signal delivered to a cooperative fetch. */
  function run<T>(
    operation: () => Promise<T>,
    discard?: (value: T) => void,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      try {
        assertActive();
      } catch (error) {
        reject(error);
        return;
      }
      const cleanup = () =>
        controller.signal.removeEventListener("abort", abort);
      const abort = () => {
        cleanup();
        try {
          assertActive();
        } catch (error) {
          reject(error);
        }
      };
      controller.signal.addEventListener("abort", abort, { once: true });
      let pending: Promise<T>;
      try {
        pending = operation();
      } catch (error) {
        cleanup();
        try {
          assertActive();
        } catch (inactive) {
          reject(inactive);
          return;
        }
        reject(error);
        return;
      }
      Promise.resolve(pending).then(
        (value) => {
          cleanup();
          try {
            assertActive();
          } catch (error) {
            discard?.(value);
            reject(error);
            return;
          }
          resolve(value);
        },
        (error) => {
          cleanup();
          try {
            assertActive();
          } catch (inactive) {
            reject(inactive);
            return;
          }
          reject(error);
        },
      );
    });
  }
  return {
    signal: controller.signal,
    assertActive,
    run,
    dispose() {
      clearTimeout(timer);
      caller.removeEventListener("abort", relay);
    },
  };
}
type Deadline = ReturnType<typeof createDeadline>;

async function readBounded(
  response: Response,
  scope: Deadline,
): Promise<unknown> {
  try {
    scope.assertActive();
  } catch (error) {
    cancelBody(response.body);
    throw error;
  }
  if (!response.ok) {
    cancelBody(response.body);
    throw new EditClientFailure(
      response.status === 504
        ? "timeout"
        : response.status === 422
          ? "refused"
          : "provider_error",
    );
  }
  const length = response.headers.get("Content-Length");
  const contentType = response.headers.get("Content-Type") ?? "";
  if (
    !/^application\/json(?:\s*;\s*charset\s*=\s*utf-8)?$/i.test(contentType) ||
    (length !== null &&
      (!/^\d+$/.test(length) ||
        !Number.isSafeInteger(Number(length)) ||
        Number(length) > EDIT_LIMITS.responseBytes)) ||
    !response.body
  ) {
    cancelBody(response.body);
    throw new EditClientFailure("validation_error");
  }
  const reader = response.body.getReader();
  let cancelled = false;
  const cancel = () => {
    if (!cancelled) {
      cancelled = true;
      cancelBody(reader);
    }
  };
  scope.signal.addEventListener("abort", cancel, { once: true });
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    scope.assertActive();
    while (true) {
      const { value, done } = await scope.run(() => reader.read());
      scope.assertActive();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > EDIT_LIMITS.responseBytes)
        throw new EditClientFailure("validation_error");
      chunks.push(value);
    }
    const combined = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) {
      combined.set(chunk, offset);
      offset += chunk.byteLength;
    }
    scope.assertActive();
    const value: unknown = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(combined),
    );
    scope.assertActive();
    return value;
  } catch {
    cancel();
    scope.assertActive();
    throw new EditClientFailure("validation_error");
  } finally {
    scope.signal.removeEventListener("abort", cancel);
    try {
      reader.releaseLock();
    } catch {
      /* A pending read may still own the lock. */
    }
  }
}

/** Same-origin transport pinned to an explicitly selected capability; mutations remain host-owned. */
export function createHttpEditProvider(
  transport: typeof fetch = fetch,
  options: {
    timeoutMs?: number;
    mode?: "mock" | "live";
    consent?: boolean;
  } = {},
): StructuredEditProvider {
  const mode = options.mode ?? "mock";
  return {
    id: mode === "live" ? "openrouter-edit" : "synthetic",
    ...(mode === "live"
      ? {
          source: {
            provider: "openrouter" as const,
            model: OPENROUTER_EDIT_MODEL,
          },
        }
      : {}),
    async propose(request, signal) {
      const scope = createDeadline(
        signal,
        options.timeoutMs ?? EDIT_LIMITS.timeoutMs,
      );
      try {
        scope.assertActive();
        if (
          !["mock", "live"].includes(mode) ||
          (mode === "live" && options.consent !== true)
        )
          throw new EditClientFailure("validation_error");
        let body: string;
        try {
          const parsed = editRequestSchema.safeParse(request);
          if (!parsed.success) throw new EditClientFailure("validation_error");
          body = JSON.stringify(parsed.data);
          if (
            new TextEncoder().encode(body).byteLength > EDIT_LIMITS.requestBytes
          )
            throw new EditClientFailure("validation_error");
        } catch {
          scope.assertActive();
          throw new EditClientFailure("validation_error");
        }
        scope.assertActive();
        const common = {
          credentials: "same-origin",
          cache: "no-store",
          redirect: "error",
          signal: scope.signal,
        } as const;
        const getResponse = (url: string, init: RequestInit) =>
          scope.run(
            () => transport(url, init),
            (late) => cancelBody(late.body),
          );
        const statusResponse = await getResponse("/api/edit/status", {
          ...common,
          method: "GET",
        });
        const parsedStatus = editStatusSchema.safeParse(
          await readBounded(statusResponse, scope),
        );
        scope.assertActive();
        if (!parsedStatus.success)
          throw new EditClientFailure("validation_error");
        const status = parsedStatus.data;
        if (status.mode === "disabled") throw new EditClientFailure("disabled");
        if (status.mode !== mode)
          throw new EditClientFailure("validation_error");
        const result = await getResponse("/api/edit/propose", {
          ...common,
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-SiteForge-Session": status.sessionToken,
            ...(mode === "live" ? { "X-SiteForge-Edit-Mode": "live" } : {}),
          },
          body,
        });
        const parsed = editResultSchema.safeParse(
          await readBounded(result, scope),
        );
        scope.assertActive();
        if (!parsed.success || parsed.data.mode !== mode)
          throw new EditClientFailure("validation_error");
        const raw = JSON.stringify(parsed.data.response);
        scope.assertActive();
        return raw;
      } catch (error) {
        scope.assertActive();
        if (error instanceof EditClientFailure)
          throw new EditClientFailure(error.outcome);
        throw new EditClientFailure("provider_error");
      } finally {
        scope.dispose();
      }
    },
  };
}
