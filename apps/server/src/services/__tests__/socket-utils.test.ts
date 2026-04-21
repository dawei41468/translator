import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  normalizeLang,
  validateSocketData,
  withRetry,
  isRecoverableSttError,
  canRestartStt,
  handleSocketError,
} from '../socket-utils.js';

describe('normalizeLang', () => {
  it('returns en for empty input', () => {
    expect(normalizeLang('')).toBe('en');
    expect(normalizeLang(null)).toBe('en');
    expect(normalizeLang(undefined)).toBe('en');
  });

  it('normalizes zh-CN to zh', () => {
    expect(normalizeLang('zh-CN')).toBe('zh');
    expect(normalizeLang('zh_CN')).toBe('zh');
  });

  it('normalizes en-US to en', () => {
    expect(normalizeLang('en-US')).toBe('en');
    expect(normalizeLang('en_US')).toBe('en');
  });

  it('trims whitespace', () => {
    expect(normalizeLang('  de  ')).toBe('de');
  });
});

describe('validateSocketData', () => {
  const schema = {
    name: (v: any) => typeof v === 'string' && v.length > 0,
    age: (v: any) => typeof v === 'number',
    optional: (v: any) => v === undefined || typeof v === 'string',
  };

  it('returns true for valid data', () => {
    expect(validateSocketData({ name: 'John', age: 30 }, schema)).toBe(true);
  });

  it('returns true when optional field is missing', () => {
    expect(validateSocketData({ name: 'John', age: 30 }, schema)).toBe(true);
  });

  it('returns false when required field is missing', () => {
    expect(validateSocketData({ age: 30 }, schema)).toBe(false);
  });

  it('returns false when field type is wrong', () => {
    expect(validateSocketData({ name: 'John', age: '30' }, schema)).toBe(false);
  });
});

describe('withRetry', () => {
  it('returns result on first success', async () => {
    const operation = vi.fn().mockResolvedValue('success');
    const result = await withRetry(operation, 3, 1);
    expect(result).toBe('success');
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('retries on failure and eventually succeeds', async () => {
    const operation = vi.fn().mockRejectedValueOnce(new Error('fail')).mockResolvedValue('success');
    const result = await withRetry(operation, 3, 1);
    expect(result).toBe('success');
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('throws after max retries', async () => {
    const operation = vi.fn().mockRejectedValue(new Error('fail'));
    await expect(withRetry(operation, 2, 1)).rejects.toThrow('fail');
    expect(operation).toHaveBeenCalledTimes(2);
  });
});

describe('isRecoverableSttError', () => {
  it('returns true for incomplete envelope', () => {
    expect(isRecoverableSttError(new Error('incomplete envelope'))).toBe(true);
  });

  it('returns true for ECONNRESET', () => {
    expect(isRecoverableSttError(new Error('ECONNRESET'))).toBe(true);
  });

  it('returns true for code 14', () => {
    expect(isRecoverableSttError({ code: 14 })).toBe(true);
  });

  it('returns false for unknown errors', () => {
    expect(isRecoverableSttError(new Error('something else'))).toBe(false);
  });
});

describe('canRestartStt', () => {
  it('allows up to 3 restarts within window', () => {
    const socket: any = {};
    expect(canRestartStt(socket)).toBe(true);
    expect(canRestartStt(socket)).toBe(true);
    expect(canRestartStt(socket)).toBe(true);
    expect(canRestartStt(socket)).toBe(false);
  });

  it('resets window after 30 seconds', () => {
    vi.useFakeTimers();
    const socket: any = {};
    canRestartStt(socket);
    canRestartStt(socket);
    canRestartStt(socket);
    expect(canRestartStt(socket)).toBe(false);

    vi.advanceTimersByTime(31000);
    expect(canRestartStt(socket)).toBe(true);
    vi.useRealTimers();
  });
});

describe('handleSocketError', () => {
  it('emits error with message and errorId', () => {
    const emit = vi.fn();
    const socket = { emit };
    handleSocketError(socket as any, 'test-event', new Error('boom'));

    expect(emit).toHaveBeenCalledWith('error', expect.objectContaining({
      message: 'An unexpected error occurred',
    }));
    const emitted = emit.mock.calls[0][1];
    expect(emitted.errorId).toMatch(/^\d+-[a-z0-9]+$/);
  });

  it('uses custom user message when provided', () => {
    const emit = vi.fn();
    const socket = { emit };
    handleSocketError(socket as any, 'test', new Error('boom'), 'Custom message');

    expect(emit).toHaveBeenCalledWith('error', expect.objectContaining({
      message: 'Custom message',
    }));
  });
});
