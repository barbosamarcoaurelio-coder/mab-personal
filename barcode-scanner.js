const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'];
let closeActiveScanner;

async function createReader() {
  if (globalThis.BarcodeDetector?.getSupportedFormats) {
    try {
      const formats = await globalThis.BarcodeDetector.getSupportedFormats();
      if (FORMATS.every(format => formats.includes(format))) {
        const detector = new globalThis.BarcodeDetector({ formats: FORMATS });
        return async video => (await detector.detect(video)).map(item => item.rawValue);
      }
    } catch (error) {
      console.warn('Leitor nativo indisponível; usando ZXing local.', error);
    }
  }
  const zxing = await import('./vendor/zxing/reader/index.js');
  await zxing.prepareZXingModule({
    overrides: { locateFile: () => new URL('./vendor/zxing/reader/zxing_reader.wasm', import.meta.url).href },
    fireImmediately: true
  });
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Não foi possível preparar a leitura da câmera.');
  return async video => {
    canvas.width = Math.min(video.videoWidth, 1280);
    canvas.height = Math.round(video.videoHeight * canvas.width / video.videoWidth);
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const results = await zxing.readBarcodes(context.getImageData(0, 0, canvas.width, canvas.height), {
      formats: ['EAN13', 'EAN8', 'UPCA', 'UPCE'], maxNumberOfSymbols: 1, tryHarder: true
    });
    return results.map(item => item.text);
  };
}

export function scanBarcode() {
  closeActiveScanner?.();
  return new Promise(resolve => {
    const previousFocus = document.activeElement;
    const overlay = document.createElement('dialog');
    overlay.id = 'barcodeScanner';
    overlay.className = 'barcode-scanner';
    overlay.setAttribute('aria-label', 'Ler código de barras');
    overlay.innerHTML = `<div class="stack"><div class="row"><h2>Ler código de barras</h2><button type="button" class="ghost" data-scan-close aria-label="Fechar câmera">✕</button></div><p data-scan-status role="status">Abrindo câmera…</p><video playsinline muted></video><p class="muted" data-scan-help>Centralize o código e aguarde duas leituras iguais. A imagem fica neste aparelho.</p><button type="button" class="primary" data-scan-manual>Digitar código</button><form class="stack" hidden><label class="field">Código de barras<input name="barcode" inputmode="numeric" pattern="[0-9]+" autocomplete="off" required></label><button class="primary">Usar código</button></form></div>`;
    document.body.appendChild(overlay);
    const video = overlay.querySelector('video');
    const status = overlay.querySelector('[data-scan-status]');
    const form = overlay.querySelector('form');
    const input = form.elements.namedItem('barcode');
    let stream, timer, done = false, reading = true, last = '', matches = 0;
    const stopCamera = () => {
      reading = false;
      clearTimeout(timer);
      stream?.getTracks().forEach(track => track.stop());
      video.srcObject = null;
    };
    const finish = code => {
      if (done) return;
      done = true;
      stopCamera();
      document.removeEventListener('visibilitychange', hidden);
      window.removeEventListener('routechange', cancel);
      closeActiveScanner = null;
      overlay.close();
      overlay.remove();
      if (previousFocus?.isConnected) previousFocus.focus();
      resolve(code);
    };
    const cancel = () => finish(null);
    const hidden = () => { if (document.hidden) cancel(); };
    const manual = message => {
      if (done) return;
      stopCamera();
      video.hidden = true;
      overlay.querySelector('[data-scan-help]').hidden = true;
      overlay.querySelector('[data-scan-manual]').hidden = true;
      status.textContent = message;
      form.hidden = false;
      input.focus();
    };
    closeActiveScanner = cancel;
    overlay.querySelector('[data-scan-close]').onclick = cancel;
    overlay.querySelector('[data-scan-manual]').onclick = () => manual('Digite os números impressos no rótulo.');
    overlay.oncancel = event => { event.preventDefault(); cancel(); };
    overlay.onclose = cancel;
    input.oninput = () => { input.value = input.value.replace(/\D/g, ''); };
    form.onsubmit = event => {
      event.preventDefault();
      if (/^\d+$/.test(input.value)) finish(input.value);
      else status.textContent = 'Informe um código contendo somente dígitos.';
    };
    document.addEventListener('visibilitychange', hidden);
    window.addEventListener('routechange', cancel);
    overlay.showModal();
    video.muted = true;
    const start = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('Câmera indisponível. Use HTTPS e permita o acesso à câmera.');
        const acquired = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
        if (done || !reading) { acquired.getTracks().forEach(track => track.stop()); return; }
        stream = acquired;
        video.srcObject = stream;
        await video.play();
        const read = await createReader();
        if (done || !reading) return;
        status.textContent = 'Aponte para o código de barras.';
        const tick = async () => {
          if (done || !reading) return;
          const started = performance.now();
          try {
            if (video.readyState >= 2 && video.videoWidth > 0) {
              const codes = await read(video);
              if (done || !reading) return;
              const code = codes.find(value => /^\d+$/.test(value)) || '';
              matches = code && code === last ? matches + 1 : code ? 1 : 0;
              last = code;
              if (matches >= 2) { finish(code); return; }
            }
            timer = setTimeout(tick, Math.max(0, 125 - (performance.now() - started)));
          } catch (error) {
            if (done || !reading) return;
            console.error('Leitura do código de barras:', error);
            manual('Não foi possível ler pela câmera. Digite o código para continuar.');
          }
        };
        await tick();
      } catch (error) {
        if (done || !reading) return;
        console.error('Câmera do diário:', error);
        manual(error.name === 'NotAllowedError'
          ? 'Permissão da câmera negada. Libere a câmera nos ajustes do navegador/app ou digite o código.'
          : `Não foi possível abrir a câmera. ${error.message} Digite o código para continuar.`);
      }
    };
    void start();
  });
}
