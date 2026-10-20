import { getConfig } from './config.js';
import { ApiError } from '../shared/contracts.js';

/**
 * Calls the Google Apps Script Web App backend.
 *
 * @param {string} action
 * @param {Record<string, any>} [payload]
 * @returns {Promise<any>}
 */
export async function callApi(action, payload = {}) {
  const { gasUrl, pin, deviceId } = getConfig();

  if (!gasUrl) {
    throw new ApiError('NOT_CONFIGURED', 'Gas URL not configured');
  }

  let response;
  try {
    response = await fetch(gasUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      redirect: 'follow',
      body: JSON.stringify({ pin, deviceId, action, ...payload }),
    });
  } catch (err) {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      throw new ApiError('OFFLINE', 'Network is offline');
    }
    throw new ApiError('NETWORK_ERROR', err.message || 'Network request failed');
  }

  let res;
  try {
    res = await response.json();
  } catch (err) {
    throw new ApiError('INVALID_RESPONSE', 'Invalid JSON response from server');
  }

  if (!response.ok) {
    throw new ApiError(res?.error || 'HTTP_ERROR', res?.message || `HTTP ${response.status}`);
  }

  if (!res || !res.ok) {
    throw new ApiError(res?.error || 'INTERNAL', res?.message || res?.error || 'Request failed');
  }

  return res;
}
