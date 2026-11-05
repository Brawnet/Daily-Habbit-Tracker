import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import webpush from 'web-push';
import handler, { timingSafeEqualStr, isValidPushEndpoint, MAX_PUSH_BATCH_SIZE } from './send-push.js';

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

  describe('Security Hardening (Issue #43 Domain 5)', () => {
    it('isValidPushEndpoint validates HTTPS URLs and rejects non-HTTPS or SSRF hosts', () => {
      expect(isValidPushEndpoint('https://fcm.googleapis.com/fcm/send/xyz')).toBe(true);
      expect(isValidPushEndpoint('https://web.push.apple.com/xyz')).toBe(true);

      // Rejects non-HTTPS
      expect(isValidPushEndpoint('http://push.example.com/insecure')).toBe(false);
      expect(isValidPushEndpoint('ftp://evil.com/payload')).toBe(false);

      // Rejects localhost, loopback, and private IPs (SSRF vectors)
      expect(isValidPushEndpoint('https://localhost/admin')).toBe(false);
      expect(isValidPushEndpoint('https://127.0.0.1:8080/')).toBe(false);
      expect(isValidPushEndpoint('https://169.254.169.254/latest/meta-data/')).toBe(false);
      expect(isValidPushEndpoint('https://192.168.1.1/router')).toBe(false);
      expect(isValidPushEndpoint('https://10.0.0.1/internal')).toBe(false);
      expect(isValidPushEndpoint('not-a-url')).toBe(false);
      expect(isValidPushEndpoint('')).toBe(false);
      expect(isValidPushEndpoint(null)).toBe(false);
    });

    it('rejects batch sizes exceeding MAX_PUSH_BATCH_SIZE (100) with 400', async () => {
      process.env.PUSH_SHARED_SECRET = 'correct-secret-1234';
      process.env.VAPID_PUBLIC_KEY = 'mock-public-key';
      process.env.VAPID_PRIVATE_KEY = 'mock-private-key';

      vi.spyOn(webpush, 'setVapidDetails').mockImplementation(() => {});

      const subscriptions = Array.from({ length: 101 }, (_, i) => ({
        endpoint: `https://push.example.com/sub-${i}`,
        keys: { auth: 'a', p256dh: 'b' },
      }));

      const req = {
        method: 'POST',
        headers: { 'x-push-secret': 'correct-secret-1234' },
        body: {
          subscriptions,
          notification: { title: 'Test' },
        },
      };
      const res = createMockResponse();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.body.error).toContain('batch size exceeds maximum');
    });

    it('returns error statusCode 400 for individual invalid/SSRF push endpoints without crashing', async () => {
      process.env.PUSH_SHARED_SECRET = 'correct-secret-1234';
      process.env.VAPID_PUBLIC_KEY = 'mock-public-key';
      process.env.VAPID_PRIVATE_KEY = 'mock-private-key';

      vi.spyOn(webpush, 'setVapidDetails').mockImplementation(() => {});
      const sendSpy = vi.spyOn(webpush, 'sendNotification').mockImplementation(async () => ({ statusCode: 201 }));

      const subscriptions = [
        { endpoint: 'http://insecure-http.com/sub', keys: { auth: 'a', p256dh: 'b' } },
        { endpoint: 'https://127.0.0.1/ssrf', keys: { auth: 'a', p256dh: 'b' } },
        { endpoint: 'https://fcm.googleapis.com/valid', keys: { auth: 'a', p256dh: 'b' } },
      ];

      const req = {
        method: 'POST',
        headers: { 'x-push-secret': 'correct-secret-1234' },
        body: {
          subscriptions,
          notification: { title: 'Test' },
        },
      };
      const res = createMockResponse();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.body.results.length).toBe(3);
      expect(res.body.results[0].ok).toBe(false);
      expect(res.body.results[0].statusCode).toBe(400);
      expect(res.body.results[1].ok).toBe(false);
      expect(res.body.results[1].statusCode).toBe(400);
      expect(res.body.results[2].ok).toBe(true);
      expect(res.body.results[2].statusCode).toBe(201);
      expect(sendSpy).toHaveBeenCalledTimes(1);
    });
  });
});
