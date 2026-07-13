import crypto from 'crypto';

// Sin caracteres ambiguos (0/O, 1/l/I) ni símbolos que rompan copy/paste en shells.
const SETS = [
  'abcdefghijkmnpqrstuvwxyz',
  'ABCDEFGHJKLMNPQRSTUVWXYZ',
  '23456789',
  '!@#%+=-_',
];

function pick(set) {
  return set[crypto.randomInt(set.length)];
}

export function generatePassword(length = 16) {
  const all = SETS.join('');
  const chars = SETS.map(pick); // garantiza una de cada clase
  while (chars.length < length) chars.push(pick(all));
  // mezcla Fisher-Yates con randomInt
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}
