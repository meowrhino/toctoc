import { ConversationDO } from "./conversation";
import { UserDO } from "./userdo";
import { getUser, setUserCookie } from "./auth";

export interface Env {
  CHAT: DurableObjectNamespace<ConversationDO>;
  USERS: DurableObjectNamespace<UserDO>;
  ASSETS: Fetcher;
  // Secret para firmar la cookie de identidad (HMAC). En prod: `wrangler secret
  // put AUTH_SECRET`; en local: .dev.vars.
  AUTH_SECRET: string;
}

export { ConversationDO, UserDO };

// 1:1 → id determinista a partir del par de nombres ordenado.
// (grupos = fase 2: id uuid + lista de miembros.)
function conversationIdFor(a: string, b: string): string {
  return [a, b].sort().join("~");
}

function json(data: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const user = await getUser(request, env.AUTH_SECRET);

    // --- WebSocket de una conversación ---
    if (url.pathname === "/ws") {
      if (request.headers.get("Upgrade") !== "websocket") {
        return new Response("expected websocket", { status: 426 });
      }
      if (!user) return new Response("unauthorized", { status: 401 });

      const conv = url.searchParams.get("conversation") || "";
      // Membresía (1:1): el id contiene ambos nombres; basta con estar en él.
      const members = conv.split("~");
      if (members.length !== 2 || !members.includes(user)) {
        return new Response("forbidden", { status: 403 });
      }

      // Reenviamos al DO con el nombre AUTENTICADO (ignoramos lo que diga el cliente).
      const target = new URL(request.url);
      target.searchParams.set("name", user);
      const stub = env.CHAT.get(env.CHAT.idFromName(conv));
      return stub.fetch(new Request(target, request));
    }

    // --- Identidad ---
    if (url.pathname === "/api/login" && request.method === "POST") {
      if (!env.AUTH_SECRET) return json({ error: "server misconfigured" }, { status: 500 });
      const { name } = (await request.json()) as { name?: string };
      const clean = String(name || "").trim().slice(0, 25);
      if (!clean) return json({ error: "name required" }, { status: 400 });
      const cookie = await setUserCookie(clean, env.AUTH_SECRET);
      return json({ name: clean }, { headers: { "Set-Cookie": cookie } });
    }

    if (url.pathname === "/api/me") {
      return json({ name: user });
    }

    // --- Lista de chats / abrir chat ---
    if (url.pathname === "/api/chats" && request.method === "GET") {
      if (!user) return json({ error: "unauthorized" }, { status: 401 });
      const chats = await env.USERS.get(env.USERS.idFromName(user)).listChats();
      return json({ chats });
    }

    if (url.pathname === "/api/chats" && request.method === "POST") {
      if (!user) return json({ error: "unauthorized" }, { status: 401 });
      const { with: target } = (await request.json()) as { with?: string };
      const other = String(target || "").trim().slice(0, 25);
      if (!other || other === user) return json({ error: "bad target" }, { status: 400 });

      const conv = conversationIdFor(user, other);
      // Lo registramos en la bandeja de AMBOS, para que los dos lo vean.
      await env.USERS.get(env.USERS.idFromName(user)).addChat(conv, other);
      await env.USERS.get(env.USERS.idFromName(other)).addChat(conv, user);
      return json({ conversationId: conv, other });
    }

    // --- Estático ---
    return env.ASSETS.fetch(request);
  },
};
