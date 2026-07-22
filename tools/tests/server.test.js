"use strict";

const assert = require("node:assert/strict");
const { once } = require("node:events");
const { after, before, test } = require("node:test");
const { WebSocket } = require("ws");
const { MAX_PLAYERS, startServer, stopServer } = require("../../server");

let host;

function nextSocketMessage(socket) {
  return once(socket, "message").then(function(event) {
    return JSON.parse(String(event[0]));
  });
}

async function joinPlayer(room, clockState, playerState) {
  const socket = new WebSocket("ws://127.0.0.1:" + host.port + "/ws");
  await once(socket, "open");
  const welcomeMessage = nextSocketMessage(socket);
  socket.send(JSON.stringify({
    type: "join",
    room: room,
    player: Object.assign({ x: 720, y: 495, facingX: 0, facingY: 1, hp: 100 }, playerState || {}),
    villageState: { day: clockState && clockState.day },
    clockState: clockState
  }));
  return { socket: socket, welcome: await welcomeMessage };
}

async function closeSockets(sockets) {
  const closed = sockets.map(function(socket) { return once(socket, "close"); });
  sockets.forEach(function(socket) { socket.close(); });
  await Promise.all(closed);
}

before(async function() {
  host = await startServer({ port: 0, host: "127.0.0.1" });
});

after(async function() {
  await stopServer();
});

test("serves the game and session metadata", async function() {
  const gameResponse = await fetch(host.localUrl);
  assert.equal(gameResponse.status, 200);
  const gameHtml = await gameResponse.text();
  assert.match(gameHtml, /<title>Nightfall Village<\/title>/);
  assert.match(gameHtml, /id="playerScoreboard"/);
  assert.match(gameHtml, /id="playerNameInput"/);

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

test("synchronizes the host clock and live player scoreboard state", async function() {
  const room = "CLOCK-SYNC";
  const hostPlayer = await joinPlayer(room, {
    day: 3,
    phase: "day",
    phaseTime: 22,
    running: true,
    demonFightActive: false
  }, {
    name: "Lukas",
    hp: 73,
    maxHp: 125,
    bagAmount: 7,
    bagCapacity: 16
  });
  assert.deepEqual(hostPlayer.welcome.clockState, {
    day: 3,
    phase: "day",
    phaseTime: 22,
    running: false,
    demonFightActive: false
  });
  assert.deepEqual(hostPlayer.welcome.players[0].state, {
    name: "Lukas",
    x: 720,
    y: 495,
    facingX: 0,
    facingY: 1,
    hp: 73,
    maxHp: 125,
    bagAmount: 7,
    bagCapacity: 16
  });

  const hostSawJoin = nextSocketMessage(hostPlayer.socket);
  const guestPlayer = await joinPlayer(room, undefined, {
    name: "Anna",
    maxHp: 110,
    bagAmount: 4,
    bagCapacity: 12
  });
  const joinedMessage = await hostSawJoin;
  assert.equal(joinedMessage.type, "player:joined");
  assert.equal(joinedMessage.player.state.name, "Anna");
  assert.equal(joinedMessage.player.state.bagCapacity, 12);
  assert.deepEqual(guestPlayer.welcome.clockState, hostPlayer.welcome.clockState);

  const hostSawPlayerUpdate = nextSocketMessage(hostPlayer.socket);
  guestPlayer.socket.send(JSON.stringify({
    type: "player:update",
    player: {
      name: "Anna",
      x: 710,
      y: 500,
      facingX: -1,
      facingY: 0,
      hp: 42,
      maxHp: 110,
      bagAmount: 9,
      bagCapacity: 12
    }
  }));
  const playerUpdate = await hostSawPlayerUpdate;
  assert.equal(playerUpdate.type, "player:update");
  assert.equal(playerUpdate.player.name, "Anna");
  assert.equal(playerUpdate.player.hp, 42);
  assert.equal(playerUpdate.player.maxHp, 110);
  assert.equal(playerUpdate.player.bagAmount, 9);
  assert.equal(playerUpdate.player.bagCapacity, 12);

  const hostStartMessage = nextSocketMessage(hostPlayer.socket);
  const guestStartMessage = nextSocketMessage(guestPlayer.socket);
  hostPlayer.socket.send(JSON.stringify({ type: "start:game" }));
  assert.equal((await hostStartMessage).type, "game:started");
  assert.deepEqual((await guestStartMessage).clockState, hostPlayer.welcome.clockState);

  const guestClockMessage = nextSocketMessage(guestPlayer.socket);
  hostPlayer.socket.send(JSON.stringify({
    type: "clock:sync",
    clockState: {
      day: 3,
      phase: "night",
      phaseTime: 12.5,
      running: true,
      demonFightActive: false
    }
  }));
  assert.deepEqual(await guestClockMessage, {
    type: "clock:state",
    clockState: {
      day: 3,
      phase: "night",
      phaseTime: 12.5,
      running: true,
      demonFightActive: false
    }
  });

  const rejectedClockMessage = nextSocketMessage(guestPlayer.socket);
  guestPlayer.socket.send(JSON.stringify({
    type: "clock:sync",
    clockState: { day: 99, phase: "day", phaseTime: 45, running: true }
  }));
  const rejection = await rejectedClockMessage;
  assert.equal(rejection.type, "error");
  assert.match(rejection.message, /Only the host/);

  const hostSawLateJoin = nextSocketMessage(hostPlayer.socket);
  const latePlayer = await joinPlayer(room);
  assert.equal((await hostSawLateJoin).type, "player:joined");
  assert.deepEqual(latePlayer.welcome.clockState, {
    day: 3,
    phase: "night",
    phaseTime: 12.5,
    running: true,
    demonFightActive: false
  });

  await closeSockets([hostPlayer.socket, guestPlayer.socket, latePlayer.socket]);
});
