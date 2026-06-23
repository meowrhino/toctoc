// Arranque: ¿hay cookie de identidad? → entra a la app; si no → pantalla de
// login. Tras un login correcto, entra igual.
import { $ } from "./util.js";
import { api } from "./api.js";
import { setMe, showLogin, showApp } from "./session.js";
import * as chats from "./chats.js";

async function enter(name) {
  setMe(name);
  showApp();
  await chats.init();
}

async function login() {
  const input = $("#loginName");
  const name = input.value.trim();
  if (!name) return;
  const res = await api.login(name);
  await enter(res.name);
}

// Cableado de la pantalla de login (botón + Enter).
$("#loginBtn").addEventListener("click", login);
$("#loginName").addEventListener("keydown", (e) => {
  if (e.key === "Enter") login();
});

// ¿Ya tenemos sesión?
const { name } = await api.me();
if (name) await enter(name);
else showLogin();
