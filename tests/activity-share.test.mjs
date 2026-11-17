import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, SourceTextModule, SyntheticModule } from 'node:vm';

const source = readFileSync(new URL('../activity-share.js', import.meta.url), 'utf8');

async function setup(navigator, renderer = async () => ({ toBlob: callback => callback(null) })) {
  const context = createContext({
    navigator,
    document: { fonts: { ready: Promise.resolve() } }
  });
  const module = new SourceTextModule(source, { context });
  await module.link(specifier => {
    if (specifier.includes('html2canvas')) {
      return new SyntheticModule(['default'], function () {
        this.setExport('default', renderer);
      }, { context });
    }
    return new SyntheticModule(['esc'], function () {
      this.setExport('esc', String);
    }, { context });
  });
  await module.evaluate();
  return module.namespace;
}

test('shares the generated PNG file without substituting a text link', async () => {
  const file = { name: 'atividade.png', type: 'image/png' };
  let shared;
  const app = await setup({
    canShare: data => data.files[0] === file,
    share: async data => { shared = data; }
  });
  assert.equal(await app.shareActivityImage(file, 'Treino B'), true);
  assert.equal(shared.files.length, 1);
  assert.equal(shared.files[0], file);
  assert.equal(shared.title, 'Treino B');
  assert.equal(shared.url, undefined);
  assert.equal(shared.text, undefined);
});

test('text-only sharing is not mistaken for image sharing support', async () => {
  let calls = 0;
  const app = await setup({ canShare: () => false, share: async () => { calls++; } });
  await assert.rejects(app.shareActivityImage({}, 'Atividade'), /Salvar imagem/);
  assert.equal(calls, 0);
});

test('missing Web Share API keeps the explicit download alternative', async () => {
  const app = await setup({});
  await assert.rejects(app.shareActivityImage({}, 'Atividade'), /Salvar imagem/);
});

test('a cancelled native share is not reported as a successful share', async () => {
  const app = await setup({
    canShare: () => true,
    share: async () => { throw Object.assign(new Error('cancelled'), { name: 'AbortError' }); }
  });
  assert.equal(await app.shareActivityImage({}, 'Atividade'), false);
});

test('native failures are surfaced so the user can retry or download', async () => {
  const app = await setup({
    canShare: () => true,
    share: async () => { throw new Error('Permission denied'); }
  });
  await assert.rejects(app.shareActivityImage({}, 'Atividade'), /Permission denied/);
});

test('a failed PNG encoding does not open a success-shaped preview', async () => {
  const app = await setup({});
  const element = {
    querySelectorAll: () => [],
    getBoundingClientRect: () => ({ width: 300 }),
    scrollHeight: 500
  };
  await assert.rejects(app.openActivityShare(element, 'Atividade', () => {}), /Não foi possível gerar/);
});

test('a broken detail image is reported instead of exporting an incomplete card', async () => {
  const app = await setup({});
  const element = {
    querySelectorAll: () => [{ complete: true, naturalWidth: 0 }]
  };
  await assert.rejects(app.openActivityShare(element, 'Atividade', () => {}), /Uma imagem dos detalhes não carregou/);
});
