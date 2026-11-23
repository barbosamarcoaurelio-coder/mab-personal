const MAB_BRAND_VERSION='3.0.0';
function applyMabBrand(){
 document.title='MAB Training | Treino, Atividade e Evolução';
 document.documentElement.dataset.mabVersion=MAB_BRAND_VERSION;
 const h=document.querySelector('.topbar h1');if(h)h.innerHTML='<strong>MAB</strong> <span>Training</span>';
 document.querySelectorAll('*').forEach(el=>{if(el.children.length===0&&el.textContent?.includes('MAB Personal'))el.textContent=el.textContent.replaceAll('MAB Personal','MAB Training')});
 const settings=document.querySelector('#modalContent');if(settings?.querySelector('#exportBtn')&&!settings.querySelector('.mab-version-badge')){const b=document.createElement('div');b.className='mab-version-badge';b.textContent='MAB TRAINING · v3.0.0';settings.querySelector('.stack')?.appendChild(b)}
}
function showBrandSplash(){if(sessionStorage.getItem('mab-v300-splash'))return;const s=document.createElement('div');s.id='mabBrandSplash';s.innerHTML='<div class="mab-splash-inner"><img src="./mab-logo.svg" alt="MAB Training"><div class="mab-splash-tagline">TREINO · ATIVIDADE · EVOLUÇÃO</div><div class="mab-splash-line"></div></div>';document.body.appendChild(s);sessionStorage.setItem('mab-v300-splash','1');setTimeout(()=>{s.classList.add('hide');setTimeout(()=>s.remove(),500)},1500)}
new MutationObserver(()=>applyMabBrand()).observe(document.body,{childList:true,subtree:true});
window.addEventListener('routechange',()=>setTimeout(applyMabBrand,30));
applyMabBrand();showBrandSplash();
