# toctoc

messenger privado: hablar de tú a tú con gente concreta. llamar a la puerta de alguien.

comparte motor con [`rumrum`](https://github.com/meowrhino/rumrum): el realtime es casi el mismo `ConversationDO` (Workers + Durable Object + WebSocket Hibernation + SQLite) — de momento es una copia, no un paquete compartido. lo que añade toctoc encima es la **carcasa de messenger**: identidad (con cookie firmada), lista de chats y conversaciones 1:1.

## arquitectura (v0, todo sobre Durable Objects, sin D1)

```
Worker (src/index.ts)
  POST /api/login          → cookie FIRMADA (HMAC) con tu nombre
  GET  /api/me             → tu nombre + color
  GET  /api/chats          → tu lista de conversaciones
  POST /api/chats {with}   → abre/registra un 1:1
  POST /api/chats/delete   → borra una conversación (para los dos)
  POST /api/color {color}  → tu color (global a tus chats)
  /ws?conversation=<id>    → membresía OK → ConversationDO
  resto                    → ASSETS (public/)

ConversationDO (src/conversation.ts)  ← EL MOTOR (≈ rumrum): mensajes, color,
                                         presencia y avisos de conexión, realtime
UserDO         (src/userdo.ts)        ← un DO por usuario: su lista de chats + color
```

- **1:1**: `conversationId = [a,b].sort().join("~")` → DO determinista por pareja.
- **lista de chats**: en vez de D1, un `UserDO` por persona (mismo stack, cero recursos cloud que crear). Al abrir un chat se registra en la bandeja de los dos.
- **author autenticado**: el Worker valida la membresía y le pasa al DO el nombre de la cookie (ignora lo que diga el cliente).

## correr en local

```bash
npm install
npm run dev
```

prueba el flujo con dos navegadores/perfiles distintos (cada uno con su cookie):
entra como `alice`, abre chat con `bob`; entra como `bob` en otro perfil y verás el chat de alice.

## estado

ya hecho: cookie **firmada con HMAC** (`src/auth.ts`), color por usuario,
**presencia** (en línea + avisos de conexión/desconexión), borrar conversación,
**PWA** instalable (manifest + service worker), links clicables, sonido + badge
de pestaña + notificaciones del sistema (con la pestaña abierta).

## ⚠️ pendiente

- **password de verdad**: hoy reclamar un nombre libre es gratis. La cookie ya
  no se puede falsificar (HMAC), pero no hay contraseña.
- **"escribiendo…"** y read receipts (el motor ya da la base de presencia)
- **grupos** (id uuid + lista de miembros en ConversationDO/UserDO)
- **Web Push** (notificaciones con la app cerrada) y multimedia (R2)
