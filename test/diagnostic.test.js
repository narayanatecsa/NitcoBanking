const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const net = require("node:net");
const path = require("node:path");
const { after, before, test } = require("node:test");

const projectDirectory = path.resolve(__dirname, "..");
const diagnosticToken = "test-only-diagnostic-token";
let child;
let port;
let output = "";

async function findAvailablePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port: availablePort } = server.address();
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  return availablePort;
}

async function waitForServer() {
  const endpoint =
    `http://127.0.0.1:${port}/webhook?hub.mode=subscribe` +
    "&hub.verify_token=test-verify-token&hub.challenge=ready";
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(`Server exited early: ${output}`);
    }
    try {
      const response = await fetch(endpoint);
      if (response.status === 200 && (await response.text()) === "ready") {
        return;
      }
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new Error(`Server did not start: ${output}`);
}

before(async () => {
  port = await findAvailablePort();
  const env = { ...process.env };
  [
    "DB_HOST",
    "DB_PORT",
    "DB_DATABASE",
    "DB_USERNAME",
    "DB_PASSWORD",
    "DB_CA_PATH",
    "DB_CA",
  ].forEach((name) => delete env[name]);
  Object.assign(env, {
    PORT: String(port),
    MYTOKEN: "test-verify-token",
    TOKEN: "test-whatsapp-token",
    WHATSAPP_PHONE_ID: "test-phone-id",
    MYSQL_DIAGNOSTIC_TOKEN: diagnosticToken,
    WACRM_WEBHOOK_URL: "http://127.0.0.1:1/webhook",
  });
  child = spawn(process.execPath, ["index.js"], {
    cwd: projectDirectory,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (data) => {
    output += data;
  });
  child.stderr.on("data", (data) => {
    output += data;
  });
  await waitForServer();
});

after(async () => {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  await new Promise((resolve) => child.once("exit", resolve));
});

test("webhook verification succeeds only with the configured token", async () => {
  const baseUrl = `http://127.0.0.1:${port}`;
  const valid = await fetch(
    `${baseUrl}/webhook?hub.mode=subscribe` +
      "&hub.verify_token=test-verify-token&hub.challenge=challenge"
  );
  assert.equal(valid.status, 200);
  assert.equal(await valid.text(), "challenge");

  const invalid = await fetch(
    `${baseUrl}/webhook?hub.mode=subscribe` +
      "&hub.verify_token=wrong&hub.challenge=challenge"
  );
  assert.equal(invalid.status, 403);
});

test("MySQL diagnostic hides itself from unauthorized callers", async () => {
  const response = await fetch(
    `http://127.0.0.1:${port}/internal/mysql-diagnostic`,
    { method: "POST" }
  );
  assert.equal(response.status, 404);
  assert.equal(await response.text(), "Not Found");
});

test("authorized MySQL diagnostic reports safe unavailable status", async () => {
  const response = await fetch(
    `http://127.0.0.1:${port}/internal/mysql-diagnostic`,
    {
      method: "POST",
      headers: { authorization: `Bearer ${diagnosticToken}` },
    }
  );
  assert.equal(response.status, 503);
  const body = await response.json();
  assert.deepEqual(Object.keys(body).sort(), ["correlationId", "status"]);
  assert.equal(body.status, "unavailable");
  assert.match(body.correlationId, /^[0-9a-f-]{36}$/);
  assert.doesNotMatch(JSON.stringify(body), /password|credential|employee|sql|error/i);
});

test("WACRM forwarding failure does not fail the primary webhook", async () => {
  const response = await fetch(`http://127.0.0.1:${port}/webhook`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ object: "whatsapp_business_account", entry: [] }),
  });
  assert.equal(response.status, 200);

  await new Promise((resolve) => setTimeout(resolve, 150));
  assert.match(output, /wacrm_forward_failed/);
  assert.doesNotMatch(output, /UnhandledPromiseRejection/);
  assert.doesNotMatch(output, /test-whatsapp-token|test-only-diagnostic-token/);
  assert.notEqual(child.exitCode, 0);
});
