// A stand-in for luke-auth-engine, for the LIVE e2e lane only.
//
// WHY THIS EXISTS RATHER THAN A page.route STUB
//
// The first attempt injected `X-User-Id` into the browser's requests. That cannot work, and the
// reason is a good one: core-engine's CORS allows exactly Authorization, Content-Type, Accept and
// X-Tenant-Id — X-User-Id is deliberately absent, so the preflight strips it and a browser can
// never assert who it is. In deployment the gateway verifies the session token, DISCARDS any
// client-supplied X-User-Id, and injects the verified one server-side. That is a real security
// property, and a test harness that bypassed it would be testing a system nobody ships.
//
// So this reproduces the production topology instead: browser → gateway → engine. It does the two
// things the real gateway does for these routes, and nothing else:
//   1. answers /auth/refresh + /session with a session (the only faked part of this lane)
//   2. proxies everything else to the engine, stripping any inbound X-User-Id and injecting ours
//
// It is NOT a security component and makes no attempt to be one — it asserts an identity rather
// than verifying it. That is exactly why the live lane proves the DATA contract and not the AUTH
// contract; covering authorization needs the real gateway and real WorkOS credentials.
import http from "node:http";

const PORT = Number(process.env.LIVE_GATEWAY_PORT ?? 8099);
const ENGINE = process.env.LIVE_ENGINE ?? "http://localhost:8080";
const TENANT = process.env.LIVE_TENANT ?? "e2e-live-local";
const USER = "e2e-user";

const SESSION = {
  userId: USER,
  provisioned: true,
  operator: false,
  tenantAdmin: true,
  tenant: TENANT,
  tenants: [TENANT],
  tenantNames: { [TENANT]: "E2E Tenant" },
  roles: { tenantAdmin: "read-write" },
  candidateGroups: [],
  capabilities: { FORMS: "read-write", EMAIL: "read-write" },
  can: ["FORMS", "EMAIL"],
};
const USER_VIEW = {
  id: USER,
  email: "e2e@example.com",
  firstName: "E2E",
  lastName: "Runner",
  profilePictureUrl: null,
  emailVerified: true,
};

/** Permissive CORS — this proxy is reachable only from the test's own dev server. */
function cors(req, res) {
  res.setHeader("Access-Control-Allow-Origin", req.headers.origin ?? "*");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    req.headers["access-control-request-headers"] ?? "Authorization,Content-Type,Accept,X-Tenant-Id",
  );
}

const json = (res, body, status = 200) => {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
};

const server = http.createServer(async (req, res) => {
  cors(req, res);
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname === "/auth/refresh") {
    return json(res, { accessToken: "e2e-token", sid: "e2e-sid", user: USER_VIEW, session: SESSION });
  }
  if (url.pathname === "/session" || url.pathname.startsWith("/session")) {
    return json(res, SESSION);
  }

  // Proxy everything else to the engine.
  const body = req.method === "GET" || req.method === "HEAD" ? undefined : await readBody(req);
  const headers = { ...req.headers };
  delete headers.host;
  delete headers["content-length"];
  delete headers["x-user-id"]; // the gateway is the sole identity asserter — never trust the client's
  headers["x-user-id"] = USER;
  if (!headers["x-tenant-id"]) headers["x-tenant-id"] = TENANT;

  try {
    const upstream = await fetch(`${ENGINE}${url.pathname}${url.search}`, {
      method: req.method,
      headers,
      body,
    });
    const buf = Buffer.from(await upstream.arrayBuffer());
    const out = {};
    upstream.headers.forEach((v, k) => {
      // Let our own CORS headers stand rather than the engine's (different allowed origin).
      if (!k.toLowerCase().startsWith("access-control-")) out[k] = v;
    });
    res.writeHead(upstream.status, out);
    res.end(buf);
  } catch (err) {
    json(res, { error: "Bad Gateway", message: String(err) }, 502);
  }
});

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

server.listen(PORT, () => {
  console.log(`live-gateway: :${PORT} → ${ENGINE} (tenant ${TENANT}, user ${USER})`);
});
