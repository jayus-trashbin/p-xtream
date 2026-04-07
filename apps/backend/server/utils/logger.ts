type LogLevel = 'info' | 'warn' | 'error' | 'debug';

interface LogContext {
  evt?: string;
  [key: string]: any;
}

interface Logger {
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
  debug(message: string, context?: LogContext): void;
}

function createLogger(scope: string): Logger {
  const log = (level: LogLevel, message: string, context?: LogContext) => {
    const isDev = process.env.NODE_ENV !== 'production';
    if (!isDev && level === 'debug') return;

    if (isDev) {
      console[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log'](`[${level.toUpperCase()}] ${message}`, context ?? '');
    } else {
      const timestamp = new Date().toISOString();
      const logData = {
        timestamp,
        level,
        scope,
        message,
        ...context,
      };
      if (level === 'error') {
        console.error(JSON.stringify(logData));
      } else if (level === 'warn') {
        console.warn(JSON.stringify(logData));
      } else {
        console.log(JSON.stringify(logData));
      }
    }
  };

  return {
    info: (message: string, context?: LogContext) => log('info', message, context),
    warn: (message: string, context?: LogContext) => log('warn', message, context),
    error: (message: string, context?: LogContext) => log('error', message, context),
    debug: (message: string, context?: LogContext) => log('debug', message, context),
  };
}

export function scopedLogger(scope: string): Logger {
  return createLogger(scope);
}
