let workoutActive = false;
let screenLock = null;
let pendingRequest = null;
let warningShown = false;

export function screenWakeLockStatus() {
  if (screenLock && !screenLock.released) return 'Tela ativa durante o treino';
  return 'Tela pode bloquear: verifique o navegador e a economia de bateria';
}

function updateStatus() {
  document.querySelectorAll('#wakeStatus, [data-wake-status]').forEach(element => {
    const text = screenWakeLockStatus();
    if (element.textContent !== text) element.textContent = text;
  });
}

function warnUnavailable(error) {
  if (error) console.warn('Não foi possível manter a tela ativa durante o treino.', error);
  updateStatus();
  if (!workoutActive || document.hidden || warningShown) return;
  warningShown = true;
  const toast = document.querySelector('#toast');
  if (toast) {
    toast.textContent = screenWakeLockStatus();
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 5000);
  }
}

async function releaseScreenLock() {
  const lock = screenLock;
  if (!lock) return;
  try {
    if (!lock.released) await lock.release();
    if (screenLock === lock) screenLock = null;
  } catch (error) {
    console.warn('Não foi possível liberar a tela ativa.', error);
  }
  updateStatus();
}

export async function setWorkoutScreenActive(active) {
  if (active && !workoutActive) warningShown = false;
  workoutActive = active;
  if (!active || document.hidden) {
    await releaseScreenLock();
    return false;
  }
  if (!navigator.wakeLock?.request) {
    warnUnavailable();
    return false;
  }
  if (screenLock && !screenLock.released) {
    updateStatus();
    return true;
  }
  if (pendingRequest) return pendingRequest;
  pendingRequest = (async () => {
    try {
      const lock = await navigator.wakeLock.request('screen');
      // A sessão pode terminar enquanto o sistema processa a solicitação.
      if (!workoutActive || document.hidden) {
        await lock.release();
        return false;
      }
      screenLock = lock;
      lock.addEventListener('release', () => {
        if (screenLock !== lock) return;
        screenLock = null;
        updateStatus();
        if (workoutActive && !document.hidden) setWorkoutScreenActive(true);
      });
      updateStatus();
      return true;
    } catch (error) {
      warnUnavailable(error);
      return false;
    }
  })();
  try {
    return await pendingRequest;
  } finally {
    pendingRequest = null;
  }
}

document.addEventListener('visibilitychange', () => setWorkoutScreenActive(workoutActive));
window.addEventListener('pageshow', () => setWorkoutScreenActive(workoutActive));
window.addEventListener('focus', () => setWorkoutScreenActive(workoutActive));
document.addEventListener('pointerdown', () => {
  if (workoutActive && (!screenLock || screenLock.released)) setWorkoutScreenActive(true);
}, { passive: true });
