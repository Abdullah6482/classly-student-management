import assert from "node:assert/strict";
import { before, test } from "node:test";
import { webcrypto } from "node:crypto";
import {
  getAdminSession,
  getSessionResponse,
  isSameOrigin,
  login,
  logout,
  requireAdmin,
  withAdmin,
  type AuthConfig,
} from "../lib/auth.ts";

const email = "admin@example.test";
const password = "a-long-test-password";
const config: AuthConfig = {
  adminEmail: email,
  adminPasswordHash: "",
  sessionSecret: "test-session-secret-with-at-least-32-bytes",
};
let cookie = "";

before(async () => {
  const salt = webcrypto.getRandomValues(new Uint8Array(16));
  const key = await webcrypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const hash = new Uint8Array(await webcrypto.subtle.deriveBits({
    name: "PBKDF2",
    hash: "SHA-256",
    salt,
    iterations: 100_000,
  }, key, 256));
  const encode = (value: Uint8Array) => Buffer.from(value).toString("base64url");
  config.adminPasswordHash = `pbkdf2-sha256$100000$${encode(salt)}$${encode(hash)}`;
});

function request(path: string, method = "GET", headers: HeadersInit = {}, body?: string) {
  return new Request(`https://classly.example${path}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body }),
  });
}

function loginRequest(emailValue = email, passwordValue = password) {
  return request("/api/auth/login", "POST", {
    Origin: "https://classly.example",
    "Content-Type": "application/json",
  }, JSON.stringify({ email: emailValue, password: passwordValue }));
}

async function signedCookie(payload: object) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const key = await webcrypto.subtle.importKey("raw", new TextEncoder().encode(config.sessionSecret!), {
    name: "HMAC",
    hash: "SHA-256",
  }, false, ["sign"]);
  const signature = new Uint8Array(await webcrypto.subtle.sign("HMAC", key, new TextEncoder().encode(encoded)));
  return `__Host-classly_session=${encoded}.${Buffer.from(signature).toString("base64url")}`;
}

test("refuses requests when authentication secrets are missing", async () => {
  const response = await requireAdmin(request("/api/students"), {});
  assert.ok(response instanceof Response);
  assert.equal(response.status, 503);
});

test("requires HTTPS outside loopback development", async () => {
  const remoteHttp = await requireAdmin(new Request("http://classly.example/api/students"), config);
  assert.ok(remoteHttp instanceof Response);
  assert.equal(remoteHttp.status, 403);
  const localHttp = await requireAdmin(new Request("http://127.0.0.1/api/students"), config);
  assert.ok(localHttp instanceof Response);
  assert.equal(localHttp.status, 401);
});

test("rejects missing and invalid credentials without creating a session", async () => {
  assert.equal((await login(loginRequest(email, "wrong-password"), config)).status, 401);
  assert.equal((await login(loginRequest("not-admin@example.test"), config)).status, 401);
  assert.equal((await login(loginRequest(), config)).status, 200);
});

test("sets a protected cookie and returns only the configured admin session", async () => {
  const response = await login(loginRequest(), config);
  assert.match(response.headers.get("set-cookie") ?? "", /HttpOnly; SameSite=Strict; Secure/);
  assert.match(response.headers.get("set-cookie") ?? "", /__Host-classly_session=/);
  assert.equal(response.headers.get("cache-control"), "no-store");
  cookie = response.headers.get("set-cookie")!.split(";")[0];
  const session = await getAdminSession(request("/api/students", "GET", { Cookie: cookie }), config);
  assert.deepEqual(session?.role, "admin");
  assert.equal(session?.email, email);
});

test("rejects tampered sessions and untrusted origins", async () => {
  const response = await login(loginRequest(), config);
  const issued = response.headers.get("set-cookie")!.split(";")[0];
  const [name, token] = issued.split("=");
  const tampered = `${name}=${token.slice(0, -1)}x`;
  assert.equal(await getAdminSession(request("/api/students", "GET", { Cookie: tampered }), config), null);
  assert.equal(isSameOrigin(request("/api/students", "POST", { Origin: "https://attacker.example" })), false);
  assert.equal((await login(request("/api/auth/login", "POST", { "Content-Type": "application/json" }, "{}"), config)).status, 403);
});

test("rejects sessions without the administrator role or with an expired lifetime", async () => {
  const now = Math.floor(Date.now() / 1000);
  const nonAdminCookie = await signedCookie({ email, role: "student", exp: now + 60 });
  const expiredCookie = await signedCookie({ email, role: "admin", exp: now - 1 });
  assert.equal(await getAdminSession(request("/api/students", "GET", { Cookie: nonAdminCookie }), config), null);
  assert.equal(await getAdminSession(request("/api/students", "GET", { Cookie: expiredCookie }), config), null);
});

test("returns signed-in status only for an authenticated administrator", async () => {
  assert.deepEqual(await (await getSessionResponse(request("/api/auth/session"), config)).json(), { authenticated: false });
  assert.deepEqual(
    await (await getSessionResponse(request("/api/auth/session", "GET", { Cookie: cookie }), config)).json(),
    { authenticated: true, email, role: "admin" }
  );
});

test("guards all student API methods before invoking their handlers", async () => {
  let calls = 0;
  const handler = withAdmin(async () => {
    calls += 1;
    return Response.json({ ok: true });
  }, () => config);
  for (const method of ["GET", "POST", "PUT", "DELETE"]) {
    const unauthenticated = await handler(request("/api/students", method, {
      ...(method === "GET" ? {} : { Origin: "https://classly.example" }),
    }));
    assert.equal(unauthenticated.status, 401);
  }
  assert.equal(calls, 0);

  const unauthorizedOrigin = await handler(request("/api/students", "POST", {
    Cookie: cookie,
    Origin: "https://attacker.example",
  }));
  assert.equal(unauthorizedOrigin.status, 403);
  assert.equal(calls, 0);

  for (const method of ["GET", "POST", "PUT", "DELETE"]) {
    const authorized = await handler(request("/api/students", method, {
      Cookie: cookie,
      ...(method === "GET" ? {} : { Origin: "https://classly.example" }),
    }));
    assert.equal(authorized.status, 200);
  }
  assert.equal(calls, 4);
});

test("clears the session cookie on same-origin logout and rejects cross-origin logout", () => {
  const response = logout(request("/api/auth/logout", "POST", { Origin: "https://classly.example" }));
  assert.match(response.headers.get("set-cookie") ?? "", /Max-Age=0/);
  assert.equal(logout(request("/api/auth/logout", "POST", { Origin: "https://attacker.example" })).status, 403);
});
