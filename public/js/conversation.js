// La conversación abierta: conecta su WebSocket, pinta el historial y los
// mensajes en vivo, cablea el envío y el botón de borrar. Al abrir otra cierra
// la anterior para no acumular sockets.
import { $ } from "./util.js";
import { getMe } from "./session.js";
import { api } from "./api.js";
import { connectConversation } from "./ws.js";
import { addMessage, renderHistory, applyColor } from "./render.js";

let conn = null;
let current = null; // entry abierto { conversationId, other }
let afterDelete = () => {}; // lo fija chats.js para refrescar la barra lateral

export function onAfterDelete(fn) {
  afterDelete = fn;
}

export function open(entry) {
  current = entry;
  buildHead(entry);
  $("#empty").classList.add("hidden");
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
    onCleared: () => {
      // El otro borró la conversación → la quitamos también de nuestra vista.
      closePanel();
      afterDelete();
    },
  });
}

// Cabecera: nombre del otro + botón de borrar.
function buildHead(entry) {
  const head = $("#convhead");
  head.innerHTML = "";
  const name = document.createElement("span");
  name.className = "convname";
  name.textContent = entry.other;
  const del = document.createElement("button");
  del.type = "button";
  del.className = "delchat";
  del.title = "borrar conversación";
  del.textContent = "borrar";
  del.addEventListener("click", deleteCurrent);
  head.append(name, del);
  head.classList.remove("hidden");
}

async function deleteCurrent() {
  if (!current) return;
  if (!confirm(`¿borrar la conversación con ${current.other}? se borra para los dos.`)) return;
  await api.deleteChat(current.conversationId);
  closePanel();
  afterDelete();
}

function closePanel() {
  conn?.close();
  conn = null;
  current = null;
  $("#convhead").classList.add("hidden");
  $("#messages").classList.add("hidden");
  $("#composer").classList.add("hidden");
  $("#empty").classList.remove("hidden");
}

// Reenvía un cambio de color a la conversación abierta (si la hay). La
// persistencia global la hace main.js vía /api/color.
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
