const SECRET_PATTERNS = [
  /croo_sk_[A-Za-z0-9._-]+/g,
  /(key=)[^&\s]+/gi,
  /(X-SDK-Key["']?\s*[:=]\s*["']?)[^"',\s}]+/gi,
  /(Authorization["']?\s*[:=]\s*["']?Bearer\s+)[^"',\s}]+/gi,
  /(Authorization["']?\s*[:=]\s*["']?)[^"',\s}]+/gi
];

type LogMethod = (message?: unknown, ...optionalParams: unknown[]) => void;

export type RedactedLogger = {
  info: LogMethod;
  warn: LogMethod;
  error: LogMethod;
  debug: LogMethod;
};

export function createRedactedLogger(base: RedactedLogger = console): RedactedLogger {
  return {
    info: (message, ...optionalParams) => base.info(redactValue(message), ...optionalParams.map(redactValue)),
    warn: (message, ...optionalParams) => base.warn(redactValue(message), ...optionalParams.map(redactValue)),
    error: (message, ...optionalParams) => base.error(redactValue(message), ...optionalParams.map(redactValue)),
    debug: (message, ...optionalParams) => base.debug(redactValue(message), ...optionalParams.map(redactValue))
  };
}

export function redactValue(value: unknown): unknown {
  if (typeof value === "string") return redactString(value);
  if (Array.isArray(value)) return value.map(redactValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        /sdk-key|authorization/i.test(key) ? "[REDACTED]" : redactValue(entry)
      ])
    );
  }
  return value;
}

function redactString(value: string) {
  return SECRET_PATTERNS.reduce((current, pattern) => current.replace(pattern, (match, prefix: string | undefined) => {
    if (prefix) return `${prefix}[REDACTED]`;
    return "[REDACTED]";
  }), value);
}
