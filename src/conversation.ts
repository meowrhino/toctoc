import { DurableObject } from "cloudflare:workers";
import type { Env } from "./index";
import { cleanColor, defaultColor } from "./color";

// Un mensaje tal y como viaja al cliente y como se guarda en SQLite.
// `kind`: 'user' (lo escribe alguien) | 'system' (la sala: conexiones/salidas).
export type ChatMessage = {
  seq: number;
  author: string;
  body: string;
  ts: number;
  kind: string;
};

// Estado que sobrevive a la hibernación, atado a cada conexión (máx 16 KB).
interface Attachment {
  name: string;
  color: string;
  ip: string;
}

// "se ha conectado" como mucho una vez por persona cada ventana (evita spam de
// refresco/reconexión). "se ha desconectado" con gracia (absorbe caídas breves
// de red: el cliente reconecta solo en ~1s).
const JOIN_WINDOW_MS = 5 * 60 * 1000;
const LEAVE_GRACE_MS = 12 * 1000;

// Tope de mensajes por conversación (ring buffer). Generoso —un 1:1 jamás lo
// alcanza en uso normal— pero acota el peor caso de storage/coste.
const MAX_MESSAGES = 20000;

// Rate-limit por IP (token bucket): ráfaga de hasta RL_BURST, +RL_REFILL_PER_SEC/s.
const RL_BURST = 12;
const RL_REFILL_PER_SEC = 1;

/**
 * ConversationDO — EL MOTOR (1:1 en toctoc). Sabe de mensajes, orden, color de
 * cada participante, presencia (quién está conectado) y fan-out en tiempo real.
 * La identidad/membresía se resuelve fuera (Worker + UserDO); aquí el `author` y
 * el `color` ya llegan validados/autenticados por el Worker.
 *
 * Realtime vía WebSocket Hibernation API (`acceptWebSocket`, no `ws.accept()`).
 */
export class ConversationDO extends DurableObject<Env> {
  // Token bucket por IP, en memoria (se reinicia con la hibernación; basta para
  // frenar una ráfaga, que de todos modos mantiene el DO despierto).
  private buckets = new Map<string, { tokens: number; last: number }>();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      const sql = this.ctx.storage.sql;
      sql.exec(`
        CREATE TABLE IF NOT EXISTS messages (
          seq    INTEGER PRIMARY KEY AUTOINCREMENT,
          author TEXT    NOT NULL,
          body   TEXT    NOT NULL,
          ts     INTEGER NOT NULL,
          kind   TEXT    NOT NULL DEFAULT 'user'
        );
      `);
      // Migración para conversaciones creadas sin la columna `kind`.
      try {
        sql.exec("ALTER TABLE messages ADD COLUMN kind TEXT NOT NULL DEFAULT 'user'");
      } catch {
        // ya existe
      }
      sql.exec(`
        CREATE TABLE IF NOT EXISTS profiles (
          name       TEXT    PRIMARY KEY,
          color      TEXT    NOT NULL,
          lastJoinTs INTEGER NOT NULL DEFAULT 0
        );
      `);
      // Migración para profiles creado sin `lastJoinTs`.
      try {
        sql.exec("ALTER TABLE profiles ADD COLUMN lastJoinTs INTEGER NOT NULL DEFAULT 0");
      } catch {
        // ya existe
      }
      // Salidas pendientes de anunciar (con gracia): name → cuándo toca avisar.
      sql.exec(`
        CREATE TABLE IF NOT EXISTS pending_leave (
          name    TEXT    PRIMARY KEY,
          leaveAt INTEGER NOT NULL
        );
      `);
    });
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("expected websocket", { status: 426 });
    }

    const url = new URL(request.url);
    // El Worker ya puso aquí el nombre AUTENTICADO y el color del usuario.
    const name = (url.searchParams.get("name") || "anon").slice(0, 25) || "anon";
    const color = cleanColor(url.searchParams.get("color")) ?? defaultColor(name);
    const ip = request.headers.get("CF-Connecting-IP") || "local";

    // El color del Worker es autoritativo (viene del UserDO) → lo refrescamos
    // siempre; `lastJoinTs` solo avanza cuando anunciamos la conexión.
    const announce = this.touchProfile(name, color);
    // Si vuelve antes de expirar la gracia, cancela su "se ha desconectado".
    this.ctx.storage.sql.exec("DELETE FROM pending_leave WHERE name = ?", name);

    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ name, color, ip } satisfies Attachment);

    server.send(
      JSON.stringify({
        type: "history",
        messages: this.recent(50),
        profiles: this.profiles(),
        online: this.onlineNames(),
      }),
    );

    if (announce) this.system(name, "se ha conectado");
    // Avisa del color del que entra para que el otro lo pinte al instante.
    this.broadcast(JSON.stringify({ type: "color", name, color }));
    this.broadcastPresence();

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
    const ip = att?.ip ?? "local";

    // Rate-limit por IP: descarta en silencio el exceso (mensajes y colores).
    if (!this.allow(ip)) return;

    // Cambio de color en vivo: persiste y difunde (con dedupe del no-op).
    if (data.type === "color") {
      const color = cleanColor(data.color);
      if (!color) return;
      const cur = this.ctx.storage.sql
        .exec<{ color: string }>("SELECT color FROM profiles WHERE name = ?", author)
        .toArray();
      if (cur.length && cur[0].color === color) return;
      this.ctx.storage.sql.exec(
        `INSERT INTO profiles (name, color, lastJoinTs) VALUES (?, ?, 0)
         ON CONFLICT(name) DO UPDATE SET color = excluded.color`,
        author,
        color,
      );
      ws.serializeAttachment({ name: author, color, ip } satisfies Attachment);
      this.broadcast(JSON.stringify({ type: "color", name: author, color }));
      return;
    }

    if (data.type !== "msg" || typeof data.body !== "string") return;
    const body = data.body.trim().slice(0, 1000);
    if (!body) return;
    this.append(author, body, "user");
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    try {
      ws.close(code, reason);
    } catch {
      // ya cerrado
    }
    const att = ws.deserializeAttachment() as Attachment | null;
    const name = att?.name;
    if (name && !this.hasOtherSocket(ws, name)) {
      const leaveAt = Date.now() + LEAVE_GRACE_MS;
      this.ctx.storage.sql.exec(
        "INSERT INTO pending_leave (name, leaveAt) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET leaveAt = excluded.leaveAt",
        name,
        leaveAt,
      );
      await this.scheduleAlarm(leaveAt);
    }
    this.broadcastPresence(ws);
  }

  // Vence la gracia: anuncia a quien siga sin conexión y reprograma si quedan.
  async alarm(): Promise<void> {
    const now = Date.now();
    const due = this.ctx.storage.sql
      .exec<{ name: string }>("SELECT name FROM pending_leave WHERE leaveAt <= ?", now)
      .toArray();
    for (const { name } of due) {
      this.ctx.storage.sql.exec("DELETE FROM pending_leave WHERE name = ?", name);
      if (!this.onlineNames().includes(name)) this.system(name, "se ha desconectado");
    }
    const next = this.ctx.storage.sql
      .exec<{ m: number | null }>("SELECT MIN(leaveAt) AS m FROM pending_leave")
      .toArray();
    if (next[0]?.m) await this.ctx.storage.setAlarm(next[0].m);
  }

  // Borra la conversación entera (mensajes + colores) y avisa a los conectados
  // para que vacíen su vista. Lo llama el Worker por RPC tras comprobar
  // membresía del 1:1.
  clear(): void {
    this.ctx.storage.sql.exec("DELETE FROM messages");
    this.ctx.storage.sql.exec("DELETE FROM profiles");
    this.ctx.storage.sql.exec("DELETE FROM pending_leave");
    this.broadcast(JSON.stringify({ type: "cleared" }));
  }

  // --- helpers -------------------------------------------------------------

  // Registra la conexión y decide si anunciarla (fuera de la ventana). El color
  // SÍ se refresca siempre (lo manda autenticado el Worker desde el UserDO).
  private touchProfile(name: string, color: string): boolean {
    const now = Date.now();
    const prev = this.ctx.storage.sql
      .exec<{ lastJoinTs: number }>("SELECT lastJoinTs FROM profiles WHERE name = ?", name)
      .toArray();
    const announce = prev.length === 0 || now - prev[0].lastJoinTs > JOIN_WINDOW_MS;
    this.ctx.storage.sql.exec(
      `INSERT INTO profiles (name, color, lastJoinTs) VALUES (?, ?, ?)
       ON CONFLICT(name) DO UPDATE SET
         color = excluded.color,
         lastJoinTs = CASE WHEN ? = 1 THEN excluded.lastJoinTs ELSE profiles.lastJoinTs END`,
      name,
      color,
      announce ? now : 0,
      announce ? 1 : 0,
    );
    return announce;
  }

  private append(author: string, body: string, kind: "user" | "system"): void {
    const ts = Date.now();
    const row = this.ctx.storage.sql
      .exec<{ seq: number }>(
        "INSERT INTO messages (author, body, ts, kind) VALUES (?, ?, ?, ?) RETURNING seq",
        author,
        body,
        ts,
        kind,
      )
      .one();
    // Ring buffer: conservamos solo los últimos MAX_MESSAGES (no-op mientras la
    // conversación sea más corta que el tope).
    this.ctx.storage.sql.exec("DELETE FROM messages WHERE seq <= ?", row.seq - MAX_MESSAGES);
    this.broadcast(JSON.stringify({ type: "msg", seq: row.seq, author, body, ts, kind }));
  }

  // Token bucket por IP: true si la acción cabe en el presupuesto.
  private allow(ip: string): boolean {
    const now = Date.now();
    let b = this.buckets.get(ip);
    if (!b) {
      b = { tokens: RL_BURST, last: now };
      this.buckets.set(ip, b);
    }
    b.tokens = Math.min(RL_BURST, b.tokens + ((now - b.last) / 1000) * RL_REFILL_PER_SEC);
    b.last = now;
    if (b.tokens < 1) return false;
    b.tokens -= 1;
    return true;
  }

  private system(author: string, body: string): void {
    this.append(author, body, "system");
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

  private broadcastPresence(exclude?: WebSocket): void {
    this.broadcast(JSON.stringify({ type: "presence", online: this.onlineNames(exclude) }));
  }

  private onlineNames(exclude?: WebSocket): string[] {
    const set = new Set<string>();
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === exclude) continue;
      const att = ws.deserializeAttachment() as Attachment | null;
      if (att?.name) set.add(att.name);
    }
    return [...set];
  }

  private hasOtherSocket(self: WebSocket, name: string): boolean {
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === self) continue;
      const att = ws.deserializeAttachment() as Attachment | null;
      if (att?.name === name) return true;
    }
    return false;
  }

  private async scheduleAlarm(t: number): Promise<void> {
    const cur = await this.ctx.storage.getAlarm();
    if (cur === null || t < cur) await this.ctx.storage.setAlarm(t);
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
        "SELECT seq, author, body, ts, kind FROM messages ORDER BY seq DESC LIMIT ?",
        limit,
      )
      .toArray()
      .reverse();
  }
}
