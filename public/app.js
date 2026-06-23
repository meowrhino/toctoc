// toctoc — cliente minimal. Login por nombre → lista de chats → conversación
// 1:1 en tiempo real (mismo motor que rumrum).

const $ = (s) => document.querySelector(s);
const api = (path, opts) => fetch(path, { credentials: "same-origin", ...opts });

let me = null;
let ws = null;
let activeConv = null;

// ---------- arranque: ¿hay sesión? ----------
init();
async function init() {
  const { name } = await api("/api/me").then((r) => r.json());
  if (name) enterApp(name);
  else showLogin();
}

function showLogin() {
  $("#login").classList.remove("hidden");
  $("#app").classList.add("hidden");
}

$("#loginBtn").addEventListener("click", login);
$("#loginName").addEventListener("keydown", (e) => { if (e.key === "Enter") login(); });
async function login() {
  const name = $("#loginName").value.trim();
  if (!name) return;
  const res = await api("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  }).then((r) => r.json());
  if (res.name) enterApp(res.name);
}

function enterApp(name) {
  me = name;
  $("#whoami").textContent = "tú: " + me;
  $("#login").classList.add("hidden");
  $("#app").classList.remove("hidden");
  loadChats();
}

// ---------- lista de chats ----------
async function loadChats() {
  const { chats } = await api("/api/chats").then((r) => r.json());
  const ul = $("#chatlist");
  ul.innerHTML = "";
  chats.forEach((c) => {
    const li = document.createElement("li");
    li.textContent = c.other;
    li.dataset.conv = c.conversationId;
    li.dataset.other = c.other;
    li.addEventListener("click", () => openConversation(c.conversationId, c.other, li));
    ul.appendChild(li);
  });
}

$("#newchat").addEventListener("submit", async (e) => {
  e.preventDefault();
  const other = $("#newchatName").value.trim();
  if (!other) return;
  const res = await api("/api/chats", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ with: other }),
  }).then((r) => r.json());
  $("#newchatName").value = "";
  if (res.conversationId) {
    await loadChats();
    const li = [...$("#chatlist").children].find((x) => x.dataset.conv === res.conversationId);
    openConversation(res.conversationId, res.other, li);
  }
});

// ---------- conversación ----------
function openConversation(conv, other, li) {
  if (activeConv === conv) return;
  activeConv = conv;

  [...$("#chatlist").children].forEach((x) => x.classList.toggle("active", x === li));
  $("#empty").classList.add("hidden");
  $("#convhead").classList.remove("hidden");
  $("#messages").classList.remove("hidden");
  $("#composer").classList.remove("hidden");
  $("#convhead").textContent = "con " + other;
  $("#messages").innerHTML = "";

  if (ws) { ws.onclose = null; ws.close(); }
  connect(conv);
}

function connect(conv) {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  ws = new WebSocket(`${proto}://${location.host}/ws?conversation=${encodeURIComponent(conv)}`);
  ws.onmessage = (e) => {
    const data = JSON.parse(e.data);
    if (data.type === "history") {
      $("#messages").innerHTML = "";
      data.messages.forEach(addMessage);
    } else if (data.type === "msg") {
      addMessage(data);
    }
    $("#messages").scrollTop = $("#messages").scrollHeight;
  };
  // reconexión solo si seguimos en esta conversación
  ws.onclose = () => { if (activeConv === conv) setTimeout(() => connect(conv), 1000); };
}

function addMessage(m) {
  const li = document.createElement("li");
  const who = document.createElement("b");
  who.textContent = m.author;
  li.appendChild(who);
  li.appendChild(document.createTextNode(m.body));
  $("#messages").appendChild(li);
}

$("#composer").addEventListener("submit", (e) => {
  e.preventDefault();
  const body = $("#body").value.trim();
  if (!body || !ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ type: "msg", body }));
  $("#body").value = "";
});
