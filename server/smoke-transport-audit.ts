export interface SmokeTransportEvent {
  transportCalls: number;
  providerStatus: number | null;
  transportState: "dispatched" | "headers" | "network_error";
}
export function createSmokeTransportAudit(
  transport: typeof fetch,
  record: (event: SmokeTransportEvent) => void,
): typeof fetch {
  let calls = 0;
  return async (input, init) => {
    // Metadata sink must work before dispatch; never retain headers, body, URL or errors.
    record({
      transportCalls: ++calls,
      providerStatus: null,
      transportState: "dispatched",
    });
    let response: Response;
    try {
      response = await transport(input, init);
    } catch (error) {
      record({
        transportCalls: calls,
        providerStatus: null,
        transportState: "network_error",
      });
      throw error;
    }
    record({
      transportCalls: calls,
      providerStatus: response.status,
      transportState: "headers",
    });
    return response;
  };
}
