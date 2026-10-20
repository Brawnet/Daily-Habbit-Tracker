import { describe, it, expect } from 'vitest';
import { ACTIONS, ERRORS, STORES } from './shared/contracts.js';

describe('Contracts initialization', () => {
  it('exposes defined constants', () => {
    expect(ACTIONS.PING).toBe('ping');
    expect(ERRORS.LOCKED).toBe('LOCKED');
    expect(STORES.HABITS).toBe('habits');
  });
});
