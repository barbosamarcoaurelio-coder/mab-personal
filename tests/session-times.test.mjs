import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../timer-service.js', import.meta.url), 'utf8');
const { sessionTimes, fmtHms } = await import(`data:text/javascript,${encodeURIComponent(source)}`);
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
});
