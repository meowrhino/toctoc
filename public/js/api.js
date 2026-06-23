// Cliente REST de toctoc. La identidad viaja en una cookie HttpOnly que pone el
// servidor en /api/login, así que el navegador la manda sola: basta un fetch
// normal mismo-origen. Cada método devuelve el JSON ya parseado, o lanza.

async function jsonOrThrow(res) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

export const api = {
  // ¿Quién soy según la cookie? → { name: string | null }
  me: () => fetch("/api/me").then(jsonOrThrow),

  // Reclama un nombre (sin contraseña en v0) → { name }
  login: (name) =>
    fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    }).then(jsonOrThrow),

  // Mis conversaciones → { chats: [{ conversationId, other, createdAt }] }
  listChats: () => fetch("/api/chats").then(jsonOrThrow),

  // Abre (o recupera) el 1:1 con `other` → { conversationId, other }
  openChat: (other) =>
    fetch("/api/chats", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ with: other }),
    }).then(jsonOrThrow),
};
