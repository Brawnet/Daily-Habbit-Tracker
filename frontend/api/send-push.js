import crypto from 'node:crypto';
import webpush from 'web-push';

export const MAX_PUSH_BATCH_SIZE = 100;

/**
 * Validates whether a push subscription endpoint URL is secure (HTTPS) and formatted properly.
 * Rejects SSRF vectors (e.g. internal IP addresses, loopback, file, ftp).
 * @param {string} endpoint
 * @returns {boolean}
 */
export function isValidPushEndpoint(endpoint) {
  if (!endpoint || typeof endpoint !== 'string') return false;
  try {
    const parsed = new URL(endpoint);
    if (parsed.protocol !== 'https:') return false;
    const hostname = parsed.hostname.toLowerCase();
    // Reject loopback and internal private IPs
    if (
      hostname === 'localhost' ||
      hostname.endsWith('.localhost') ||
      hostname === '127.0.0.1' ||
      hostname === '::1' ||
      hostname === '0.0.0.0' ||
      /^10\./.test(hostname) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(hostname) ||
      /^192\.168\./.test(hostname) ||
      /^169\.254\./.test(hostname)
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Constant-time string comparison using SHA-256 fixed-length digests to prevent timing attacks
 * and byte length leakage.
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
export function timingSafeEqualStr(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const hashA = crypto.createHash('sha256').update(a, 'utf8').digest();
  const hashB = crypto.createHash('sha256').update(b, 'utf8').digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

/**
 * Vercel Serverless Function handler
 * @param {import('node:http').IncomingMessage & { body?: any }} req
 * @param {import('node:http').ServerResponse & { status: (code: number) => any, json: (body: any) => any, setHeader: (name: string, value: string) => any }} res
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    if (typeof res.setHeader === 'function') {
      res.setHeader('Allow', 'POST');
    }
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const expectedSecret = process.env.PUSH_SHARED_SECRET || '';
  const headers = req.headers || {};
  const providedSecret =
    headers['x-push-secret'] ||
    headers['X-Push-Secret'] ||
    (typeof headers.get === 'function' ? headers.get('x-push-secret') : '') ||
    '';

  if (!expectedSecret || !timingSafeEqualStr(String(providedSecret), expectedSecret)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const vapidPublicKey = process.env.VAPID_PUBLIC_KEY || process.env.VITE_VAPID_PUBLIC_KEY || '';
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY || '';
  const vapidSubject = process.env.VAPID_SUBJECT || 'mailto:admin@example.com';

  if (!vapidPublicKey || !vapidPrivateKey) {
    return res.status(500).json({ error: 'VAPID keys not configured' });
  }

  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }
  body = body || {};

  const { subscriptions = [], notification = {} } = body;
  if (!Array.isArray(subscriptions)) {
    return res.status(400).json({ error: 'Subscriptions must be an array' });
  }
  if (subscriptions.length > MAX_PUSH_BATCH_SIZE) {
    return res.status(400).json({ error: `Subscriptions batch size exceeds maximum of ${MAX_PUSH_BATCH_SIZE}` });
  }

  const payload = JSON.stringify({
    title: notification.title || 'Habbit',
    body: notification.body || '',
    url: notification.url || '/?tab=today',
  });

  const results = [];
  for (const sub of subscriptions) {
    if (!sub || !isValidPushEndpoint(sub.endpoint)) {
      results.push({
        endpoint: sub?.endpoint || '',
        ok: false,
        statusCode: 400,
        error: 'Invalid or insecure push endpoint URL',
      });
      continue;
    }

    try {
      const resp = await webpush.sendNotification(sub, payload, {
        TTL: 3600,
      });
      results.push({
        endpoint: sub.endpoint,
        ok: true,
        statusCode: resp.statusCode,
      });
    } catch (err) {
      results.push({
        endpoint: sub.endpoint,
        ok: false,
        statusCode: err.statusCode || 500,
        error: err.message,
      });
    }
  }

  return res.status(200).json({ results });
}
