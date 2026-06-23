import { DurableObject } from "cloudflare:workers";
import type { Env } from "./index";
import { cleanColor } from "./color";

// Un mensaje tal y como viaja al cliente y como se guarda en SQLite.
// `type` (no `interface`) para que tenga índice de string implícito y
// satisfaga el genérico de sql.exec<T> (Record<string, SqlStorageValue>).
export type ChatMessage = {
  seq: number;
  author: string;
  body: string;
  ts: number;
};

// Estado que sobrevive a la hibernación, atado a cada conexión (máx 16 KB).
interface Attachment {
  name: string;
  color: string;
}

/**
 * ConversationDO — EL MOTOR. Una instancia por conversación (en toctoc, un 1:1
 * entre dos usuarios). Sabe de mensajes, orden, color de cada participante y
 * fan-out en tiempo real. La identidad/membresía se resuelve fuera (Worker +
 * UserDO); aquí el `author` y el `color` ya llegan validados por el Worker.
 *
 * Realtime vía WebSocket Hibernation API (`acceptWebSocket`, no `ws.accept()`).
 */
export class ConversationDO extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      const sql = this.ctx.storage.sql;
      sql.exec(`
        CREATE TABLE IF NOT EXISTS messages (
          seq    INTEGER PRIMARY KEY AUTOINCREMENT,
          author TEXT    NOT NULL,
          body   TEXT    NOT NULL,
          ts     INTEGER NOT NULL
        );
      `);
      // Color de cada participante, para teñir sus burbujas (también el
      // historial) y mantenerlo en sync entre los dos.
      sql.exec(`
        CREATE TABLE IF NOT EXISTS profiles (
          name  TEXT PRIMARY KEY,
          color TEXT NOT NULL
        );
      `);
    });
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("expected websocket", { status: 426 });
    }

    const url = new URL(request.url);
    // El Worker ya puso aquí el nombre AUTENTICADO y el color del usuario (desde
    // su UserDO), no lo que diga el cliente.
    const name = (url.searchParams.get("name") || "anon").slice(0, 25) || "anon";
    const color = cleanColor(url.searchParams.get("color")) ?? "#a89e8b";

    // El color que inyecta el Worker es autoritativo (viene del UserDO), así que
    // SÍ lo refrescamos en cada conexión: mantiene la conversación al día si el
    // usuario cambió su color desde otra conversación/dispositivo.
    this.ctx.storage.sql.exec(
      `INSERT INTO profiles (name, color) VALUES (?, ?)
       ON CONFLICT(name) DO UPDATE SET color = excluded.color`,
      name,
      color,
    );

    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ name, color } satisfies Attachment);

    server.send(
      JSON.stringify({ type: "history", messages: this.recent(50), profiles: this.profiles() }),
    );

    // Avisa a quien ya esté en la conversación de nuestro color, para que nos
    // pinte bien al instante (sin esperar a que mandemos algo o reconecte).
    this.broadcast(JSON.stringify({ type: "color", name, color }));

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    if (typeof raw !== "string") return;
    let data: { type?: string; body?: unknown; color?: unknown };
    try {
      data = JSON.parse(raw);
    } catch {
      return;
    }

    const att = ws.deserializeAttachment() as Attachment | null;
    const author = att?.name ?? "anon";

    // Cambio de color en vivo: actualiza el perfil y lo difunde para que el otro
    // recoloree las burbujas de esta persona (incluido el historial).
    if (data.type === "color") {
      const color = cleanColor(data.color);
      if (!color) return;
      const cur = this.ctx.storage.sql
        .exec<{ color: string }>("SELECT color FROM profiles WHERE name = ?", author)
        .toArray();
      if (cur.length && cur[0].color === color) return; // no-op
      this.ctx.storage.sql.exec(
        `INSERT INTO profiles (name, color) VALUES (?, ?)
         ON CONFLICT(name) DO UPDATE SET color = excluded.color`,
        author,
        color,
      );
      ws.serializeAttachment({ name: author, color } satisfies Attachment);
      this.broadcast(JSON.stringify({ type: "color", name: author, color }));
      return;
    }

    if (data.type !== "msg" || typeof data.body !== "string") return;
    const body = data.body.trim().slice(0, 1000);
    if (!body) return;
    const ts = Date.now();

    const row = this.ctx.storage.sql
      .exec<{ seq: number }>(
        "INSERT INTO messages (author, body, ts) VALUES (?, ?, ?) RETURNING seq",
        author,
        body,
        ts,
      )
      .one();

    this.broadcast(JSON.stringify({ type: "msg", seq: row.seq, author, body, ts }));
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    try {
      ws.close(code, reason);
    } catch {
      // ya cerrado
    }
  }

  private broadcast(blob: string): void {
    for (const peer of this.ctx.getWebSockets()) {
      try {
        peer.send(blob);
      } catch {
        // peer muerto; el cierre lo limpia
      }
    }
  }

  // Mapa nombre → color para el snapshot inicial.
  private profiles(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const p of this.ctx.storage.sql
      .exec<{ name: string; color: string }>("SELECT name, color FROM profiles")
      .toArray()) {
      out[p.name] = p.color;
    }
    return out;
  }

  private recent(limit: number): ChatMessage[] {
    return this.ctx.storage.sql
      .exec<ChatMessage>(
        "SELECT seq, author, body, ts FROM messages ORDER BY seq DESC LIMIT ?",
        limit,
      )
      .toArray()
      .reverse();
  }
}
