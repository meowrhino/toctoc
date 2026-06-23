// WebSocket de una conversación, con reconexión automática. El nombre NO viaja
// por la URL: el servidor lo saca de la cookie autenticada. El protocolo (JSON
// con {type:"history"|"msg"}) lo define el motor compartido (ConversationDO).

export function connectConversation({ conversationId, onHistory, onMessage }) {
  let ws;
  let closed = false;
  const proto = location.protocol === "https:" ? "wss" : "ws";
  const url = `${proto}://${location.host}/ws?conversation=${encodeURIComponent(conversationId)}`;

  function open() {
    ws = new WebSocket(url);
    ws.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.type === "history") onHistory(data.messages);
      else if (data.type === "msg") onMessage(data);
    };
    // El DO hiberna o la red cae → el socket se cierra; reabrimos solos, salvo
    // que hayamos cerrado a propósito al cambiar de chat.
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
    // Al abrir otra conversación cerramos ésta y evitamos que reconecte.
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
