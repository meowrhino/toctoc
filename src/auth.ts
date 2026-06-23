// Identidad MINIMAL para v0: una cookie con el nombre, SIN FIRMAR.
//
// ⚠️ SEGURIDAD (TODO fase 2): la cookie no está firmada, así que cualquiera
// podría reclamar cualquier nombre editándola. Suficiente para v0 local / probar
// el flujo, pero ANTES de exponerlo a gente real hay que firmarla con HMAC
// (Web Crypto + un secret AUTH_SECRET), exactamente como hace twoitter. Y más
// adelante, password de verdad.

const COOKIE = "toctoc_user";

export function getUser(request: Request): string | null {
  const cookie = request.headers.get("Cookie") || "";
  const m = cookie.match(/(?:^|;\s*)toctoc_user=([^;]+)/);
  if (!m) return null;
  const name = decodeURIComponent(m[1]).trim().slice(0, 25);
  return name || null;
}

export function setUserCookie(name: string): string {
  return `${COOKIE}=${encodeURIComponent(name)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000`;
}
