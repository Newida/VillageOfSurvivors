"use strict";

const assert = require("node:assert/strict");
const { once } = require("node:events");
const { after, before, test } = require("node:test");
const { WebSocket } = require("ws");
const { MAX_PLAYERS, startServer, stopServer } = require("../../server");

let host;

before(async function() {
  host = await startServer({ port: 0, host: "127.0.0.1" });
});

after(async function() {
  await stopServer();
});

test("serves the game and session metadata", async function() {
  const gameResponse = await fetch(host.localUrl);
  assert.equal(gameResponse.status, 200);
  assert.match(await gameResponse.text(), /<title>Nightfall Village<\/title>/);

  const sessionResponse = await fetch(new URL("/session", host.localUrl));
  assert.equal(sessionResponse.status, 200);
  assert.deepEqual(await sessionResponse.json(), { room: host.room, maxPlayers: MAX_PLAYERS });

  const stylesheetResponse = await fetch(new URL("/assets/styles.css", host.localUrl));
  assert.equal(stylesheetResponse.status, 200);
  assert.match(stylesheetResponse.headers.get("content-type"), /^text\/css/);
});

test("does not expose server-side project files", async function() {
  const response = await fetch(new URL("/server.js", host.localUrl));
  assert.equal(response.status, 404);
});

test("accepts a player into the lobby over WebSocket", async function() {
  const socket = new WebSocket("ws://127.0.0.1:" + host.port + "/ws");
  await once(socket, "open");
  socket.send(JSON.stringify({
    type: "join",
    room: host.room,
    player: { x: 720, y: 495, facingX: 0, facingY: 1, hp: 100 },
    villageState: {}
  }));

  const message = JSON.parse(String((await once(socket, "message"))[0]));
  assert.equal(message.type, "welcome");
  assert.equal(message.room, host.room);
  assert.equal(message.playerId, message.hostId);
  assert.equal(message.started, false);
  assert.equal(message.players.length, 1);

  socket.close();
  await once(socket, "close");
});
