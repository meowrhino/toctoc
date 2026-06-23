// Pinta los mensajes como burbujas estilo Messenger: las mías a la derecha, las
// del otro a la izquierda. Cada burbuja se tiñe con el color de su autor (el
// elegido, o el determinista por defecto), con texto legible automático.
// Siempre con textContent (nunca innerHTML) → el texto del usuario va escapado.
import { $, colorFor, textOn, hhmm, linkifyInto } from "./util.js";

const list = () => $("#messages");

let colors = {}; // nombre → color (snapshot del DO + cambios en vivo)

const colorOf = (name) => colors[name] || colorFor(name);

function tint(li, name) {
  const color = colorOf(name);
  li.style.background = color;
  li.style.color = textOn(color);
}

export function addMessage(m, me) {
  const box = list();
  // ¿estaba pegado al fondo? si subió a leer, no lo arrancamos abajo
  const wasAtBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 80;

  // Avisos de la sala (conexión/desconexión): línea centrada, no burbuja.
  if (m.kind === "system") {
    const sys = document.createElement("li");
    sys.className = "sysline";
    sys.textContent = `${m.author} ${m.body}`;
    box.appendChild(sys);
    if (wasAtBottom) box.scrollTop = box.scrollHeight;
    return;
  }

  const li = document.createElement("li");
  li.className = "bubble " + (m.author === me ? "mine" : "theirs");
  li.dataset.author = m.author;
  tint(li, m.author);

  const text = document.createElement("div");
  text.className = "text";
  linkifyInto(text, m.body);

  const time = document.createElement("span");
  time.className = "time";
  time.textContent = hhmm(m.ts);

  li.append(text, time);
  box.appendChild(li);
  if (wasAtBottom) box.scrollTop = box.scrollHeight;
}

export function renderHistory(messages, me, profiles) {
  colors = profiles || {};
  list().innerHTML = "";
  messages.forEach((m) => addMessage(m, me));
}

// Alguien (quizá yo) cambió su color: actualiza el mapa y re-tiñe sus burbujas.
// Comparamos dataset.author en JS (no por selector) para evitar inyección.
export function applyColor(name, color) {
  colors[name] = color;
  for (const li of list().querySelectorAll(".bubble")) {
    if (li.dataset.author === name) tint(li, name);
  }
}
