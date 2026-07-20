"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const { WebSocketServer, WebSocket } = require("ws");

const DEFAULT_PORT = 3000;
const ROOT = __dirname;
const ASSET_ROOT = path.join(ROOT, "assets");
const MAX_PLAYERS = 4;
const DEFAULT_ROOM = createRoomCode();
const rooms = new Map();
const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

function createRoomCode() {
  return crypto.randomBytes(3).toString("hex").toUpperCase();
}

function localAddresses() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter(function(network) {
      return network && network.family === "IPv4" && !network.internal;
    })
    .map(function(network) { return network.address; });
}

function normalizedPort(value, fallback) {
  const port = Number.parseInt(String(value), 10);
  return Number.isInteger(port) && port >= 0 && port <= 65535 ? port : fallback;
}

function getRoom(code) {
  const roomCode = String(code || DEFAULT_ROOM).toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 32);
  const safeCode = roomCode || DEFAULT_ROOM;
  if (!rooms.has(safeCode)) {
    rooms.set(safeCode, {
      code: safeCode,
      players: new Map(),
      villageState: null,
      hostId: null,
      started: false
    });
  }
  return rooms.get(safeCode);
}

function safeNumber(value, fallback, minimum, maximum) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(minimum, Math.min(maximum, number));
}

function sanitizePlayerState(state) {
  const source = state || {};
  return {
    x: safeNumber(source.x, 720, 7, 1433),
    y: safeNumber(source.y, 495, 7, 953),
    facingX: safeNumber(source.facingX, 0, -1, 1),
    facingY: safeNumber(source.facingY, 1, -1, 1),
    hp: safeNumber(source.hp, 100, 0, 9999)
  };
}

function sanitizeResourceMap(source) {
  const values = source || {};
  return {
    wood: Math.floor(safeNumber(values.wood, 0, 0, 1000000)),
    stone: Math.floor(safeNumber(values.stone, 0, 0, 1000000)),
    crystal: Math.floor(safeNumber(values.crystal, 0, 0, 1000000)),
    hide: Math.floor(safeNumber(values.hide, 0, 0, 1000000))
  };
}

function sanitizeLevels(source, limits) {
  const values = source || {};
  return Object.fromEntries(Object.entries(limits).map(function(entry) {
    const id = entry[0];
    return [id, Math.floor(safeNumber(values[id], 0, 0, entry[1]))];
  }));
}

function sanitizeVillageState(state) {
  const source = state || {};
  return {
    bank: sanitizeResourceMap(source.bank),
    upgrades: sanitizeLevels(source.upgrades, { boots: 6, bag: 6, tools: 4, weapon: 7, armor: 6 }),
    village: sanitizeLevels(source.village, { villagers: 4, workers: 5, center: 5, streets: 5 }),
    day: Math.floor(safeNumber(source.day, 1, 1, 100000)),
    demonCores: Math.floor(safeNumber(source.demonCores, 0, 0, 100000)),
    demonVictories: Math.floor(safeNumber(source.demonVictories, 0, 0, 100000)),
    tributesPaid: Math.floor(safeNumber(source.tributesPaid, 0, 0, 100000)),
    gameOver: Boolean(source.gameOver)
  };
}

function publicPlayer(player) {
  return { id: player.id, state: player.state };
}

function send(socket, message) {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}

function broadcast(room, message, excludedSocket) {
  room.players.forEach(function(player) {
    if (player.socket !== excludedSocket) send(player.socket, message);
  });
}

function removePlayer(socket) {
  const session = socket.session;
  if (!session) return;
  const room = rooms.get(session.roomCode);
  socket.session = null;
  if (!room) return;
  room.players.delete(session.playerId);
  broadcast(room, { type: "player:left", id: session.playerId });
  if (room.hostId === session.playerId) {
    const nextHost = room.players.values().next().value;
    room.hostId = nextHost ? nextHost.id : null;
    broadcast(room, { type: "host:changed", hostId: room.hostId });
  }
  if (room.players.size === 0) {
    room.villageState = null;
    room.hostId = null;
    room.started = false;
    if (room.code !== DEFAULT_ROOM) rooms.delete(room.code);
  }
}

function handleMessage(socket, rawMessage) {
  let message;
  try {
    message = JSON.parse(rawMessage.toString());
  } catch (error) {
    send(socket, { type: "error", message: "Invalid network message." });
    return;
  }

  if (message.type === "join") {
    if (socket.session) return;
    const room = getRoom(message.room);
    if (room.players.size >= MAX_PLAYERS) {
      send(socket, { type: "error", message: "This village already has four players." });
      socket.close(1008, "Room full");
      return;
    }

    const player = {
      id: crypto.randomUUID(),
      socket: socket,
      state: sanitizePlayerState(message.player)
    };
    if (!room.villageState) room.villageState = sanitizeVillageState(message.villageState);
    room.players.set(player.id, player);
    if (!room.hostId) room.hostId = player.id;
    socket.session = { roomCode: room.code, playerId: player.id };
    send(socket, {
      type: "welcome",
      room: room.code,
      playerId: player.id,
      hostId: room.hostId,
      started: room.started,
      villageState: room.villageState,
      players: Array.from(room.players.values()).map(publicPlayer)
    });
    broadcast(room, {
      type: "player:joined",
      player: publicPlayer(player),
      hostId: room.hostId,
      started: room.started
    }, socket);
    return;
  }

  if (!socket.session) return;
  const room = rooms.get(socket.session.roomCode);
  const player = room && room.players.get(socket.session.playerId);
  if (!room || !player) return;

  if (message.type === "player:update") {
    player.state = sanitizePlayerState(message.player);
    broadcast(room, { type: "player:update", id: player.id, player: player.state }, socket);
  } else if (message.type === "village:sync") {
    room.villageState = sanitizeVillageState(message.villageState);
    broadcast(room, { type: "village:state", villageState: room.villageState }, socket);
  } else if (message.type === "start:game") {
    if (player.id !== room.hostId) {
      send(socket, { type: "error", message: "Only the host can start this game." });
      return;
    }
    room.started = true;
    broadcast(room, { type: "game:started", hostId: room.hostId });
  }
}

const server = http.createServer(function(request, response) {
  const requestUrl = new URL(request.url, "http://localhost");
  if (requestUrl.pathname === "/session") {
    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    response.end(JSON.stringify({ room: DEFAULT_ROOM, maxPlayers: MAX_PLAYERS }));
    return;
  }

  let filePath;
  if (requestUrl.pathname === "/") {
    filePath = path.join(ROOT, "nightfall_village.html");
  } else if (requestUrl.pathname.startsWith("/assets/")) {
    filePath = path.resolve(ROOT, requestUrl.pathname.slice(1));
    if (!filePath.startsWith(ASSET_ROOT + path.sep)) filePath = null;
  }
  if (!filePath) {
    response.writeHead(404).end("Not found");
    return;
  }
  fs.readFile(filePath, function(error, file) {
    if (error) {
      response.writeHead(error.code === "ENOENT" ? 404 : 500).end(error.code === "ENOENT" ? "Not found" : "Server error");
      return;
    }
    response.writeHead(200, {
      "Content-Type": MIME_TYPES[path.extname(filePath)] || "application/octet-stream",
      "Cache-Control": "no-store"
    });
    response.end(file);
  });
});

const websocketServer = new WebSocketServer({ noServer: true });
server.on("upgrade", function(request, socket, head) {
  const requestUrl = new URL(request.url, "http://localhost");
  if (requestUrl.pathname !== "/ws") {
    socket.destroy();
    return;
  }
  websocketServer.handleUpgrade(request, socket, head, function(client) {
    websocketServer.emit("connection", client);
  });
});

websocketServer.on("connection", function(socket) {
  socket.on("message", function(message) { handleMessage(socket, message); });
  socket.on("close", function() { removePlayer(socket); });
  socket.on("error", function() { removePlayer(socket); });
});

function connectionDetails() {
  const address = server.address();
  const port = address && typeof address === "object" ? address.port : DEFAULT_PORT;
  const localUrl = "http://localhost:" + port + "/?room=" + DEFAULT_ROOM;
  const lanUrls = localAddresses().map(function(lanAddress) {
    return "http://" + lanAddress + ":" + port + "/?room=" + DEFAULT_ROOM;
  });
  return { server: server, websocketServer: websocketServer, port: port, room: DEFAULT_ROOM, localUrl: localUrl, lanUrls: lanUrls };
}

function startServer(options) {
  const settings = options || {};
  if (server.listening) return Promise.resolve(connectionDetails());
  const port = normalizedPort(settings.port === undefined ? process.env.PORT : settings.port, DEFAULT_PORT);
  return new Promise(function(resolve, reject) {
    function handleError(error) {
      server.off("listening", handleListening);
      reject(error);
    }
    function handleListening() {
      server.off("error", handleError);
      resolve(connectionDetails());
    }
    server.once("error", handleError);
    server.once("listening", handleListening);
    if (settings.host) server.listen(port, settings.host);
    else server.listen(port);
  });
}

function stopServer() {
  if (!server.listening) return Promise.resolve();
  websocketServer.clients.forEach(function(client) { client.terminate(); });
  return new Promise(function(resolve) {
    let pending = 2;
    function finished() {
      pending -= 1;
      if (pending === 0) resolve();
    }
    websocketServer.close(finished);
    server.close(finished);
  });
}

function printConnectionDetails(details) {
  console.log("Nightfall Village host is running.");
  console.log("Open: " + details.localUrl);
  details.lanUrls.forEach(function(url) {
    console.log("LAN:  " + url);
  });
  console.log("Share the LAN URL with players on the same network. Public internet hosting needs port forwarding or a tunnel.");
}

if (require.main === module) {
  startServer().then(printConnectionDetails).catch(function(error) {
    console.error("Could not start the Nightfall Village host:", error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  MAX_PLAYERS: MAX_PLAYERS,
  startServer: startServer,
  stopServer: stopServer
};
