// Pinta los mensajes como burbujas estilo Messenger: las mías a la derecha
// (doradas), las del otro a la izquierda. Siempre con textContent (nunca
// innerHTML) → el texto del usuario queda escapado por construcción.
import { $, hhmm } from "./util.js";

const list = () => $("#messages");

export function addMessage(m, me) {
  const li = document.createElement("li");
  li.className = "bubble " + (m.author === me ? "mine" : "theirs");

  const text = document.createElement("div");
  text.className = "text";
  text.textContent = m.body;

  const time = document.createElement("span");
  time.className = "time";
  time.textContent = hhmm(m.ts);

  li.append(text, time);

  const el = list();
  el.appendChild(li);
  el.scrollTop = el.scrollHeight;
}

export function renderHistory(messages, me) {
  list().innerHTML = "";
  messages.forEach((m) => addMessage(m, me));
}
