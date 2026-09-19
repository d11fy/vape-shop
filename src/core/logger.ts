import 'server-only';

/**
 * Structured logging.
 *
 * Production emits one JSON object per line so any log shipper can index it;
 * development prints something a human can scan. Sensitive keys are redacted
 * centrally — a password or a session token must never reach a log sink.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type LogChannel = 'app' | 'security' | 'audit' | 'db' | 'http';

const REDACTED_KEYS = new Set([
  'password',
  'passwordhash',
  'currentpassword',
  'newpassword',
  'confirmpassword',
  'token',
  'tokenhash',
  'secret',
  'authorization',
  'cookie',
  'apikey',
]);

const LEVEL_WEIGHT: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const MIN_LEVEL: LogLevel = process.env.NODE_ENV === 'production' ? 'info' : 'debug';

function redact(value: unknown, depth = 0): unknown {
  if (depth > 4) return '[deep]';
  if (value === null || value === undefined) return value;
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => redact(item, depth + 1));
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      out[key] = REDACTED_KEYS.has(key.toLowerCase()) ? '[redacted]' : redact(item, depth + 1);
    }
    return out;
  }
  return value;
}

interface LogEntry {
  level: LogLevel;
  channel: LogChannel;
  message: string;
  context?: Record<string, unknown>;
}

function emit({ level, channel, message, context }: LogEntry): void {
  if (LEVEL_WEIGHT[level] < LEVEL_WEIGHT[MIN_LEVEL]) return;

  const payload = {
    ts: new Date().toISOString(),
    level,
    channel,
    message,
    ...(context ? { context: redact(context) as Record<string, unknown> } : {}),
  };

  const line =
    process.env.NODE_ENV === 'production'
      ? JSON.stringify(payload)
      : `[${level.toUpperCase()}] (${channel}) ${message}${
          context ? ` ${JSON.stringify(redact(context))}` : ''
        }`;

  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export const logger = {
  debug: (message: string, context?: Record<string, unknown>, channel: LogChannel = 'app') =>
    emit({ level: 'debug', channel, message, context }),
  info: (message: string, context?: Record<string, unknown>, channel: LogChannel = 'app') =>
    emit({ level: 'info', channel, message, context }),
  warn: (message: string, context?: Record<string, unknown>, channel: LogChannel = 'app') =>
    emit({ level: 'warn', channel, message, context }),
  error: (message: string, context?: Record<string, unknown>, channel: LogChannel = 'app') =>
    emit({ level: 'error', channel, message, context }),
  security: (message: string, context?: Record<string, unknown>) =>
    emit({ level: 'warn', channel: 'security', message, context }),
};
