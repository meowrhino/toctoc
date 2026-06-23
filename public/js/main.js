// Arranque: ¿hay cookie de identidad? → entra a la app; si no → login. Tras un
// login correcto, entra igual. También cablea el selector de color de la
// cabecera (el color es del usuario, global a todas sus conversaciones).
import { $ } from "./util.js";
import { api } from "./api.js";
import { setMe, getMe, setMyColor, showLogin, showApp } from "./session.js";
import { applyColor } from "./render.js";
import * as chats from "./chats.js";
import * as conversation from "./conversation.js";
import * as alerts from "./alerts.js";

const picker = $("#mycolor");

alerts.setup({ emoji: "🚪", base: "toctoc" });

async function enter(name, color) {
  setMe(name);
  setMyColor(color);
  picker.value = color;
  picker.classList.remove("hidden");
  showApp();
  await chats.init();
}

async function login() {
  const input = $("#loginName");
  const name = input.value.trim();
  if (!name) return;
  await api.login(name);
  const me = await api.me(); // ya autenticado → trae {name, color}
  await enter(me.name, me.color);
}

// Cableado de la pantalla de login (botón + Enter).
$("#loginBtn").addEventListener("click", login);
$("#loginName").addEventListener("keydown", (e) => {
  if (e.key === "Enter") login();
});

// Selector de color: mientras arrastro (`input`) re-tiño en local sin red; al
// soltar (`change`) lo persisto (global) y aviso a la conversación abierta.
picker.addEventListener("input", () => {
  const c = picker.value;
  setMyColor(c);
  applyColor(getMe(), c);
});
picker.addEventListener("change", async () => {
  const c = picker.value;
  setMyColor(c);
  applyColor(getMe(), c);
  conversation.sendColor(c);
  try {
    await api.setColor(c);
  } catch {
    /* la próxima conexión recogerá el color del servidor igualmente */
  }
});

// ¿Ya tenemos sesión?
const me = await api.me();
if (me.name) await enter(me.name, me.color);
else showLogin();
