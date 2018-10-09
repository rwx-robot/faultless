export type LogLevel = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';

export const LOG_LEVELS: Record<LogLevel, number> = {
  fatal: 60,
  error: 50,
  warn: 40,
  info: 30,
  debug: 20,
  trace: 10,
};

export const LOG_LEVEL_NAMES: Record<number, LogLevel> = {
  60: 'fatal',
  50: 'error',
  40: 'warn',
  30: 'info',
  20: 'debug',
  10: 'trace',
};

export function getLevelValue(level: LogLevel | number): number {
  if (typeof level === 'number') return level;
  return LOG_LEVELS[level];
}

export function getLevelName(value: number): LogLevel {
  return LOG_LEVEL_NAMES[value] ?? 'info';
}

export function isLevelEnabled(currentLevel: LogLevel | number, targetLevel: LogLevel | number): boolean {
  return getLevelValue(targetLevel) >= getLevelValue(currentLevel);
}