import html2canvas from './vendor/html2canvas/html2canvas.esm.js';
import { esc } from './validators.js';

export function canShareActivityImage(file) {
  return typeof navigator.share === 'function' &&
    typeof navigator.canShare === 'function' &&
    navigator.canShare({ files: [file] });
}

export async function shareActivityImage(file, title) {
  if (!canShareActivityImage(file)) {
    throw new Error('Compartilhamento de imagens indisponível neste navegador. Use Salvar imagem.');
  }
  try {
    await navigator.share({ files: [file], title });
    return true;
  } catch (error) {
    if (error.name === 'AbortError') return false;
    throw error;
  }
}

async function waitForImages(element) {
  await Promise.all([...element.querySelectorAll('img')].map(image => {
    if (image.complete) {
      if (image.naturalWidth > 0) return;
      throw new Error('Uma imagem dos detalhes não carregou.');
    }
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        image.removeEventListener('load', loaded);
        image.removeEventListener('error', failed);
      };
      const loaded = () => { cleanup(); resolve(); };
      const failed = () => { cleanup(); reject(new Error('Uma imagem dos detalhes não carregou.')); };
      image.addEventListener('load', loaded, { once: true });
      image.addEventListener('error', failed, { once: true });
    });
  }));
}

async function captureActivity(element) {
  await document.fonts.ready;
  await waitForImages(element);
  const svgImages = new Map();
  for (const image of element.querySelectorAll('img')) {
    if (!new URL(image.src).pathname.endsWith('.svg')) continue;
    const raster = document.createElement('canvas');
    raster.width = Math.ceil(image.width * 2);
    raster.height = Math.ceil(image.height * 2);
    const context = raster.getContext('2d');
    if (!context) throw new Error('Não foi possível preparar o logotipo da atividade.');
    const fit = Math.min(raster.width / image.naturalWidth, raster.height / image.naturalHeight);
    const fittedWidth = image.naturalWidth * fit;
    const fittedHeight = image.naturalHeight * fit;
    context.drawImage(image, (raster.width - fittedWidth) / 2, (raster.height - fittedHeight) / 2, fittedWidth, fittedHeight);
    svgImages.set(image.src, raster.toDataURL('image/png'));
  }
  const width = Math.ceil(element.getBoundingClientRect().width) + 32;
  const height = element.scrollHeight + 32;
  const scale = Math.min(2, Math.sqrt(4000000 / (width * height)), 8192 / Math.max(width, height));
  const canvas = await html2canvas(element, {
    backgroundColor: '#111111',
    scale,
    useCORS: true,
    logging: false,
    async onclone(clonedDocument, card) {
      // Retira apenas o clone do dialog para capturar todo o conteúdo, sem cortes.
      clonedDocument.body.replaceChildren(card);
      clonedDocument.body.style.margin = '0';
      card.style.cssText = `display:grid;gap:10px;width:${width}px;max-width:none;padding:16px;margin:0;background:#111;color:#fff;box-sizing:border-box;overflow-wrap:anywhere`;
      for (const image of card.querySelectorAll('img')) {
        const raster = svgImages.get(image.src);
        if (raster) {
          image.src = raster;
        }
      }
      await waitForImages(card);
    }
  });
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) resolve(blob);
      else reject(new Error('Não foi possível gerar a imagem da atividade.'));
    }, 'image/png');
  });
}

export async function openActivityShare(element, title, onBack) {
  const blob = await captureActivity(element);
  const dialog = document.querySelector('#modal');
  if (!element.isConnected || !dialog?.open) return;
  const file = new File([blob], `mab-atividade-${new Date().toISOString().replace(/[:.]/g, '-')}.png`, { type: 'image/png' });
  const nativeShare = canShareActivityImage(file);
  const url = URL.createObjectURL(file);
  const content = document.querySelector('#modalContent');
  content.innerHTML = `<section class="stack mab-share-panel" aria-labelledby="mabShareHeading">
    <div class="row"><h2 id="mabShareHeading">Compartilhar atividade</h2><button type="button" class="ghost" id="mabShareClose" aria-label="Fechar compartilhamento">✕</button></div>
    <p class="muted">Revise a imagem antes de compartilhar. Seus registros não serão alterados.</p>
    <img id="mabSharePreview" class="mab-share-preview" src="${url}" alt="Imagem dos detalhes de ${esc(title)}">
    <button type="button" class="primary" id="mabShareNative" ${nativeShare ? '' : 'disabled'}>Instagram / WhatsApp</button>
    <button type="button" class="secondary" id="mabShareSave">Salvar imagem</button>
    <p class="muted mab-share-help">O compartilhamento abre as opções do sistema; os aplicativos disponíveis dependem do aparelho. Para o rolo da câmera, escolha Salvar Imagem/Fotos, quando disponível, ou toque e segure a imagem acima. Sem compartilhamento nativo, Salvar imagem baixa o arquivo, sem adicioná-lo automaticamente às Fotos.</p>
    <p id="mabShareStatus" class="muted mab-share-help" role="status" aria-live="polite">${nativeShare ? '' : 'Este navegador não permite compartilhar arquivos. Use Salvar imagem ou toque e segure a prévia para salvá-la.'}</p>
    <button type="button" class="ghost" id="mabShareBack">Voltar aos detalhes</button>
  </section>`;
  const preview = content.querySelector('#mabSharePreview');
  const status = content.querySelector('#mabShareStatus');
  const nativeButton = content.querySelector('#mabShareNative');
  const saveButton = content.querySelector('#mabShareSave');
  const cleanup = () => {
    URL.revokeObjectURL(url);
    observer.disconnect();
    dialog.removeEventListener('close', cleanup);
  };
  const observer = new MutationObserver(() => {
    if (!preview.isConnected) cleanup();
  });
  observer.observe(content, { childList: true, subtree: true });
  dialog.addEventListener('close', cleanup);
  content.querySelector('#mabShareClose').onclick = () => dialog.close();
  content.querySelector('#mabShareBack').onclick = onBack;
  const share = async saving => {
    nativeButton.disabled = true;
    saveButton.disabled = true;
    status.textContent = saving
      ? 'Escolha Salvar Imagem/Fotos nas opções do sistema, quando disponível.'
      : 'Escolha Instagram, WhatsApp ou outro aplicativo nas opções do sistema.';
    try {
      // A imagem já está pronta: a chamada nativa preserva o gesto deste toque.
      const shared = await shareActivityImage(file, title);
      if (!shared) status.textContent = 'Compartilhamento cancelado. A imagem continua disponível.';
    } catch (error) {
      console.error('Falha ao compartilhar a imagem da atividade.', error);
      status.textContent = 'Não foi possível abrir o compartilhamento. Tente novamente ou toque e segure a prévia para salvar a imagem.';
    } finally {
      nativeButton.disabled = !nativeShare;
      saveButton.disabled = false;
    }
  };
  nativeButton.onclick = () => share(false);
  saveButton.onclick = () => {
    if (nativeShare) return share(true);
    const download = document.createElement('a');
    download.href = url;
    download.download = file.name;
    download.hidden = true;
    content.appendChild(download);
    download.click();
    download.remove();
    status.textContent = 'Salvamento solicitado. Abra o arquivo baixado para salvá-lo em Fotos/Galeria.';
  };
}
