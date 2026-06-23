// Helpers minúsculos compartidos por el resto de módulos de toctoc.

export const $ = (sel, root = document) => root.querySelector(sel);

// Color por defecto determinista por nombre, en hex (mismo algoritmo que el
// servidor en color.ts) para que el <input type="color"> lo pueda mostrar. Es
// solo el color POR DEFECTO: cada quien puede elegir el suyo.
export function colorFor(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return hslToHex(h, 55, 70);
}

function hslToHex(h, s, l) {
  s /= 100;
  l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => {
    const k = (n + h / 30) % 12;
    const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(255 * c).toString(16).padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

// Texto legible (oscuro/claro) según la luminancia del color de fondo, para que
// la burbuja se lea sea cual sea el color elegido.
export function textOn(color) {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color || "");
  if (!m) return "#0d0c0a";
  let hex = m[1];
  if (hex.length === 3) hex = hex.split("").map((c) => c + c).join("");
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
  return lum > 150 ? "#0d0c0a" : "#f5f0e6";
}

// Hora corta HH:MM a partir de un timestamp en ms.
export function hhmm(ts) {
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}
