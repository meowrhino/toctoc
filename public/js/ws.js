// WebSocket de una conversación, con reconexión automática. El nombre y el color
// NO viajan por la URL: el servidor los saca de la sesión autenticada (cookie +
// UserDO). Protocolo: {type:"history"|"msg"|"color"}.
//   history → { messages, profiles }   (snapshot inicial: mensajes + colores)
//   msg     → un mensaje
//   color   → { name, color }          (alguien cambió su color)

export function connectConversation({ conversationId, onHistory, onMessage, onColor, onCleared, onPresence }) {
  let ws;
  let closed = false;
  const proto = location.protocol === "https:" ? "wss" : "ws";
  const url = `${proto}://${location.host}/ws?conversation=${encodeURIComponent(conversationId)}`;

  function open() {
    ws = new WebSocket(url);
    ws.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.type === "history") onHistory(data.messages, data.profiles || {}, data.online || []);
      else if (data.type === "msg") onMessage(data);
      else if (data.type === "color") onColor(data);
      else if (data.type === "cleared") onCleared?.();
      else if (data.type === "presence") onPresence?.(data.online || []);
    };
    ws.onclose = () => {
      if (!closed) setTimeout(open, 1000);
    };
  }
  open();

  return {
    send(body) {
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "msg", body }));
      }
    },
    setColor(color) {
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "color", color }));
      }
    },
    close() {
      closed = true;
      try {
        ws?.close();
      } catch {
        /* ya cerrado */
      }
    },
  };
}
