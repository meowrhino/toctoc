// La barra lateral: lista de conversaciones del usuario + formulario para abrir
// una nueva ("hablar con…"). Al pulsar un chat, abre esa conversación.
import { $, colorFor } from "./util.js";
import { api } from "./api.js";
import * as conversation from "./conversation.js";

function render(chats) {
  const ul = $("#chatlist");
  ul.innerHTML = "";
  for (const c of chats) {
    const li = document.createElement("li");
    li.textContent = c.other;
    li.style.borderLeftColor = colorFor(c.other); // acento por contacto
    li.addEventListener("click", () => {
      [...ul.children].forEach((n) => n.classList.remove("active"));
      li.classList.add("active");
      conversation.open(c);
    });
    ul.appendChild(li);
  }
}

async function reload() {
  const { chats } = await api.listChats();
  render(chats);
}

export async function init() {
  conversation.wireComposer();
  conversation.onAfterDelete(reload); // al borrar una conversación, refresca la lista
  await reload();

  // "toc": abre (o recupera) el 1:1 con alguien y salta a él.
  $("#newchat").addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = $("#newchatName");
    const other = input.value.trim();
    if (!other) return;
    const entry = await api.openChat(other); // { conversationId, other }
    input.value = "";
    await reload();
    conversation.open(entry);
  });
}
