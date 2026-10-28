/**
 * Integration smoke test for the MCP server (build/index.js).
 *
 * Launches the built server over stdio with GEMINI_MODEL deliberately unset
 * (exercising the built-in default), verifies the tool registration, and makes
 * ONE live search-grounded call. Requires Google Application Default
 * Credentials (gcloud auth application-default login) and network access.
 *
 * Run: npm run test:integration
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const serverPath = resolve(__dirname, "..", "build", "index.js");

// Integration test needs credentials and a project; skip cleanly when absent.
if (!(process.env.INTEGRATION_GCP_PROJECT_ID || process.env.GCP_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT)) {
  console.log("SKIP: no GCP_PROJECT_ID / GOOGLE_CLOUD_PROJECT / INTEGRATION_GCP_PROJECT_ID set — provide them (with ADC) to run this test.");
  process.exit(0);
}

const EXPECTED_TOOLS = new Set([
  "ask_gemini_agent",
  "gemini_web_search",
  "gemini_url_context",
  "gemini_code_execution",
]);

const childEnv = { ...process.env };
// Exercise the built-in default model unless the caller explicitly overrides.
delete childEnv.GEMINI_MODEL;
if (process.env.INTEGRATION_GEMINI_MODEL) {
  childEnv.GEMINI_MODEL = process.env.INTEGRATION_GEMINI_MODEL;
}
if (process.env.INTEGRATION_GCP_PROJECT_ID) {
  childEnv.GCP_PROJECT_ID = process.env.INTEGRATION_GCP_PROJECT_ID;
}

const child = spawn(process.execPath, [serverPath], {
  env: childEnv,
  stdio: ["pipe", "pipe", "inherit"],
});

// Fail fast if the server exits before it can answer (e.g. bad credentials),
// instead of waiting out every pending timeout.
child.on("exit", (code) => {
  if (pending.size > 0) {
    fail(`server exited prematurely with code ${code}`);
  }
});

/** jsonrpc message id -> resolver map. */
const pending = new Map();

function awaitResponse(id, timeoutMs) {
  return new Promise((resolvePromise, rejectPromise) => {
    const entry = { timer: null };
    entry.timer = setTimeout(() => {
      pending.delete(id);
      rejectPromise(new Error(`Timeout waiting for response id ${id}`));
    }, timeoutMs);
    pending.set(id, entry);
    entry.resolve = (msg) => {
      clearTimeout(entry.timer);
      pending.delete(id);
      resolvePromise(msg);
    };
  });
}

let buffer = "";
child.stdout.on("data", (chunk) => {
  buffer += chunk;
  let newlineIdx;
  while ((newlineIdx = buffer.indexOf("\n")) >= 0) {
    const line = buffer.slice(0, newlineIdx).trim();
    buffer = buffer.slice(newlineIdx + 1);
    if (!line) continue;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      continue;
    }
    const entry = msg.id === undefined || msg.id === null ? undefined : pending.get(msg.id);
    if (entry) entry.resolve(msg);
  }
});

function send(message) {
  child.stdin.write(JSON.stringify(message) + "\n");
}

function fail(message) {
  child.kill("SIGTERM");
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

try {
  send({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "integration-test", version: "0.0.0" },
    },
  });
  const initialized = await awaitResponse(1, 15000);
  if (initialized.error) {
    fail(`initialize error: ${JSON.stringify(initialized.error)}`);
  }
  send({ jsonrpc: "2.0", method: "notifications/initialized" });

  send({ jsonrpc: "2.0", id: 2, method: "tools/list" });
  const toolList = await awaitResponse(2, 15000);
  if (toolList.error) {
    fail(`tools/list error: ${JSON.stringify(toolList.error)}`);
  }
  const toolNames = toolList.result.tools.map((tool) => tool.name);
  const missing = [...EXPECTED_TOOLS].filter((name) => !toolNames.includes(name));
  if (missing.length > 0) {
    fail(`missing tools: ${missing.join(", ")} (registered: ${toolNames.join(", ")})`);
  }
  console.log(`OK: tools/list -> ${toolNames.join(", ")}`);

  send({
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: {
      name: "gemini_web_search",
      arguments: {
        query: "What is the current stable major version of the Go programming language? Reply in one sentence.",
      },
    },
  });
  const call = await awaitResponse(3, 60000);
  if (call.error) {
    fail(`tools/call error: ${JSON.stringify(call.error)}`);
  }
  const text = (call.result.content ?? []).map((part) => part.text ?? "").join("\n").trim();
  if (call.result.isError || text.length === 0) {
    fail(`tools/call returned an error or empty text: ${JSON.stringify(call.result)}`);
  }
  console.log(`OK: gemini_web_search -> ${text}`);
  console.log("PASS: integration smoke test");
  child.kill("SIGTERM");
  process.exit(0);
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}