import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import winston from "winston";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const logsDir = path.resolve(__dirname, "../../logs");

fs.mkdirSync(logsDir, { recursive: true });

const devConsoleFormat = winston.format.printf(
  ({ timestamp, level, message, service, action, context, stack, ...meta }) => {
    const segments = [`${timestamp} ${level.toUpperCase()}: ${message}`];

    if (service) {
      segments.push(`service=${String(service)}`);
    }

    if (action) {
      segments.push(`action=${String(action)}`);
    }

    const extraMeta = {
      ...(context ? { context } : {}),
      ...(stack ? { stack } : {}),
      ...meta,
    };

    if (Object.keys(extraMeta).length > 0) {
      segments.push(JSON.stringify(extraMeta));
    }

    return segments.join(" | ");
  },
);

const fileFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json(),
);

const consoleFormat =
  process.env.NODE_ENV === "development"
    ? winston.format.combine(
        winston.format.colorize(),
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        devConsoleFormat,
      )
    : fileFormat;

export const logger = winston.createLogger({
  level:
    process.env.LOG_LEVEL ??
    (process.env.NODE_ENV === "development" ? "debug" : "info"),
  defaultMeta: {
    app: "rentmart-server",
    env: process.env.NODE_ENV || "development",
  },
  transports: [
    new winston.transports.Console({
      format: consoleFormat,
    }),
    new winston.transports.File({
      filename: path.join(logsDir, "error.log"),
      level: "error",
      format: fileFormat,
    }),
    new winston.transports.File({
      filename: path.join(logsDir, "combined.log"),
      format: fileFormat,
    }),
  ],
});
