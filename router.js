let current=localStorage.getItem('mab-last-route')||'dashboard';
export function route(){return current}
export function navigate(next){current=next;localStorage.setItem('mab-last-route',next);window.dispatchEvent(new CustomEvent('routechange',{detail:next}))}
