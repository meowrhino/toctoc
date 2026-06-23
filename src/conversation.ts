import { DurableObject } from "cloudflare:workers";
import type { Env } from "./index";

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
}

/**
 * ConversationDO — EL MOTOR (idéntico al de rumrum). Una instancia por
 * conversación: en toctoc, un 1:1 entre dos usuarios. Solo sabe de mensajes,
 * orden y fan-out en tiempo real. La identidad/membresía se resuelve fuera
 * (Worker + UserDO); aquí el `author` ya llega validado por el Worker.
 *
 * Realtime vía WebSocket Hibernation API (`acceptWebSocket`, no `ws.accept()`).
 */
export class ConversationDO extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS messages (
          seq    INTEGER PRIMARY KEY AUTOINCREMENT,
          author TEXT    NOT NULL,
          body   TEXT    NOT NULL,
          ts     INTEGER NOT NULL
        );
      `);
    });
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("expected websocket", { status: 426 });
    }

    const url = new URL(request.url);
    // El Worker ya puso aquí el nombre AUTENTICADO (no el que diga el cliente).
    const name = (url.searchParams.get("name") || "anon").slice(0, 25) || "anon";

    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ name } satisfies Attachment);

    server.send(JSON.stringify({ type: "history", messages: this.recent(50) }));

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    if (typeof raw !== "string") return;
    let data: { type?: string; body?: unknown };
    try {
      data = JSON.parse(raw);
    } catch {
      return;
    }
    if (data.type !== "msg" || typeof data.body !== "string") return;

    const body = data.body.trim().slice(0, 1000);
    if (!body) return;

    const att = ws.deserializeAttachment() as Attachment | null;
    const author = att?.name ?? "anon";
    const ts = Date.now();

    const row = this.ctx.storage.sql
      .exec<{ seq: number }>(
        "INSERT INTO messages (author, body, ts) VALUES (?, ?, ?) RETURNING seq",
        author,
        body,
        ts,
      )
      .one();

    const msg: ChatMessage = { seq: row.seq, author, body, ts };
    const blob = JSON.stringify({ type: "msg", ...msg });

    for (const peer of this.ctx.getWebSockets()) {
      try {
        peer.send(blob);
      } catch {
        // peer muerto; el cierre lo limpia.
      }
    }
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    try {
      ws.close(code, reason);
    } catch {
      // ya cerrado
    }
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
