const SESSION_TTL_SECONDS = 8 * 60 * 60;
const MIN_PASSWORD_HASH_ITERATIONS = 100_000;
const MAX_PASSWORD_HASH_ITERATIONS = 600_000;
const SESSION_COOKIE = "__Host-classly_session";
const LOCAL_SESSION_COOKIE = "classly_session";
const encoder = new TextEncoder();

export type AuthConfig = {
  adminEmail?: string;
  adminPasswordHash?: string;
  sessionSecret?: string;
};

export type AdminSession = {
  email: string;
  role: "admin";
  exp: number;
};

type PasswordHash = {
  iterations: number;
  salt: Uint8Array;
  hash: Uint8Array;
};

function json(body: unknown, status = 200, headers: HeadersInit = {}) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store", ...Object.fromEntries(new Headers(headers)) },
  });
}

function parsePasswordHash(value: string | undefined): PasswordHash | null {
  if (!value) return null;
  const [algorithm, rawIterations, rawSalt, rawHash, ...extra] = value.split("$");
  const iterations = Number(rawIterations);
  if (
    algorithm !== "pbkdf2-sha256" ||
    extra.length > 0 ||
    !Number.isInteger(iterations) ||
    iterations < MIN_PASSWORD_HASH_ITERATIONS ||
    iterations > MAX_PASSWORD_HASH_ITERATIONS
  ) return null;

  try {
    const salt = decodeBase64Url(rawSalt);
    const hash = decodeBase64Url(rawHash);
    return salt.length === 16 && hash.length === 32 ? { iterations, salt, hash } : null;
  } catch {
    return null;
  }
}

export function isAuthConfigured(config: AuthConfig) {
  return Boolean(
    config.adminEmail &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(config.adminEmail) &&
    config.adminPasswordHash &&
    parsePasswordHash(config.adminPasswordHash) &&
    config.sessionSecret &&
    encoder.encode(config.sessionSecret).length >= 32
  );
}

function decodeBase64Url(value: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("Invalid base64url value.");
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64 + "=".repeat((4 - base64.length % 4) % 4));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function encodeBase64Url(value: Uint8Array) {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

async function sign(value: string, secret: string) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value)));
}

async function verifyPassword(password: string, parsedHash: PasswordHash) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const salt = new Uint8Array(parsedHash.salt.length);
  salt.set(parsedHash.salt);
  const bits = new Uint8Array(await crypto.subtle.deriveBits({
    name: "PBKDF2",
    hash: "SHA-256",
    salt: salt.buffer,
    iterations: parsedHash.iterations,
  }, key, 256));
  let difference = bits.length ^ parsedHash.hash.length;
  for (let index = 0; index < parsedHash.hash.length; index += 1) {
    difference |= bits[index] ^ parsedHash.hash[index];
  }
  return difference === 0;
}

function cookieName(request: Request) {
  return new URL(request.url).protocol === "https:" ? SESSION_COOKIE : LOCAL_SESSION_COOKIE;
}

function secureTransportAllowed(request: Request) {
  const url = new URL(request.url);
  return url.protocol === "https:" || ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
}

function sessionCookie(request: Request, token: string, maxAge: number) {
  const secure = new URL(request.url).protocol === "https:";
  const name = cookieName(request);
  return `${name}=${token}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Strict${secure ? "; Secure" : ""}`;
}

function getCookie(request: Request) {
  const name = cookieName(request);
  const matches = (request.headers.get("Cookie") ?? "")
    .split(";")
    .map((item) => item.trim())
    .filter((item) => item.startsWith(`${name}=`));
  return matches.length === 1 ? matches[0].slice(name.length + 1) : null;
}

export function isSameOrigin(request: Request) {
  const origin = request.headers.get("Origin");
  if (!origin) return false;
  try {
    return new URL(origin).origin === origin && origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

export async function getAdminSession(request: Request, config: AuthConfig): Promise<AdminSession | null> {
  if (!secureTransportAllowed(request) || !isAuthConfigured(config)) return null;
  const token = getCookie(request);
  if (!token) return null;
  const [payload, signature, ...extra] = token.split(".");
  if (!payload || !signature || extra.length > 0) return null;

  try {
    const expected = await sign(payload, config.sessionSecret!);
    const supplied = decodeBase64Url(signature);
    if (expected.length !== supplied.length) return null;
    let difference = 0;
    for (let index = 0; index < expected.length; index += 1) difference |= expected[index] ^ supplied[index];
    if (difference !== 0) return null;

    const session = JSON.parse(new TextDecoder().decode(decodeBase64Url(payload))) as Partial<AdminSession>;
    if (
      session.role !== "admin" ||
      typeof session.email !== "string" ||
      session.email !== config.adminEmail!.trim().toLowerCase() ||
      typeof session.exp !== "number" ||
      session.exp <= Math.floor(Date.now() / 1000)
    ) return null;
    return session as AdminSession;
  } catch {
    return null;
  }
}

export async function getSessionResponse(request: Request, config: AuthConfig) {
  if (!secureTransportAllowed(request)) return json({ error: "HTTPS is required." }, 403);
  if (!isAuthConfigured(config)) return json({ error: "Authentication is not configured." }, 503);
  const session = await getAdminSession(request, config);
  return json(session ? { authenticated: true, email: session.email, role: session.role } : { authenticated: false });
}

export async function login(request: Request, config: AuthConfig) {
  if (!secureTransportAllowed(request)) return json({ error: "HTTPS is required." }, 403);
  if (!isAuthConfigured(config)) return json({ error: "Authentication is not configured." }, 503);
  if (!isSameOrigin(request)) return json({ error: "Request origin is not allowed." }, 403);
  if (request.headers.get("Content-Type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") {
    return json({ error: "Content-Type must be application/json." }, 415);
  }

  let credentials: unknown;
  try {
    const text = await request.text();
    if (text.length > 2048) return json({ error: "Invalid sign-in request." }, 400);
    credentials = JSON.parse(text);
  } catch {
    return json({ error: "Invalid sign-in request." }, 400);
  }
  if (!credentials || typeof credentials !== "object") return json({ error: "Invalid sign-in request." }, 400);
  const body = credentials as Record<string, unknown>;
  if (
    typeof body.email !== "string" ||
    body.email.length > 254 ||
    typeof body.password !== "string" ||
    body.password.length > 1024
  ) return json({ error: "Invalid sign-in request." }, 400);

  const parsedHash = parsePasswordHash(config.adminPasswordHash);
  if (!parsedHash) return json({ error: "Authentication is not configured." }, 503);
  const passwordMatches = await verifyPassword(body.password, parsedHash);
  if (
    !passwordMatches ||
    body.email.trim().toLowerCase() !== config.adminEmail!.trim().toLowerCase()
  ) return json({ error: "Invalid email or password." }, 401);

  const session: AdminSession = {
    email: config.adminEmail!.trim().toLowerCase(),
    role: "admin",
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  };
  const payload = encodeBase64Url(encoder.encode(JSON.stringify(session)));
  const signature = encodeBase64Url(await sign(payload, config.sessionSecret!));
  return json(
    { authenticated: true, email: session.email, role: session.role },
    200,
    { "Set-Cookie": sessionCookie(request, `${payload}.${signature}`, SESSION_TTL_SECONDS) }
  );
}

export function logout(request: Request) {
  if (!isSameOrigin(request)) return json({ error: "Request origin is not allowed." }, 403);
  return json({ authenticated: false }, 200, { "Set-Cookie": sessionCookie(request, "", 0) });
}

export async function requireAdmin(request: Request, config: AuthConfig) {
  if (!secureTransportAllowed(request)) return json({ error: "HTTPS is required." }, 403);
  if (!isAuthConfigured(config)) return json({ error: "Authentication is not configured." }, 503);
  const session = await getAdminSession(request, config);
  if (!session) return json({ error: "Authentication required." }, 401);
  return session;
}

export function withAdmin(
  handler: (request: Request) => Promise<Response>,
  getConfig: () => AuthConfig
) {
  return async (request: Request) => {
    const session = await requireAdmin(request, getConfig());
    if (session instanceof Response) return session;
    if (request.method !== "GET" && !isSameOrigin(request)) {
      return json({ error: "Request origin is not allowed." }, 403);
    }
    return handler(request);
  };
}
