import { LogEntry, LogLevel } from '@faultless/core';

export interface LogFormatter {
  format(entry: LogEntry): string;
}

export class JSONFormatter implements LogFormatter {
  format(entry: LogEntry): string {
    return JSON.stringify({
      timestamp: entry.timestamp.toISOString(),
      level: entry.level,
      message: entry.message,
      context: entry.context,
      ...entry.metadata,
    });
  }
}

export class PrettyFormatter implements LogFormatter {
  private colors: Record<LogLevel, string> = {
    fatal: '\x1b[35m',
    error: '\x1b[31m',
    warn: '\x1b[33m',
    info: '\x1b[36m',
    debug: '\x1b[32m',
    trace: '\x1b[90m',
  };

  private reset = '\x1b[0m';

  format(entry: LogEntry): string {
    const color = this.colors[entry.level] ?? '';
    const time = entry.timestamp.toISOString();
    const level = entry.level.toUpperCase().padEnd(5);
    const context = entry.context ? ` [${entry.context}]` : '';
    const metadata = entry.metadata && Object.keys(entry.metadata).length > 0
      ? ` ${JSON.stringify(entry.metadata)}`
      : '';

    return `${color}${time} ${level}${this.reset}${context}: ${entry.message}${metadata}`;
  }
}

export class SimpleFormatter implements LogFormatter {
  format(entry: LogEntry): string {
    const time = entry.timestamp.toLocaleTimeString();
    const level = entry.level.toUpperCase().padEnd(5);
    const context = entry.context ? ` [${entry.context}]` : '';
    return `${time} ${level}${context}: ${entry.message}`;
  }
}

export class LogfmtFormatter implements LogFormatter {
  format(entry: LogEntry): string {
    const parts = [
      `time="${entry.timestamp.toISOString()}"`,
      `level=${entry.level}`,
      `msg="${entry.message.replace(/"/g, '\\"')}"`,
    ];

    if (entry.context) {
      parts.push(`context="${entry.context}"`);
    }

    if (entry.metadata) {
      for (const [key, value] of Object.entries(entry.metadata)) {
        if (typeof value === 'string') {
          parts.push(`${key}="${value.replace(/"/g, '\\"')}"`);
        } else {
          parts.push(`${key}=${JSON.stringify(value)}`);
        }
      }
    }

    return parts.join(' ');
  }
}

export function createFormatter(type: 'json' | 'pretty' | 'simple' | 'logfmt'): LogFormatter {
  switch (type) {
    case 'json':
      return new JSONFormatter();
    case 'pretty':
      return new PrettyFormatter();
    case 'simple':
      return new SimpleFormatter();
    case 'logfmt':
      return new LogfmtFormatter();
    default:
      return new JSONFormatter();
  }
}