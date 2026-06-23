// Helpers minúsculos compartidos por el resto de módulos de toctoc.

export const $ = (sel, root = document) => root.querySelector(sel);

// Color estable por nombre: hash simple del nombre → tono HSL, con saturación y
// luz fijas para que se lea sobre el fondo oscuro cálido de twoitter. En toctoc
// lo usamos para marcar cada contacto en la lista de chats.
export function colorFor(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return `hsl(${h}, 55%, 70%)`;
}

// Hora corta HH:MM a partir de un timestamp en ms.
export function hhmm(ts) {
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}
