const MAB_BRAND_VERSION='3.0.13';
function applyMabBrand(){
  document.title='MAB Training | Treino, Atividade e Evolução';
  document.documentElement.dataset.mabVersion=MAB_BRAND_VERSION;
  const h=document.querySelector('.topbar h1');
  if(h && h.dataset.mabBranded!=='1'){
    h.innerHTML='<strong>MAB</strong> <span>Training</span>';
    h.dataset.mabBranded='1';
  }
  const settings=document.querySelector('#modalContent');
  if(settings?.querySelector('#exportBtn')&&!settings.querySelector('.mab-version-badge')){
    const b=document.createElement('div');b.className='mab-version-badge';b.textContent='MAB TRAINING · v3.0.13';settings.querySelector('.stack')?.appendChild(b);
  }
}
function showBrandSplash(){
  if(sessionStorage.getItem('mab-v301-splash'))return;
  const s=document.createElement('div');s.id='mabBrandSplash';s.innerHTML='<div class="mab-splash-inner"><img src="./mab-logo.svg?v=3.0.1" alt="MAB Training"><div class="mab-splash-tagline">TREINO · ATIVIDADE · EVOLUÇÃO</div><div class="mab-splash-line"></div></div>';
  document.body.appendChild(s);sessionStorage.setItem('mab-v301-splash','1');setTimeout(()=>{s.classList.add('hide');setTimeout(()=>s.remove(),500)},1400);
}
document.addEventListener('DOMContentLoaded',()=>{applyMabBrand();showBrandSplash()},{once:true});
window.addEventListener('routechange',()=>setTimeout(applyMabBrand,40));
document.querySelector('#settingsBtn')?.addEventListener('click',()=>setTimeout(applyMabBrand,40));
