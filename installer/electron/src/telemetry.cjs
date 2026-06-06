const fs = require("node:fs");
const https = require("node:https");
const path = require("node:path");

function createTelemetry(configRoot, options) {
  const queuePath = path.join(configRoot, "telemetry-queue.jsonl");
  const enabled = options.telemetryMode === "usage" || options.telemetryMode === "crash";
  const endpoint = options.telemetryProvider === "https" ? options.telemetryEndpoint : "";

  async function capture(event, data = {}) {
    if (!enabled) {
      return;
    }
    const payload = {
      event,
      data,
      version: options.version,
      channel: options.channel,
      createdAt: new Date().toISOString()
    };
    fs.mkdirSync(configRoot, { recursive: true });
    fs.appendFileSync(queuePath, `${JSON.stringify(payload)}\n`);
    if (endpoint) {
      await postJson(endpoint, payload).catch(() => undefined);
    }
  }

  return { capture };
}

function postJson(endpoint, payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const request = https.request(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
        "User-Agent": "tsundere-installer"
      }
    }, (response) => {
      response.resume();
      response.on("end", resolve);
    });
    request.on("error", reject);
    request.write(body);
    request.end();
  });
}

module.exports = { createTelemetry };
