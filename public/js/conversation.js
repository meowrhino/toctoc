// La conversación abierta: conecta su WebSocket, pinta el historial y los
// mensajes en vivo, y cablea el formulario de envío. Al abrir otra conversación
// cierra la anterior para no acumular sockets.
import { $ } from "./util.js";
import { getMe } from "./session.js";
import { connectConversation } from "./ws.js";
import { addMessage, renderHistory, applyColor } from "./render.js";

let conn = null;

export function open(entry) {
  // Cabecera + paneles visibles (ocultamos el "elige un chat").
  $("#empty").classList.add("hidden");
  $("#convhead").textContent = entry.other;
  $("#convhead").classList.remove("hidden");
  $("#messages").classList.remove("hidden");
  $("#composer").classList.remove("hidden");

  const me = getMe();
  conn?.close(); // cierra el socket anterior antes de abrir el nuevo
  renderHistory([], me, {}); // limpia la lista mientras llega el historial

  conn = connectConversation({
    conversationId: entry.conversationId,
    onHistory: (msgs, profiles) => renderHistory(msgs, me, profiles),
    onMessage: (m) => addMessage(m, me),
    onColor: ({ name, color }) => applyColor(name, color),
  });
}

// Reenvía un cambio de color a la conversación abierta (si la hay), para que el
// otro lo vea en vivo. La persistencia global la hace main.js vía /api/color.
export function sendColor(color) {
  conn?.setColor(color);
}

// Se cablea una sola vez al arrancar la app; el form siempre envía al chat
// actualmente abierto (la `conn` viva).
export function wireComposer() {
  $("#composer").addEventListener("submit", (e) => {
    e.preventDefault();
    const input = $("#body");
    const body = input.value.trim();
    if (!body || !conn) return;
    conn.send(body);
    input.value = "";
  });
}
