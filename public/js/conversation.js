// La conversación abierta: conecta su WebSocket, pinta el historial y los
// mensajes en vivo, cablea el envío y el botón de borrar. Al abrir otra cierra
// la anterior para no acumular sockets.
import { $ } from "./util.js";
import { getMe } from "./session.js";
import { api } from "./api.js";
import { connectConversation } from "./ws.js";
import { addMessage, renderHistory, applyColor } from "./render.js";
import * as alerts from "./alerts.js";

let conn = null;
let current = null; // entry abierto { conversationId, other }
let currentOnline = []; // nombres conectados ahora en esta conversación
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
    onHistory: (msgs, profiles, online) => {
      renderHistory(msgs, me, profiles);
      updatePresence(online);
    },
    onMessage: (m) => {
      addMessage(m, me);
      // sonido/badge/notificación solo si el mensaje es del otro
      if (m.kind !== "system" && m.author !== me) alerts.incoming(m.author, m.body);
    },
    onColor: ({ name, color }) => applyColor(name, color),
    onCleared: () => {
      // El otro borró la conversación → la quitamos también de nuestra vista.
      closePanel();
      afterDelete();
    },
    onPresence: updatePresence,
  });
}

// Cabecera: puntito de presencia del otro + su nombre, y botón de borrar.
function buildHead(entry) {
  const head = $("#convhead");
  head.innerHTML = "";
  const left = document.createElement("span");
  left.className = "convleft";
  const dot = document.createElement("span");
  dot.className = "convdot off";
  dot.id = "otherdot";
  const name = document.createElement("span");
  name.className = "convname";
  name.textContent = entry.other;
  left.append(dot, name);
  const del = document.createElement("button");
  del.type = "button";
  del.className = "delchat";
  del.title = "borrar conversación";
  del.textContent = "borrar";
  del.addEventListener("click", deleteCurrent);
  head.append(left, del);
  head.classList.remove("hidden");
  updatePresence(currentOnline);
}

// Refleja si el otro está en línea (puntito verde) o desconectado (gris).
function updatePresence(online) {
  currentOnline = online || [];
  const dot = $("#otherdot");
  if (!dot || !current) return;
  const on = currentOnline.includes(current.other);
  dot.classList.toggle("on", on);
  dot.classList.toggle("off", !on);
  dot.title = on ? "en línea" : "desconectado";
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
    alerts.askNotifPermission(); // gesto del usuario → buen momento para pedir permiso
    conn.send(body);
    input.value = "";
  });
}
