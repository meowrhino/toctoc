// Estado de identidad del cliente + cambio entre la pantalla de login y la app.
// El nombre "de verdad" vive en la cookie del servidor; aquí guardamos una copia
// en memoria para saber, al pintar, qué burbujas son mías (derecha) y cuáles del
// otro (izquierda).
import { $ } from "./util.js";

let me = null;

export const getMe = () => me;

export function setMe(name) {
  me = name;
  $("#whoami").textContent = name ? `tú: ${name}` : "";
}

export function showLogin() {
  $("#login").classList.remove("hidden");
  $("#app").classList.add("hidden");
}

export function showApp() {
  $("#login").classList.add("hidden");
  $("#app").classList.remove("hidden");
}
