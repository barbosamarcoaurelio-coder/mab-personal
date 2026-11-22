import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../timer-service.js', import.meta.url), 'utf8');
const { sessionTimes, fmtHms, sumActiveSeconds, workoutSeconds, restRemaining, activeIntervalSeconds } = await import(`data:text/javascript,${encodeURIComponent(source)}`);
const session = {
  id: 'a',
  startedAt: '2026-11-18T18:00:00Z',
  finishedAt: '2026-11-18T18:30:00Z',
  durationSeconds: 1500,
  warmupSeconds: 300
};

test('uses wall-clock total and sums only this session’s measured rest', () => {
  const timers = [
    { sessionId: 'a', actualDurationSeconds: 60 },
    { sessionId: 'a', actualDurationSeconds: 30 },
    { sessionId: 'a', actualDurationSeconds: null },
    { sessionId: 'b', actualDurationSeconds: 120 }
  ];
  assert.deepEqual(sessionTimes(session, timers, [{ sessionId: 'a', restSecondsBefore: 600 }]),
    { total: 1800, warmup: 300, execution: 1410, rest: 90 });
});

test('skipped warmup counts as zero, with duration and logged sets as fallbacks', () => {
  const sets = [
    { sessionId: 'a', restSecondsBefore: null },
    { sessionId: 'a', restSecondsBefore: 90 },
    { sessionId: 'a', restSecondsBefore: 120 },
    { sessionId: 'b', restSecondsBefore: 60 }
  ];
  const noEnd = { ...session, finishedAt: undefined };
  assert.deepEqual(sessionTimes(noEnd, [], sets),
    { total: 1800, warmup: 300, execution: 1290, rest: 210 });
  assert.deepEqual(sessionTimes({ ...noEnd, warmupSkipped: true }, [], sets),
    { total: 1500, warmup: 0, execution: 1290, rest: 210 });
});

test('keeps missing metrics unknown and distinguishes measured zero', () => {
  assert.deepEqual(sessionTimes({ id: 'old' }),
    { total: null, warmup: null, execution: null, rest: null });
  assert.deepEqual(sessionTimes({ id: 'old', durationSeconds: 300 }),
    { total: 300, warmup: null, execution: null, rest: null });
  assert.deepEqual(sessionTimes(session, [{ sessionId: 'a', actualDurationSeconds: 0 }]),
    { total: 1800, warmup: 300, execution: 1500, rest: 0 });
  assert.equal(sessionTimes(session, [{ sessionId: 'a', actualDurationSeconds: 2000 }]).execution, 0);
});

test('formats active time as hours, minutes, and seconds', () => {
  assert.equal(fmtHms(0), '00:00:00');
  assert.equal(fmtHms(86399), '23:59:59');
  assert.equal(fmtHms(3600), '01:00:00');
  assert.equal(fmtHms(3723), '01:02:03');
  assert.equal(fmtHms(90061), '25:01:01');
});

test('sums active seconds from every monthly workout and other activity', () => {
  const sessions = [
    { ...session, finishedAt: '2026-11-18T18:30:00Z' },
    { id: 'b', durationSeconds: 900, warmupSeconds: 120, warmupSkipped: true },
    { id: 'c' }
  ];
  const activities = [{ durationMinutes: 45 }, { durationMinutes: 20.5 }];
  assert.equal(sumActiveSeconds(sessions, activities), 1800 + 900 + 45 * 60 + 20.5 * 60);
});

test('excludes multiple pauses, including an ongoing pause, from workout and history', () => {
  const paused = {
    ...session,
    pauses: [
      { startedAt: '2026-11-18T18:05:00Z', endedAt: '2026-11-18T18:07:00Z' },
      { startedAt: '2026-11-18T18:20:00Z', endedAt: null }
    ]
  };
  assert.equal(workoutSeconds(paused, Date.parse('2026-11-18T18:28:00Z')), 1080);
  assert.deepEqual(sessionTimes(paused, [{ sessionId: 'a', actualDurationSeconds: 60 }]),
    { total: 1080, warmup: 300, execution: 720, rest: 60 });
  assert.equal(sumActiveSeconds([paused], []), 1080);
});

test('freezes rest across pauses and excludes only overlapping pause time', () => {
  const paused = {
    pauses: [
      { startedAt: '2026-11-18T18:00:00Z', endedAt: '2026-11-18T18:01:00Z' },
      { startedAt: '2026-11-18T18:02:30Z', endedAt: '2026-11-18T18:04:30Z' },
      { startedAt: '2026-11-18T18:05:00Z', endedAt: null }
    ]
  };
  const rest = { startedAt: '2026-11-18T18:02:00Z', targetEndAt: '2026-11-18T18:04:00Z' };
  assert.equal(restRemaining(rest, paused, Date.parse('2026-11-18T18:03:30Z')), 90);
  assert.equal(restRemaining(rest, paused, Date.parse('2026-11-18T18:05:30Z')), 60);
  assert.equal(activeIntervalSeconds(paused, rest.startedAt, '2026-11-18T18:05:30Z'), 60);
  assert.equal(restRemaining(rest, { pauses: paused.pauses.slice(0, 2) }, Date.parse('2026-11-18T18:06:00Z')), 0);
});
