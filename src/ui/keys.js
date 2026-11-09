// Libellés des touches selon la disposition du clavier (AZERTY, QWERTY…).
const AZERTY = { KeyW: 'Z', KeyA: 'Q', KeyQ: 'A', KeyZ: 'W', KeyM: ',' };
let layoutMap = null;
const listeners = [];
export function initKeyLabels() {
  try {
    if (navigator.keyboard && navigator.keyboard.getLayoutMap) navigator.keyboard.getLayoutMap().then(m => { layoutMap = m; listeners.forEach(f => f()); }).catch(() => {});
  } catch { /* API absente */ }
}
export function onLayout(f) { listeners.push(f); }
const SPECIAL = { Space: 'Espace', ShiftLeft: 'Maj', Tab: 'Tab', Escape: 'Échap', Enter: 'Entrée', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→' };
export function keyLabel(code) {
  if (SPECIAL[code]) return SPECIAL[code];
  if (layoutMap && layoutMap.get(code)) return layoutMap.get(code).toUpperCase();
  const lang = navigator.language || '';
  if (/^fr/i.test(lang) && !/CA$/i.test(lang) && AZERTY[code]) return AZERTY[code];
  return code.replace(/^Key|^Digit/, '');
}
