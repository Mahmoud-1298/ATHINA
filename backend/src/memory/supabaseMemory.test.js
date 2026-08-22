import test from 'node:test';
import assert from 'node:assert/strict';
import { getDateMemoryWindow } from './supabaseMemory.js';

test('detects yesterday-specific history requests', () => {
  const now = new Date('2026-08-22T12:00:00Z');
  const window = getDateMemoryWindow('what did we speak about yesterday?', now);

  assert.ok(window);
  assert.equal(window.label, 'yesterday');
  assert.equal(window.start.toISOString().slice(0, 10), '2026-08-21');
  assert.equal(window.end.toISOString().slice(0, 10), '2026-08-21');
});

test('returns null for general non-history queries', () => {
  const now = new Date('2026-08-22T12:00:00Z');
  const window = getDateMemoryWindow('help me fix my calendar', now);
  assert.equal(window, null);
});
