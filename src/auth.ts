// Identidad de toctoc: una cookie con el nombre FIRMADA con HMAC-SHA256.
//
// La cookie vale `<nombre>.<firma>` donde firma = HMAC(nombre, AUTH_SECRET) en
// base64url. Sin el secret no se puede falsificar, así que ya no vale editar la
// cookie a mano para reclamar otro nombre (el agujero del v0). Sigue sin haber
// contraseña: reclamar un nombre libre es gratis, pero una vez tienes la cookie
// firmada, nadie puede suplantarte sin el secret del servidor.
//
// AUTH_SECRET se inyecta como secret del Worker (`wrangler secret put`), y en
// local desde .dev.vars (ignorado por git).

const COOKIE = "toctoc_user";

// HMAC-SHA256(msg) → base64url. Cacheamos la CryptoKey por secret para no
// reimportarla en cada petición.
let cachedKey: { secret: string; key: CryptoKey } | null = null;
async function keyFor(secret: string): Promise<CryptoKey> {
  if (cachedKey?.secret === secret) return cachedKey.key;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  cachedKey = { secret, key };
  return key;
}

function b64url(bytes: ArrayBuffer): string {
  let bin = "";
  for (const b of new Uint8Array(bytes)) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sign(name: string, secret: string): Promise<string> {
  const sig = await crypto.subtle.sign("HMAC", await keyFor(secret), new TextEncoder().encode(name));
  return b64url(sig);
}

// Comparación en tiempo constante para no filtrar la firma por timing.
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

// Devuelve el nombre autenticado, o null si no hay cookie / la firma no cuadra
// / falta el secret (fail-safe: sin secret, nadie está autenticado).
export async function getUser(request: Request, secret: string | undefined): Promise<string | null> {
  if (!secret) return null;
  const cookie = request.headers.get("Cookie") || "";
  const m = cookie.match(/(?:^|;\s*)toctoc_user=([^;]+)/);
  if (!m) return null;

  const raw = decodeURIComponent(m[1]);
  const dot = raw.lastIndexOf("."); // la firma es base64url, no lleva puntos
  if (dot <= 0) return null;
  const name = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);
  if (!name) return null;
  // "~" es el separador del conversationId; un nombre con "~" (de una cookie
  // emitida antes del filtro de /api/login) daría ids ambiguos → no autenticar.
  if (name.includes("~")) return null;

  const expected = await sign(name, secret);
  if (!safeEqual(sig, expected)) return null;
  return name.slice(0, 25);
}

export async function setUserCookie(name: string, secret: string): Promise<string> {
  const value = encodeURIComponent(`${name}.${await sign(name, secret)}`);
  return `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000`;
}
