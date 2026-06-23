import { DurableObject } from "cloudflare:workers";
import type { Env } from "./index";

// La lista de chats de UN usuario. `type` por el genérico de sql.exec.
export type ChatEntry = {
  conversationId: string;
  other: string;
  createdAt: number;
};

/**
 * UserDO — una instancia por usuario (idFromName(username)). Guarda la lista
 * de conversaciones de esa persona, para que vea sus chats al volver y entre
 * dispositivos. Es el "directorio" minimal de toctoc: en vez de D1, un DO por
 * usuario (mismo stack DO+SQLite, cero recursos cloud que crear).
 *
 * Métodos expuestos por RPC: el Worker llama stub.addChat(...) / stub.listChats().
 */
export class UserDO extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS chats (
          conversationId TEXT    PRIMARY KEY,
          other          TEXT    NOT NULL,
          createdAt      INTEGER NOT NULL
        );
      `);
      // Pares clave/valor del perfil del usuario (de momento: su color).
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL);
      `);
    });
  }

  // Color elegido por el usuario (global a todas sus conversaciones), o null.
  getColor(): string | null {
    const rows = this.ctx.storage.sql
      .exec<{ v: string }>("SELECT v FROM meta WHERE k = 'color'")
      .toArray();
    return rows.length ? rows[0].v : null;
  }

  setColor(color: string): void {
    this.ctx.storage.sql.exec(
      "INSERT INTO meta (k, v) VALUES ('color', ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v",
      color,
    );
  }

  // Idempotente: abrir el mismo chat dos veces no lo duplica.
  addChat(conversationId: string, other: string): void {
    this.ctx.storage.sql.exec(
      "INSERT OR IGNORE INTO chats (conversationId, other, createdAt) VALUES (?, ?, ?)",
      conversationId,
      other,
      Date.now(),
    );
  }

  listChats(): ChatEntry[] {
    return this.ctx.storage.sql
      .exec<ChatEntry>(
        "SELECT conversationId, other, createdAt FROM chats ORDER BY createdAt DESC",
      )
      .toArray();
  }

  // Quita un chat de la bandeja de este usuario (al borrar la conversación).
  removeChat(conversationId: string): void {
    this.ctx.storage.sql.exec("DELETE FROM chats WHERE conversationId = ?", conversationId);
  }
}
