import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, SourceTextModule } from 'node:vm';

const source = readFileSync(new URL('../barcode-scanner.js', import.meta.url), 'utf8');
const settle = () => new Promise(resolve => setImmediate(resolve));

async function setup({ codes = [], media } = {}) {
  const timers = new Map();
  const input = { value: '', focus() {} };
  const form = { hidden: true, elements: { namedItem: () => input } };
  const video = { readyState: 2, videoWidth: 640, srcObject: null, async play() {} };
  const status = { textContent: '' };
  const close = {}, manual = {}, help = {};
  const elements = { video, form, '[data-scan-status]': status, '[data-scan-close]': close, '[data-scan-manual]': manual, '[data-scan-help]': help };
  const overlay = {
    setAttribute() {}, querySelector: selector => elements[selector],
    showModal() { this.open = true; }, close() { this.open = false; this.onclose?.(); }, remove() { this.removed = true; }
  };
  let stopped = 0, reads = 0, requested;
  const stream = { getTracks: () => [{ stop() { stopped++; } }] };
  const document = Object.assign(new EventTarget(), {
    hidden: false, activeElement: null,
    createElement: tag => { assert.equal(tag, 'dialog'); return overlay; },
    body: { appendChild() {} }
  });
  const window = new EventTarget();
  const context = createContext({
    document, window, performance: { now: () => 0 },
    console: { error() {}, warn() {} },
    navigator: { mediaDevices: { getUserMedia: async options => { requested = options; return media ? media() : stream; } } },
    BarcodeDetector: class {
      static async getSupportedFormats() { return ['ean_13', 'ean_8', 'upc_a', 'upc_e']; }
      async detect() { const code = codes[reads++]; return code ? [{ rawValue: code }] : []; }
    },
    setTimeout: fn => { const id = timers.size + 1; timers.set(id, fn); return id; },
    clearTimeout: id => timers.delete(id)
  });
  const module = new SourceTextModule(source, { context });
  await module.link(() => {});
  await module.evaluate();
  const frame = async () => {
    const [id, callback] = timers.entries().next().value;
    timers.delete(id);
    await callback();
    await settle();
  };
  return {
    ...module.namespace, document, window, overlay, input, form, close, manual, status, video, stream, frame,
    stopped: () => stopped, reads: () => reads, requested: () => JSON.parse(JSON.stringify(requested))
  };
}

test('requires two consecutive equal reads, resetting after an empty frame, then stops the track', async () => {
  const app = await setup({ codes: ['96385074', '', '96385074', '96385074'] });
  const result = app.scanBarcode();
  await settle();
  assert.equal(app.reads(), 1);
  assert.equal(app.overlay.open, true);
  await app.frame();
  await app.frame();
  assert.equal(app.overlay.open, true);
  await app.frame();
  assert.equal(await result, '96385074');
  assert.equal(app.stopped(), 1);
  assert.equal(app.video.srcObject, null);
  assert.equal(app.overlay.removed, true);
  assert.deepEqual(app.requested(), { video: { facingMode: { ideal: 'environment' } }, audio: false });
});

test('permission denial offers manual entry and preserves leading zeros', async () => {
  const app = await setup({ media: async () => { throw Object.assign(new Error('denied'), { name: 'NotAllowedError' }); } });
  const result = app.scanBarcode();
  await settle();
  assert.match(app.status.textContent, /Permissão da câmera negada/);
  assert.equal(app.form.hidden, false);
  app.input.value = '036-000291452';
  app.input.oninput();
  app.form.onsubmit({ preventDefault() {} });
  assert.equal(await result, '036000291452');
});

test('route change, hiding and closing each cancel the scan and stop the camera', async () => {
  for (const action of ['route', 'hidden', 'close']) {
    const app = await setup();
    const result = app.scanBarcode();
    await settle();
    if (action === 'route') app.window.dispatchEvent(new Event('routechange'));
    if (action === 'hidden') { app.document.hidden = true; app.document.dispatchEvent(new Event('visibilitychange')); }
    if (action === 'close') app.close.onclick();
    assert.equal(await result, null);
    assert.equal(app.stopped(), 1, action);
    assert.equal(app.overlay.open, false);
  }
});

test('a late camera permission result cannot leak a track after choosing manual entry', async () => {
  let resolveMedia;
  const app = await setup({ media: () => new Promise(resolve => { resolveMedia = resolve; }) });
  const result = app.scanBarcode();
  app.manual.onclick();
  resolveMedia(app.stream);
  await settle();
  assert.equal(app.stopped(), 1);
  assert.equal(app.video.srcObject, null);
  app.input.value = '4006381333931';
  app.form.onsubmit({ preventDefault() {} });
  assert.equal(await result, '4006381333931');
});
