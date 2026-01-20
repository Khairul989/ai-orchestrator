/**
 * CLI Error Handler - Error handling and retry logic for CLI operations
 */

import { EventEmitter } from 'events';

/**
 * CLI error types
 */
export enum CliError {
  NOT_INSTALLED = 'CLI_NOT_INSTALLED',
  NOT_AUTHENTICATED = 'CLI_NOT_AUTHENTICATED',
  TIMEOUT = 'CLI_TIMEOUT',
  PROCESS_CRASH = 'CLI_PROCESS_CRASH',
  PARSE_ERROR = 'CLI_PARSE_ERROR',
  PERMISSION_DENIED = 'CLI_PERMISSION_DENIED',
  NETWORK_ERROR = 'CLI_NETWORK_ERROR',
  RATE_LIMIT = 'CLI_RATE_LIMIT',
  INVALID_INPUT = 'CLI_INVALID_INPUT',
  UNKNOWN = 'CLI_UNKNOWN_ERROR',
}

/**
 * Fallback strategy for error handling
 */
export type FallbackStrategy = 'skip' | 'retry' | 'substitute' | 'fail';

/**
 * Error handler configuration
 */
export interface CliErrorHandler {
  error: CliError;
  fallbackStrategy: FallbackStrategy;
  maxRetries?: number;
  substituteProvider?: string;
  retryDelay?: number;
  userMessage: string;
}

/**
 * Retry options
 */
export interface RetryOptions {
  maxRetries: number;
  initialDelay: number;
  maxDelay: number;
  backoffFactor: number;
  retryCondition?: (error: Error) => boolean;
}

/**
 * Default error handlers
 */
export const DEFAULT_ERROR_HANDLERS: Record<CliError, CliErrorHandler> = {
  [CliError.NOT_INSTALLED]: {
    error: CliError.NOT_INSTALLED,
    fallbackStrategy: 'substitute',
    substituteProvider: 'api',
    userMessage: 'CLI not installed. Using API fallback.',
  },
  [CliError.NOT_AUTHENTICATED]: {
    error: CliError.NOT_AUTHENTICATED,
    fallbackStrategy: 'fail',
    userMessage: 'CLI not authenticated. Please configure authentication.',
  },
  [CliError.TIMEOUT]: {
    error: CliError.TIMEOUT,
    fallbackStrategy: 'retry',
    maxRetries: 2,
    retryDelay: 5000,
    userMessage: 'CLI timed out. Retrying...',
  },
  [CliError.PROCESS_CRASH]: {
    error: CliError.PROCESS_CRASH,
    fallbackStrategy: 'retry',
    maxRetries: 1,
    retryDelay: 2000,
    userMessage: 'CLI process crashed. Restarting...',
  },
  [CliError.PARSE_ERROR]: {
    error: CliError.PARSE_ERROR,
    fallbackStrategy: 'skip',
    userMessage: 'Failed to parse CLI output.',
  },
  [CliError.PERMISSION_DENIED]: {
    error: CliError.PERMISSION_DENIED,
    fallbackStrategy: 'fail',
    userMessage: 'Permission denied. Please check CLI permissions.',
  },
  [CliError.NETWORK_ERROR]: {
    error: CliError.NETWORK_ERROR,
    fallbackStrategy: 'retry',
    maxRetries: 3,
    retryDelay: 3000,
    userMessage: 'Network error. Retrying...',
  },
  [CliError.RATE_LIMIT]: {
    error: CliError.RATE_LIMIT,
    fallbackStrategy: 'retry',
    maxRetries: 3,
    retryDelay: 10000,
    userMessage: 'Rate limited. Waiting before retry...',
  },
  [CliError.INVALID_INPUT]: {
    error: CliError.INVALID_INPUT,
    fallbackStrategy: 'fail',
    userMessage: 'Invalid input provided to CLI.',
  },
  [CliError.UNKNOWN]: {
    error: CliError.UNKNOWN,
    fallbackStrategy: 'skip',
    userMessage: 'Unknown CLI error occurred.',
  },
};

/**
 * Classify an error into a CliError type
 */
export function classifyError(error: Error | string): CliError {
  const message = typeof error === 'string' ? error : error.message;
  const lowerMessage = message.toLowerCase();

  if (lowerMessage.includes('not found') || lowerMessage.includes('not installed')) {
    return CliError.NOT_INSTALLED;
  }
  if (lowerMessage.includes('authentication') || lowerMessage.includes('unauthorized')) {
    return CliError.NOT_AUTHENTICATED;
  }
  if (lowerMessage.includes('timeout') || lowerMessage.includes('timed out')) {
    return CliError.TIMEOUT;
  }
  if (lowerMessage.includes('crash') || lowerMessage.includes('exited') || lowerMessage.includes('killed')) {
    return CliError.PROCESS_CRASH;
  }
  if (lowerMessage.includes('parse') || lowerMessage.includes('json')) {
    return CliError.PARSE_ERROR;
  }
  if (lowerMessage.includes('permission') || lowerMessage.includes('denied')) {
    return CliError.PERMISSION_DENIED;
  }
  if (lowerMessage.includes('network') || lowerMessage.includes('connection')) {
    return CliError.NETWORK_ERROR;
  }
  if (lowerMessage.includes('rate') || lowerMessage.includes('limit') || lowerMessage.includes('429')) {
    return CliError.RATE_LIMIT;
  }
  if (lowerMessage.includes('invalid') || lowerMessage.includes('bad request')) {
    return CliError.INVALID_INPUT;
  }

  return CliError.UNKNOWN;
}

/**
 * Get the error handler for a specific error type
 */
export function getErrorHandler(errorType: CliError): CliErrorHandler {
  return DEFAULT_ERROR_HANDLERS[errorType] || DEFAULT_ERROR_HANDLERS[CliError.UNKNOWN];
}

/**
 * Default retry options
 */
export const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxRetries: 3,
  initialDelay: 1000,
  maxDelay: 30000,
  backoffFactor: 2,
};

/**
 * Calculate delay for exponential backoff
 */
export function calculateBackoffDelay(
  attempt: number,
  options: RetryOptions = DEFAULT_RETRY_OPTIONS
): number {
  const delay = Math.min(
    options.initialDelay * Math.pow(options.backoffFactor, attempt),
    options.maxDelay
  );
  // Add jitter (±20%)
  const jitter = delay * 0.2 * (Math.random() * 2 - 1);
  return Math.round(delay + jitter);
}

/**
 * Sleep for a specified duration
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {}
): Promise<T> {
  const opts = { ...DEFAULT_RETRY_OPTIONS, ...options };
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      // Check if we should retry
      if (opts.retryCondition && !opts.retryCondition(lastError)) {
        throw lastError;
      }

      // Don't retry on the last attempt
      if (attempt < opts.maxRetries) {
        const delay = calculateBackoffDelay(attempt, opts);
        await sleep(delay);
      }
    }
  }

  throw lastError || new Error('Max retries exceeded');
}

/**
 * CLI Error Handler Manager
 */
export class CliErrorManager extends EventEmitter {
  private handlers: Map<CliError, CliErrorHandler> = new Map();

  constructor() {
    super();

    // Initialize with default handlers
    for (const [error, handler] of Object.entries(DEFAULT_ERROR_HANDLERS)) {
      this.handlers.set(error as CliError, handler);
    }
  }

  /**
   * Set a custom error handler
   */
  setHandler(errorType: CliError, handler: Partial<CliErrorHandler>): void {
    const existing = this.handlers.get(errorType) || DEFAULT_ERROR_HANDLERS[errorType];
    this.handlers.set(errorType, { ...existing, ...handler });
  }

  /**
   * Handle an error and return the appropriate action
   */
  async handleError(
    error: Error | string,
    context?: { cliName?: string; operation?: string }
  ): Promise<{
    action: FallbackStrategy;
    retryCount: number;
    substituteProvider?: string;
    userMessage: string;
  }> {
    const errorType = classifyError(error);
    const handler = this.handlers.get(errorType) || DEFAULT_ERROR_HANDLERS[CliError.UNKNOWN];

    this.emit('error', {
      type: errorType,
      message: typeof error === 'string' ? error : error.message,
      handler,
      context,
    });

    return {
      action: handler.fallbackStrategy,
      retryCount: handler.maxRetries || 0,
      substituteProvider: handler.substituteProvider,
      userMessage: handler.userMessage,
    };
  }

  /**
   * Execute with error handling
   */
  async execute<T>(
    fn: () => Promise<T>,
    options?: {
      cliName?: string;
      operation?: string;
      onRetry?: (attempt: number, error: Error) => void;
      onFallback?: (provider: string) => Promise<T>;
    }
  ): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      const { action, retryCount, substituteProvider, userMessage } = await this.handleError(
        error as Error,
        { cliName: options?.cliName, operation: options?.operation }
      );

      switch (action) {
        case 'retry':
          return withRetry(fn, {
            maxRetries: retryCount,
            retryCondition: (e) => {
              if (options?.onRetry) {
                options.onRetry(retryCount, e);
              }
              return true;
            },
          });

        case 'substitute':
          if (options?.onFallback && substituteProvider) {
            this.emit('fallback', { from: options.cliName, to: substituteProvider });
            return options.onFallback(substituteProvider);
          }
          throw new Error(`No fallback available: ${userMessage}`);

        case 'skip':
          throw new Error(`Skipped: ${userMessage}`);

        case 'fail':
        default:
          throw error;
      }
    }
  }
}

/**
 * Singleton instance
 */
let errorManagerInstance: CliErrorManager | null = null;

export function getCliErrorManager(): CliErrorManager {
  if (!errorManagerInstance) {
    errorManagerInstance = new CliErrorManager();
  }
  return errorManagerInstance;
}
