export class CrooConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CrooConfigError";
  }
}

export class CrooTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CrooTimeoutError";
  }
}

export class CrooDeliveryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CrooDeliveryError";
  }
}

export function normalizeCrooError(error: unknown): string {
  if (error instanceof CrooConfigError || error instanceof CrooTimeoutError || error instanceof CrooDeliveryError) {
    return error.message;
  }
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    const reason = "reason" in error && typeof error.reason === "string" ? error.reason.toLowerCase() : "";
    if (message.includes("balance")) return "CROO payment failed because the coordinator balance is insufficient.";
    if (reason.includes("unauthorized") || message.includes("unauthorized")) return "CROO rejected the SDK key. Check the configured agent credentials.";
    if (reason.includes("not found") || message.includes("not found")) return "The configured PolicyLock service was not found.";
    if (reason.includes("invalid") || message.includes("invalid status")) return "CROO rejected the request because the order is in an invalid state.";
    if (message.includes("timeout")) return message;
    if (message.includes("rejected")) return "The specialist agent rejected the order.";
    if (message.includes("apierror")) return `CROO API error: ${error.message}`;
    return error.message;
  }
  return "Unknown CROO orchestration error.";
}
