import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  installGlobalErrorHandlers,
  registerErrorSink,
  reportError,
  resetErrorReportingForTests,
  type IErrorContext,
} from './reportError.ts';

const context: IErrorContext = { surface: 'apex', source: 'manual' };

function dispatchWindowError(error: unknown): void {
  window.dispatchEvent(new ErrorEvent('error', { error, message: 'boom' }));
}

function dispatchUnhandledRejection(reason: unknown): void {
  const event = new Event('unhandledrejection');
  Object.defineProperty(event, 'reason', { value: reason });
  window.dispatchEvent(event);
}

afterEach(() => {
  resetErrorReportingForTests();
  vi.restoreAllMocks();
});

describe('reportError', () => {
  it('falls back to a single console.error when no sink is registered', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const error = new Error('boom');

    expect(() => reportError(error, context)).not.toThrow();

    expect(consoleError).toHaveBeenCalledOnce();
    expect(consoleError).toHaveBeenCalledWith('[siapp:reportError]', context, error);
  });

  it('forwards the error and context to a registered sink', () => {
    const sink = vi.fn();
    registerErrorSink(sink);
    const error = new Error('boom');

    reportError(error, context);

    expect(sink).toHaveBeenCalledOnce();
    expect(sink).toHaveBeenCalledWith(error, context);
  });

  it('swallows a throwing sink and falls back to the console', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    registerErrorSink(() => {
      throw new Error('sink is broken');
    });

    expect(() => reportError(new Error('boom'), context)).not.toThrow();

    expect(consoleError).toHaveBeenCalledOnce();
  });
});

describe('installGlobalErrorHandlers', () => {
  it('reports uncaught window errors with source "window"', () => {
    const sink = vi.fn();
    registerErrorSink(sink);
    installGlobalErrorHandlers('apex');
    const error = new Error('uncaught');

    dispatchWindowError(error);

    expect(sink).toHaveBeenCalledOnce();
    expect(sink).toHaveBeenCalledWith(error, { surface: 'apex', source: 'window' });
  });

  it('reports unhandled rejections with source "unhandledrejection"', () => {
    const sink = vi.fn();
    registerErrorSink(sink);
    installGlobalErrorHandlers('dashboard');
    const reason = new Error('rejected');

    dispatchUnhandledRejection(reason);

    expect(sink).toHaveBeenCalledOnce();
    expect(sink).toHaveBeenCalledWith(reason, {
      surface: 'dashboard',
      source: 'unhandledrejection',
    });
  });

  it('is idempotent — installing twice reports each window error once', () => {
    const sink = vi.fn();
    registerErrorSink(sink);
    installGlobalErrorHandlers('apex');
    installGlobalErrorHandlers('apex');

    dispatchWindowError(new Error('once'));

    expect(sink).toHaveBeenCalledOnce();
  });

  it('drops the window echo of an error already reported by a boundary', () => {
    const sink = vi.fn();
    registerErrorSink(sink);
    installGlobalErrorHandlers('apex');
    const error = new Error('caught by boundary');

    reportError(error, { surface: 'apex', source: 'error-boundary' });
    dispatchWindowError(error);
    dispatchUnhandledRejection(error);

    expect(sink).toHaveBeenCalledOnce();
    expect(sink).toHaveBeenCalledWith(error, { surface: 'apex', source: 'error-boundary' });
  });
});
