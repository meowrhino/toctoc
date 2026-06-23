# toctoc

messenger privado: hablar de tú a tú con gente concreta. llamar a la puerta de alguien.

comparte motor con [`rumrum`](https://github.com/meowrhino/rumrum): el realtime es el mismo `ConversationDO` (Workers + Durable Object + WebSocket Hibernation + SQLite). lo que añade toctoc encima es la **carcasa de messenger**: identidad, lista de chats y conversaciones 1:1.

## arquitectura (v0, todo sobre Durable Objects, sin D1)

```
Worker (src/index.ts)
  POST /api/login         → cookie con tu nombre
  GET  /api/chats         → tu lista de conversaciones
  POST /api/chats {with}  → abre/registra un 1:1
  /ws?conversation=<id>   → membresía OK → ConversationDO
  resto                   → ASSETS (public/)

ConversationDO (src/conversation.ts)  ← EL MOTOR (igual que rumrum): mensajes + realtime
UserDO         (src/userdo.ts)        ← un DO por usuario: su lista de chats
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

## ⚠️ pendiente antes de usarlo en serio

- **firmar la cookie de identidad** (HMAC + secret, como twoitter). Ahora va SIN firmar: cualquiera puede reclamar cualquier nombre. Ver `src/auth.ts`. Luego, password real.
- presencia / "escribiendo…" / read receipts (el motor ya da la base)
- **grupos** (id uuid + lista de miembros en ConversationDO/UserDO)
- notificaciones (Web Push) + PWA, multimedia (R2, portado de twoitter)
