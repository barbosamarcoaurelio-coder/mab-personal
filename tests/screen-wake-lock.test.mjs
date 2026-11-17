import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, SourceTextModule } from 'node:vm';

const source = readFileSync(new URL('../screen-wake-lock.js', import.meta.url), 'utf8');

async function setup(request) {
  const locks = [];
  const warnings = [];
  const status = { textContent: '' };
  const toast = { textContent: '', classList: { add() {}, remove() {} } };
  const document = Object.assign(new EventTarget(), {
    hidden: false,
    querySelectorAll: () => [status],
    querySelector: () => toast
  });
  const window = new EventTarget();
  const navigator = {
    wakeLock: {
      request: (...args) => {
        if (request) return request(...args);
        assert.deepEqual(args, ['screen']);
        const lock = Object.assign(new EventTarget(), {
          released: false,
          releaseCalls: 0,
          async release() {
            this.releaseCalls++;
            this.released = true;
            this.dispatchEvent(new Event('release'));
          }
        });
        locks.push(lock);
        return Promise.resolve(lock);
      }
    }
  };
  const context = createContext({
    document, window, navigator,
    console: { warn: (...args) => warnings.push(args) },
    setTimeout() {}
  });
  const module = new SourceTextModule(source, { context });
  await module.link(() => {});
  await module.evaluate();
  return { ...module.namespace, document, window, navigator, locks, warnings, status, toast };
}

const settle = () => new Promise(resolve => setImmediate(resolve));

test('warmup and workout share one lock until the session ends', async () => {
  const app = await setup();
  assert.equal(await app.setWorkoutScreenActive(true), true);
  await Promise.all([app.setWorkoutScreenActive(true), app.setWorkoutScreenActive(true)]);
  assert.equal(app.locks.length, 1);
  assert.match(app.status.textContent, /^Tela ativa/);
  await app.setWorkoutScreenActive(false);
  assert.equal(app.locks[0].releaseCalls, 1);
  await settle();
  assert.equal(app.locks.length, 1);
});

test('restores the lock after backgrounding on any app route', async () => {
  const app = await setup();
  await app.setWorkoutScreenActive(true);
  app.document.hidden = true;
  app.document.dispatchEvent(new Event('visibilitychange'));
  await settle();
  assert.equal(app.locks[0].released, true);
  app.document.hidden = false;
  app.document.dispatchEvent(new Event('visibilitychange'));
  app.window.dispatchEvent(new Event('focus'));
  app.window.dispatchEvent(new Event('pageshow'));
  await settle();
  assert.equal(app.locks.length, 2);
  assert.equal(app.locks[1].released, false);
});

test('reacquires a system-released lock only while a workout is active', async () => {
  const app = await setup();
  await app.setWorkoutScreenActive(true);
  await app.locks[0].release();
  await settle();
  assert.equal(app.locks.length, 2);
  await app.setWorkoutScreenActive(false);
  app.window.dispatchEvent(new Event('focus'));
  app.document.dispatchEvent(new Event('pointerdown'));
  await settle();
  assert.equal(app.locks.length, 2);
});

test('coalesces pending requests and releases a late lock after finishing', async () => {
  let resolve;
  let requests = 0;
  const app = await setup(() => {
    requests++;
    return new Promise(done => { resolve = done; });
  });
  const first = app.setWorkoutScreenActive(true);
  const second = app.setWorkoutScreenActive(true);
  assert.equal(requests, 1);
  await app.setWorkoutScreenActive(false);
  const lock = { released: false, async release() { this.released = true; } };
  resolve(lock);
  assert.deepEqual(await Promise.all([first, second]), [false, false]);
  assert.equal(lock.released, true);
});

test('denial is visible and a later touch retries successfully', async () => {
  let fail = true;
  let requests = 0;
  const lock = Object.assign(new EventTarget(), { released: false });
  const app = await setup(() => {
    requests++;
    if (fail) throw new Error('NotAllowedError');
    return Promise.resolve(lock);
  });
  assert.equal(await app.setWorkoutScreenActive(true), false);
  assert.match(app.status.textContent, /Tela pode bloquear/);
  assert.match(app.toast.textContent, /economia de bateria/);
  assert.equal(app.warnings.length, 1);
  fail = false;
  app.document.dispatchEvent(new Event('pointerdown'));
  await settle();
  assert.equal(requests, 2);
  assert.match(app.status.textContent, /^Tela ativa/);
});

test('unsupported browsers do not claim that the screen is protected', async () => {
  const app = await setup();
  delete app.navigator.wakeLock;
  assert.equal(await app.setWorkoutScreenActive(true), false);
  assert.match(app.status.textContent, /Tela pode bloquear/);
  assert.match(app.toast.textContent, /Tela pode bloquear/);
});
