import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import webpush from 'web-push';
import handler, { timingSafeEqualStr } from './send-push.js';

describe('timingSafeEqualStr', () => {
  it('returns true for identical strings', () => {
    expect(timingSafeEqualStr('super-secret-key-123', 'super-secret-key-123')).toBe(true);
    expect(timingSafeEqualStr('', '')).toBe(true);
  });

  it('returns false for strings of different lengths', () => {
    expect(timingSafeEqualStr('secret', 'secret123')).toBe(false);
    expect(timingSafeEqualStr('longer-string', 'short')).toBe(false);
  });

  it('returns false for strings of same length with different characters', () => {
    expect(timingSafeEqualStr('secret1', 'secret2')).toBe(false);
    expect(timingSafeEqualStr('abcdef', 'abcdeg')).toBe(false);
  });

  it('returns false for non-string inputs', () => {
    expect(timingSafeEqualStr(null, 'secret')).toBe(false);
    expect(timingSafeEqualStr('secret', undefined)).toBe(false);
    expect(timingSafeEqualStr(12345, 12345)).toBe(false);
    expect(timingSafeEqualStr({}, {})).toBe(false);
  });
});

describe('send-push API handler', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  function createMockResponse() {
    const res = {
      statusCode: 200,
      headers: {},
      body: null,
      setHeader: vi.fn((name, value) => {
        res.headers[name] = value;
        return res;
      }),
      status: vi.fn((code) => {
        res.statusCode = code;
        return res;
      }),
      json: vi.fn((data) => {
        res.body = data;
        return res;
      }),
    };
    return res;
  }

  it('rejects non-POST methods with 405 Method Not Allowed', async () => {
    const req = {
      method: 'GET',
      headers: {},
    };
    const res = createMockResponse();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(405);
    expect(res.setHeader).toHaveBeenCalledWith('Allow', 'POST');
    expect(res.body).toEqual({ error: 'Method Not Allowed' });
  });

  it('rejects requests when PUSH_SHARED_SECRET is not configured on server', async () => {
    delete process.env.PUSH_SHARED_SECRET;
    const req = {
      method: 'POST',
      headers: { 'x-push-secret': 'any-secret' },
    };
    const res = createMockResponse();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.body).toEqual({ error: 'Unauthorized' });
  });

  it('rejects requests when x-push-secret header is missing', async () => {
    process.env.PUSH_SHARED_SECRET = 'correct-secret-1234';
    const req = {
      method: 'POST',
      headers: {},
    };
    const res = createMockResponse();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.body).toEqual({ error: 'Unauthorized' });
  });

  it('rejects requests when x-push-secret header is incorrect', async () => {
    process.env.PUSH_SHARED_SECRET = 'correct-secret-1234';
    const req = {
      method: 'POST',
      headers: { 'x-push-secret': 'wrong-secret-0000' },
    };
    const res = createMockResponse();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.body).toEqual({ error: 'Unauthorized' });
  });

  it('returns 500 when VAPID keys are missing from environment', async () => {
    process.env.PUSH_SHARED_SECRET = 'correct-secret-1234';
    delete process.env.VAPID_PUBLIC_KEY;
    delete process.env.VITE_VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;

    const req = {
      method: 'POST',
      headers: { 'x-push-secret': 'correct-secret-1234' },
      body: { subscriptions: [] },
    };
    const res = createMockResponse();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.body).toEqual({ error: 'VAPID keys not configured' });
  });

  it('successfully sends push notifications via web-push and returns results', async () => {
    process.env.PUSH_SHARED_SECRET = 'correct-secret-1234';
    process.env.VAPID_PUBLIC_KEY = 'mock-public-key';
    process.env.VAPID_PRIVATE_KEY = 'mock-private-key';
    process.env.VAPID_SUBJECT = 'mailto:test@example.com';

    vi.spyOn(webpush, 'setVapidDetails').mockImplementation(() => {});
    const sendSpy = vi.spyOn(webpush, 'sendNotification').mockImplementation(async (sub) => {
      if (sub.endpoint.includes('fail')) {
        const error = new Error('Subscription expired');
        error.statusCode = 410;
        throw error;
      }
      return { statusCode: 201 };
    });

    const subscriptions = [
      { endpoint: 'https://push.example.com/sub-1', keys: { auth: 'a', p256dh: 'b' } },
      { endpoint: 'https://push.example.com/fail-2', keys: { auth: 'c', p256dh: 'd' } },
    ];

    const req = {
      method: 'POST',
      headers: { 'x-push-secret': 'correct-secret-1234' },
      body: {
        subscriptions,
        notification: {
          title: 'Habbit Alert',
          body: '1 habit left',
          url: '/?tab=today',
        },
      },
    };
    const res = createMockResponse();

    await handler(req, res);

    expect(webpush.setVapidDetails).toHaveBeenCalledWith(
      'mailto:test@example.com',
      'mock-public-key',
      'mock-private-key'
    );
    expect(sendSpy).toHaveBeenCalledTimes(2);
    expect(sendSpy).toHaveBeenCalledWith(
      subscriptions[0],
      JSON.stringify({
        title: 'Habbit Alert',
        body: '1 habit left',
        url: '/?tab=today',
      }),
      { TTL: 3600 }
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.body).toEqual({
      results: [
        {
          endpoint: 'https://push.example.com/sub-1',
          ok: true,
          statusCode: 201,
        },
        {
          endpoint: 'https://push.example.com/fail-2',
          ok: false,
          statusCode: 410,
          error: 'Subscription expired',
        },
      ],
    });
  });
});
