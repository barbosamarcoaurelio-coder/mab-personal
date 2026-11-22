import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, SourceTextModule, SyntheticModule } from 'node:vm';

const source = readFileSync(new URL('../mab-treino-v303.js', import.meta.url), 'utf8');
const timerSource = readFileSync(new URL('../timer-service.js', import.meta.url), 'utf8');
const timer = await import(`data:text/javascript,${encodeURIComponent(timerSource)}`);

async function setup() {
  let overlay;
  let tick;
  const clicks = [];
  const writes = [];
  const created = [];
  const element = () => ({
    dataset: {}, style: {}, value: '',
    before() {}, prepend() {}, append() {}, setAttribute() {},
    remove() { if (overlay === this) overlay = undefined; }
  });
  const controls = new Map();
  const control = selector => {
    if (!controls.has(selector)) controls.set(selector, element());
    return controls.get(selector);
  };
  const session = {
    id: 'session', status: 'in_progress', groupCode: 'G', cycleId: 'cycle',
    startedAt: new Date(Date.now() - 600000).toISOString()
  };
  const rows = {
    workoutSessions: [session],
    planItems: [{ groupCode: 'G', cycleId: 'cycle', active: true, sets: 1, exerciseId: 'exercise' }],
    executedSets: [{ sessionId: session.id, exerciseId: 'exercise', completed: true }],
    restTimers: []
  };
  const repo = {
    all: async store => rows[store] || [],
    put: async (store, record) => writes.push({ store, record }),
    get: async () => ({ value: new Date().toISOString() })
  };
  const window = { addEventListener() {} };
  const context = createContext({
    window, console,
    document: {
      documentElement: { dataset: {} },
      body: { appendChild(node) { overlay = node; } },
      addEventListener(type, cb) { if (type === 'click') clicks.push(cb); },
      querySelector: selector => selector === '#mabFinishOverlay' ? overlay : controls.get(selector),
      createElement(tag) {
        const node = element();
        if (tag === 'button') created.push(node);
        else Object.assign(node, { querySelector: control, firstElementChild: element() });
        return node;
      }
    },
    MutationObserver: class { observe() {} },
    setTimeout() {}, clearTimeout() {},
    setInterval(callback) { tick = callback; }
  });
  const module = new SourceTextModule(source, { context });
  await module.link(specifier => specifier === './repositories.js'
    ? new SyntheticModule(['repo'], function () { this.setExport('repo', repo); }, { context })
    : specifier === './db.js'
    ? new SyntheticModule(['tx'], function () {
      this.setExport('tx', async (_stores, _mode, work) => work({
        objectStore: store => ({ put: record => writes.push({ store, record }) })
      }));
    }, { context })
    : new SyntheticModule(['workoutSeconds', 'isWorkoutPaused', 'activeIntervalSeconds'], function () {
      for (const name of ['workoutSeconds', 'isWorkoutPaused', 'activeIntervalSeconds']) this.setExport(name, timer[name]);
    }, { context }));
  await module.evaluate();
  return {
    session, rows, writes, window, control,
    overlay: () => overlay,
    button: text => created.findLast(node => node.textContent === text),
    async tick() { tick(); await new Promise(resolve => setImmediate(resolve)); },
    async finish() {
      const event = {
        target: { closest: selector => selector === '[data-action="finish"]' ? { dataset: {} } : null },
        preventDefault() {}, stopPropagation() {}, stopImmediatePropagation() {}
      };
      for (const click of clicks) await click(event);
    }
  };
}

test('closing the automatic summary leaves the session untouched and stops reopening', async () => {
  const app = await setup();
  const original = { ...app.session };
  await app.tick();
  assert.ok(app.overlay());
  app.button('Fechar sem salvar').onclick();
  await app.tick();
  await app.tick();
  assert.equal(app.overlay(), undefined);
  assert.equal(app.window.__mabFinishPending, false);
  assert.deepEqual(app.session, original);
  assert.deepEqual(app.writes, []);

  await app.finish();
  assert.ok(app.overlay(), 'manual finish still opens the summary');
  await app.control('#mabSaveFinish').onclick();
  assert.equal(app.overlay(), undefined);
  assert.equal(app.writes.length, 1);
  assert.equal(app.writes[0].store, 'workoutSessions');
  assert.equal(app.writes[0].record.status, 'completed');
});

test('closing the manual summary with X does not stop or write the running rest', async () => {
  const app = await setup();
  const rest = { sessionId: app.session.id, status: 'running' };
  app.rows.restTimers.push(rest);
  await app.tick();
  assert.equal(app.overlay(), undefined);
  await app.finish();
  assert.ok(app.overlay());
  assert.equal(app.window.__mabFinishPending, true);
  app.button('✕').onclick();
  assert.equal(app.overlay(), undefined);
  assert.equal(app.window.__mabFinishPending, false);
  assert.equal(rest.status, 'running');
  assert.deepEqual(app.writes, []);

  app.rows.restTimers.length = 0;
  await app.tick();
  assert.equal(app.overlay(), undefined);
  app.session.id = 'next-session';
  app.rows.executedSets[0].sessionId = app.session.id;
  await app.tick();
  assert.ok(app.overlay(), 'dismissal does not carry over to another session');
});

test('a paused session does not automatically finish and saving it closes its rest', async () => {
  const app = await setup();
  app.session.pauses = [{ startedAt: new Date(Date.now() - 300000).toISOString(), endedAt: null }];
  await app.tick();
  assert.equal(app.overlay(), undefined);
  const rest = { sessionId: app.session.id, status: 'running', startedAt: new Date(Date.now() - 360000).toISOString() };
  app.rows.restTimers.push(rest);
  await app.tick();
  assert.equal(app.overlay(), undefined);
  await app.finish();
  await app.control('#mabSaveFinish').onclick();
  assert.equal(app.writes[0].store, 'restTimers');
  assert.equal(app.writes[0].record.status, 'cancelled');
  assert.ok(app.writes[0].record.actualDurationSeconds >= 59 && app.writes[0].record.actualDurationSeconds <= 61);
  assert.equal(app.writes[1].record.status, 'completed');
  assert.ok(app.writes[1].record.durationSeconds >= 299 && app.writes[1].record.durationSeconds <= 301);
});
