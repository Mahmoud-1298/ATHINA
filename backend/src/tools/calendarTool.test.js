import test from 'node:test';
import assert from 'node:assert/strict';
import { __test__ } from './calendarTool.js';

test('parses timezone-less ISO datetime as local wall time in provided timezone', () => {
  const window = __test__.normalizeWindow(
    {
      start: '2026-08-23T19:00:00',
      durationMinutes: 60,
    },
    'Asia/Dubai'
  );

  assert.equal(window.startAt, '2026-08-23T15:00:00.000Z');
  assert.equal(window.endAt, '2026-08-23T16:00:00.000Z');
});

test('keeps explicit UTC datetime unchanged', () => {
  const window = __test__.normalizeWindow(
    {
      start: '2026-08-23T19:00:00Z',
      durationMinutes: 30,
    },
    'Asia/Dubai'
  );

  assert.equal(window.startAt, '2026-08-23T19:00:00.000Z');
  assert.equal(window.endAt, '2026-08-23T19:30:00.000Z');
});

test('parses date/time fields in calendar timezone', () => {
  const window = __test__.normalizeWindow(
    {
      date: '2026-08-23',
      time: '7:00 PM',
      durationMinutes: 45,
    },
    'Asia/Dubai'
  );

  assert.equal(window.startAt, '2026-08-23T15:00:00.000Z');
  assert.equal(window.endAt, '2026-08-23T15:45:00.000Z');
});
