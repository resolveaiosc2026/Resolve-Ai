import { env } from '../config/env.js';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';
type LogContext = Record<string, unknown>;

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function write(level: LogLevel, message: string, context?: LogContext): void {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[env.LOG_LEVEL]) return;

  const line = `${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} ${message}`;
  const output = context ? `${line} ${JSON.stringify(context)}` : line;

  if (level === 'error') console.error(output);
  else if (level === 'warn') console.warn(output);
  else console.log(output);
}

/** Minimal structured logger. Swap the implementation (e.g. pino) without touching callers. */
export const logger = {
  debug: (message: string, context?: LogContext) => write('debug', message, context),
  info: (message: string, context?: LogContext) => write('info', message, context),
  warn: (message: string, context?: LogContext) => write('warn', message, context),
  error: (message: string, context?: LogContext) => write('error', message, context),
};
