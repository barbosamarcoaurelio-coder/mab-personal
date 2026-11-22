import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const rootDir = fileURLToPath(new URL('..', import.meta.url));

test('falha se algum item de ASSETS do service worker não existir no disco', () => {
  const swCode = readFileSync(path.join(rootDir, 'service-worker.js'), 'utf8');
  const assets = [];

  const arrMatch = /ASSETS\s*=\s*\[([^\]]+)\]/s.exec(swCode);
  assert.ok(arrMatch, 'Array ASSETS deve estar definido no service-worker.js');
  for (const m of arrMatch[1].matchAll(/["']([^"']+)["']/g)) {
    assets.push(m[1]);
  }

  const pushRegex = /ASSETS\.push\(([^)]+)\)/g;
  let pm;
  while ((pm = pushRegex.exec(swCode)) !== null) {
    for (const m of pm[1].matchAll(/["']([^"']+)["']/g)) {
      assets.push(m[1]);
    }
  }

  assert.ok(assets.length > 0, 'ASSETS não pode estar vazio');

  const missing = [];
  for (const item of assets) {
    const relative = item === './' ? 'index.html' : item.replace(/^\.\//, '').split('?')[0].split('#')[0];
    const fullPath = path.join(rootDir, relative);
    if (!existsSync(fullPath)) {
      missing.push(`${item} -> ${relative}`);
    }
  }

  assert.deepEqual(missing, [], `Itens de ASSETS ausentes no disco: ${missing.join(', ')}`);
});

test('falha se algum <script src> ou <link href> apontar para arquivo inexistente', () => {
  const htmlFiles = ['index.html', 'privacidade.html', 'termos.html', 'exclusao-de-dados.html'];
  const missing = [];

  for (const hf of htmlFiles) {
    const fullHtmlPath = path.join(rootDir, hf);
    assert.ok(existsSync(fullHtmlPath), `Página ${hf} deve existir`);
    const content = readFileSync(fullHtmlPath, 'utf8');

    const attrRegex = /(?:src|href)=["']([^"']+)["']/g;
    let m;
    while ((m = attrRegex.exec(content)) !== null) {
      const target = m[1];
      if (
        target.startsWith('http://') ||
        target.startsWith('https://') ||
        target.startsWith('data:') ||
        target.startsWith('#') ||
        target.startsWith('mailto:')
      ) {
        continue;
      }

      const relative = target.replace(/^\.\//, '').split('?')[0].split('#')[0];
      const targetPath = path.join(rootDir, relative);
      if (!existsSync(targetPath)) {
        missing.push(`${hf} referencia "${target}" (${relative}) que não existe`);
      }
    }
  }

  assert.deepEqual(missing, [], `Referências em HTML apontando para arquivos inexistentes: ${missing.join('; ')}`);
});

test('falha se algum import relativo em JS apontar para arquivo inexistente', () => {
  const rootFiles = readdirSync(rootDir, { withFileTypes: true })
    .filter(d => d.isFile() && (d.name.endsWith('.js') || d.name.endsWith('.mjs')))
    .map(d => d.name);

  const testsDir = path.join(rootDir, 'tests');
  const testFiles = existsSync(testsDir)
    ? readdirSync(testsDir)
        .filter(f => f.endsWith('.js') || f.endsWith('.mjs'))
        .map(f => path.join('tests', f))
    : [];

  const allJs = [...rootFiles, ...testFiles];
  const missing = [];

  const importRegex = /(?:import\s+(?:.*?\s+from\s+)?|export\s+.*?\s+from\s+|import\s*\()\s*["']([^"']+)["']/g;

  for (const relFile of allJs) {
    const fullPath = path.join(rootDir, relFile);
    const content = readFileSync(fullPath, 'utf8');
    let m;
    while ((m = importRegex.exec(content)) !== null) {
      const imp = m[1];
      if (!imp.startsWith('.')) continue;

      const resolvedRel = path.posix.normalize(path.posix.join(path.posix.dirname(relFile), imp)).split('?')[0];
      const resolvedFull = path.join(rootDir, resolvedRel);
      if (!existsSync(resolvedFull)) {
        missing.push(`${relFile} importa "${imp}" (${resolvedRel}) inexistente`);
      }
    }
  }

  assert.deepEqual(missing, [], `Imports relativos apontando para arquivos inexistentes: ${missing.join('; ')}`);
});

test('falha se houver .js na raiz sem referência', () => {
  const rootJs = readdirSync(rootDir)
    .filter(f => f.endsWith('.js') && statSync(path.join(rootDir, f)).isFile());

  const htmlFiles = ['index.html', 'privacidade.html', 'termos.html', 'exclusao-de-dados.html'];
  const testFiles = existsSync(path.join(rootDir, 'tests'))
    ? readdirSync(path.join(rootDir, 'tests'))
        .filter(f => f.endsWith('.js') || f.endsWith('.mjs'))
        .map(f => path.join('tests', f))
    : [];

  const checkFiles = [...htmlFiles, ...rootJs, ...testFiles];
  const contents = {};
  for (const cf of checkFiles) {
    try {
      contents[cf] = readFileSync(path.join(rootDir, cf), 'utf8');
    } catch (_) {}
  }

  const unreferenced = [];

  for (const js of rootJs) {
    if (js === 'service-worker.js') {
      // O service worker é registrado em runtime pelo app.js (navigator.serviceWorker.register('./service-worker.js'))
      const appJs = contents['app.js'] || '';
      if (!appJs.includes('service-worker.js')) {
        unreferenced.push(js);
      }
      continue;
    }

    let isReferenced = false;
    for (const [cf, body] of Object.entries(contents)) {
      if (cf === js) continue;
      if (body.includes(js)) {
        isReferenced = true;
        break;
      }
    }

    if (!isReferenced) {
      unreferenced.push(js);
    }
  }

  assert.deepEqual(unreferenced, [], `Arquivos .js na raiz sem referência encontrados: ${unreferenced.join(', ')}`);
});
