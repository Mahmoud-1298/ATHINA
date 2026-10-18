import assert from "node:assert/strict";
import test from "node:test";
import { createAuthMiddleware } from "./requireAuth.js";

const createResponse = () => ({
  statusCode: 200,
  body: null,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(body) {
    this.body = body;
    return this;
  },
});

test("rejects requests without bearer credentials", async () => {
  const middleware = createAuthMiddleware(async () => ({ id: "user-1" }));
  const response = createResponse();
  let continued = false;

  await middleware({ get: () => "" }, response, () => { continued = true; });

  assert.equal(response.statusCode, 401);
  assert.equal(continued, false);
});

test("rejects tokens that do not resolve to a user", async () => {
  const middleware = createAuthMiddleware(async () => null);
  const response = createResponse();
  let continued = false;

  await middleware({ get: () => "Bearer invalid" }, response, () => { continued = true; });

  assert.equal(response.statusCode, 401);
  assert.equal(continued, false);
});

test("sets verified identity and overwrites a client-supplied user ID", async () => {
  const middleware = createAuthMiddleware(async (token) => (
    token === "valid" ? { id: "verified-user" } : null
  ));
  const response = createResponse();
  const request = {
    body: { userId: "attacker-selected-user" },
    get: () => "Bearer valid",
  };
  let continued = false;

  await middleware(request, response, () => { continued = true; });

  assert.equal(continued, true);
  assert.equal(request.auth.user.id, "verified-user");
  assert.equal(request.body.userId, "verified-user");
});
