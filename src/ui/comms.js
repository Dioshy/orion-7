// Messages radio affichés en haut à gauche.
const el = () => document.getElementById('comms');
let lastText = '', lastT = 0;
export function comms(text, kind = '', who) {
  const now = performance.now();
  if (text === lastText && now - lastT < 2500) return;
  lastText = text; lastT = now;
  const box = el(), m = document.createElement('div'); m.className = 'msg ' + kind;
  const w = document.createElement('span'); w.className = 'who';
  w.textContent = who || (kind === 'danger' ? 'Alerte' : 'Contrôle Orion');
  m.append(w, document.createTextNode(text)); box.append(m);
  while (box.children.length > 4) box.firstChild.remove();
  setTimeout(() => { m.style.opacity = '0'; setTimeout(() => m.remove(), 1000); }, 7000);
}
export function clearComms() { el().replaceChildren(); }
