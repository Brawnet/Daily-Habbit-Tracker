import crypto from 'node:crypto';
import webpush from 'web-push';

/**
 * Constant-time string comparison to prevent timing attacks.
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
export function timingSafeEqualStr(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
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
  const payload = JSON.stringify({
    title: notification.title || 'Habbit',
    body: notification.body || '',
    url: notification.url || '/?tab=today',
  });

  const results = [];
  for (const sub of subscriptions) {
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
