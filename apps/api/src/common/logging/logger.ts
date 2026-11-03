import pino from "pino";

const redactPaths = [
  "*.authorization",
  "*.password",
  "*.token",
  "*.token.*",
  "*.accessToken",
  "*.refreshToken",
  "*.apiKey",
  "*.secret",
  "req.headers.authorization",
  "req.headers.cookie",
  "res.headers.authorization",
];

export function createLogger(name: string) {
  return pino({
    name,
    level: process.env["LOG_LEVEL"] ?? "info",
    redact: { paths: redactPaths, censor: "[REDACTED]" },
    transport:
      process.env["NODE_ENV"] === "development"
        ? { target: "pino-pretty", options: { colorize: true } }
        : undefined,
  });
}

export type AppLogger = ReturnType<typeof createLogger>;
