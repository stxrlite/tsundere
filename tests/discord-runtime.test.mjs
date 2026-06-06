import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { Client, Intents, Slash } from "../dist/discord/index.js";

test("mock Discord runtime login emits ready without network", async () => {
  const client = new Client({
    token: "test-token",
    intents: [Intents.Guilds],
    gateway: "mock"
  });
  const ready = new Promise((resolve) => client.once("ready", resolve));
  await client.login();
  await ready;
  assert.equal(client.ping, 1);
  assert.equal(client.user.tag, "Tsundere#0000");
});

test("Discord runtime exposes destroy for gateway cleanup", () => {
  const client = new Client({
    token: "test-token",
    intents: [Intents.Guilds],
    gateway: "mock"
  });
  assert.equal(typeof client.destroy, "function");
  client.destroy();
});

test("runtime guild members expose role add remove and cache helpers", async () => {
  const client = new Client({
    token: "test-token",
    intents: [Intents.Guilds, Intents.GuildMembers],
    gateway: "mock"
  });
  const guild = await client.guilds.fetch("1234567890");
  const member = await guild.members.fetch("9876543210");
  await member.roles.add("1111111111");
  assert.equal(member.roles.cache.has("1111111111"), true);
  assert.equal(member.roles.includes("1111111111"), true);
  await member.roles.remove("1111111111");
  assert.equal(member.roles.cache.has("1111111111"), false);
});

test("slash command registration waits for ready when application id is unknown", async () => {
  const client = new Client({
    token: "test-token",
    intents: [Intents.Guilds],
    gateway: "mock"
  });
  const calls = [];
  client.rest.put = async (route, body) => {
    calls.push({ route, body });
    return { status: 200, data: {} };
  };
  client.once("ready", () => {
    client.user = {
      id: "1234567890",
      username: "Tsundere",
      tag: "Tsundere#0000"
    };
  });
  await Slash.command("ping").description("Ping").register(client);
  assert.equal(calls.length, 0);
  await client.login();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].route, "/applications/1234567890/commands");
});

test("bundled Discord runtime declares discord.js dependency", async () => {
  const manifest = JSON.parse(await readFile(new URL("../packages/discord/package.json", import.meta.url), "utf8"));
  assert.match(manifest.dependencies["discord.js"], /^\^14\./);
});
