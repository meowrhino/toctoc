// Utilidades de color compartidas por el Worker (index.ts) y el motor
// (conversation.ts). El color es un atributo del USUARIO: se guarda en su UserDO
// y el Worker lo inyecta autenticado al conectar, así es consistente entre
// conversaciones y dispositivos (no depende del localStorage del navegador).

// Color admitido = hex (#rgb / #rrggbb) o hsl(h, s%, l%). Validar evita meter
// luego algo arbitrario en un `style` del cliente (inyección de CSS).
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const HSL = /^hsl\(\s*\d{1,3}\s*,\s*\d{1,3}%\s*,\s*\d{1,3}%\s*\)$/i;

export function cleanColor(c: unknown): string | null {
  if (typeof c !== "string") return null;
  const s = c.trim();
  if (s.length > 30) return null;
  return HEX.test(s) || HSL.test(s) ? s : null;
}

// Color por defecto determinista por nombre, en hex (mismo algoritmo y formato
// que el cliente en util.js) para quien aún no ha elegido uno.
export function defaultColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return hslToHex(h, 55, 70);
}

function hslToHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(255 * c).toString(16).padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}
