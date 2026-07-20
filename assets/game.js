    "use strict";

    const canvas = document.getElementById("game");
    const ctx = canvas.getContext("2d", { alpha: false });
    ctx.imageSmoothingEnabled = false;

    const shadeCanvas = document.createElement("canvas");
    shadeCanvas.width = canvas.width;
    shadeCanvas.height = canvas.height;
    const shadeCtx = shadeCanvas.getContext("2d");

    const ui = {
      day: document.getElementById("dayLabel"),
      phase: document.getElementById("phaseLabel"),
      phaseGlyph: document.getElementById("phaseGlyph"),
      time: document.getElementById("timeLabel"),
      timePrompt: document.getElementById("timePrompt"),
      timeFill: document.getElementById("timeFill"),
      hp: document.getElementById("hpLabel"),
      hpFill: document.getElementById("hpFill"),
      bag: document.getElementById("bagLabel"),
      bagFill: document.getElementById("bagFill"),
      message: document.getElementById("message"),
      contextHint: document.getElementById("contextHint"),
      contextText: document.getElementById("contextText"),
      wood: document.getElementById("woodBank"),
      stone: document.getElementById("stoneBank"),
      crystal: document.getElementById("crystalBank"),
      hide: document.getElementById("hideBank"),
      storageTotal: document.getElementById("storageTotal"),
      demonCores: document.getElementById("demonCores"),
      tributeStatus: document.getElementById("tributeStatus"),
      tributeStorageStatus: document.getElementById("tributeStorageStatus"),
      tributeStorageCost: document.getElementById("tributeStorageCost"),
      upgradeList: document.getElementById("upgradeList"),
      upgradeMenu: document.getElementById("upgradeMenu"),
      storageMenu: document.getElementById("storageMenu"),
      villageMenu: document.getElementById("villageMenu"),
      villageUpgradeList: document.getElementById("villageUpgradeList"),
      pauseMenu: document.getElementById("pauseMenu"),
      lobbyMenu: document.getElementById("lobbyMenu"),
      lobbyRoomLabel: document.getElementById("lobbyRoomLabel"),
      lobbyStatusText: document.getElementById("lobbyStatusText"),
      lobbyPlayerList: document.getElementById("lobbyPlayerList"),
      lobbyStartButton: document.getElementById("lobbyStartButton"),
      resumeButton: document.getElementById("resumeButton"),
      pauseSoundButton: document.getElementById("pauseSoundButton"),
      pauseResetButton: document.getElementById("pauseResetButton"),
      tributeMenu: document.getElementById("tributeMenu"),
      tributeCycleLabel: document.getElementById("tributeCycleLabel"),
      tributeMenuCost: document.getElementById("tributeMenuCost"),
      tributeMenuNote: document.getElementById("tributeMenuNote"),
      payTributeButton: document.getElementById("payTributeButton"),
      refuseTributeButton: document.getElementById("refuseTributeButton"),
      gameOverMenu: document.getElementById("gameOverMenu"),
      newVillageButton: document.getElementById("newVillageButton"),
      resetButton: document.getElementById("resetButton"),
      pauseButton: document.getElementById("pauseButton"),
      soundButton: document.getElementById("soundButton"),
      upgradeTracker: document.getElementById("upgradeTracker"),
      multiplayerStatus: document.getElementById("multiplayerStatus"),
      multiplayerStatusText: document.getElementById("multiplayerStatusText"),
      copyInviteButton: document.getElementById("copyInviteButton")
    };

    const VIEW = { width: canvas.width, height: canvas.height };
    const { WORLD, VILLAGE, HOUSES, DAY_LENGTH, NIGHT_LENGTH, SAVE_KEY, REDUCE_MOTION, resourceDefs, upgradeDefs, villageUpgradeDefs } = window.NightfallConfig;

    function defaultProgress() {
      return {
        bank: { wood: 0, stone: 0, crystal: 0, hide: 0 },
        upgrades: { boots: 0, bag: 0, tools: 0, weapon: 0, armor: 0 },
        village: { villagers: 0, workers: 0, center: 0, streets: 0 },
        trackedUpgrades: [],
        day: 1,
        demonCores: 0,
        demonVictories: 0,
        tributesPaid: 0,
        gameOver: false
      };
    }

    function loadProgress() {
      try {
        const stored = JSON.parse(localStorage.getItem(SAVE_KEY));
        if (!stored) return defaultProgress();
        const base = defaultProgress();
        return {
          ...base,
          ...stored,
          bank: { ...base.bank, ...(stored.bank || {}) },
          upgrades: { ...base.upgrades, ...(stored.upgrades || {}) },
          village: { ...base.village, ...(stored.village || {}) }
        };
      } catch (error) {
        return defaultProgress();
      }
    }

    let progress = loadProgress();
    let keys = new Set();
    let resources = [];
    let monsters = [];
    let particles = [];
    let scenery = [];
    let fireflies = [];
    let boss = null;
    let phase = "day";
    let phaseTime = DAY_LENGTH;
    let paused = false;
    let demonProjectiles = [];
    let tributeChoiceActive = false;
    let demonFightActive = false;
    let demonResolvedTonight = false;
    let nightThreatStage = 0;
    let nightHazardTimer = 0;
    let nightHazards = [];
    let gameOver = Boolean(progress.gameOver);
    let gatherCooldown = 0;
    let attackCooldown = 0;
    let messageTimer = 0;
    let lastTime = performance.now();
    let enemySpawnTimer = 0;
    let elapsed = 0;
    let moving = false;
    let walkClock = 0;
    let upgradeRenderKey = "";
    let villageUpgradeRenderKey = "";
    let trackerRenderKey = "";
    let tributeRenderKey = "";
    let audioContext = null;
    let soundsEnabled = false;
    let activeHouseMenu = null;
    let houseExitRequired = null;
    let pauseMenuOpen = false;
    let lobbyOpen = false;
    let workers = [];

    const player = {
      x: VILLAGE.x,
      y: VILLAGE.y + 15,
      radius: 7,
      hp: 100,
      held: { wood: 0, stone: 0, crystal: 0, hide: 0 },
      facingX: 0,
      facingY: 1,
      invulnerability: 0
    };

    const multiplayer = {
      socket: null,
      room: null,
      playerId: null,
      hostId: null,
      started: false,
      players: new Map(),
      playerUpdateTimer: 0,
      villageSyncTimer: null,
      connected: false,
      connecting: false
    };

    function sharedVillageSnapshot() {
      return {
        bank: { ...progress.bank },
        upgrades: { ...progress.upgrades },
        village: { ...progress.village },
        day: progress.day,
        demonCores: progress.demonCores,
        demonVictories: progress.demonVictories,
        tributesPaid: progress.tributesPaid,
        gameOver: progress.gameOver
      };
    }

    function localPlayerSnapshot() {
      return {
        x: player.x,
        y: player.y,
        facingX: player.facingX,
        facingY: player.facingY,
        hp: player.hp
      };
    }

    function multiplayerPlayerCount() {
      return multiplayer.connected ? multiplayer.players.size + 1 : 0;
    }

    function updateMultiplayerStatus(text) {
      const visible = Boolean(text);
      ui.multiplayerStatus.hidden = !visible;
      if (!visible) return;
      ui.multiplayerStatusText.textContent = text;
      ui.copyInviteButton.hidden = !multiplayer.connected || !multiplayer.room;
    }

    function updateMultiplayerUi() {
      if (multiplayer.connecting) {
        updateMultiplayerStatus("Joining village…");
      } else if (multiplayer.connected) {
        updateMultiplayerStatus("Room " + multiplayer.room + " · " + multiplayerPlayerCount() + "/4");
      }
      renderLobby();
    }

    function renderLobby() {
      if (!lobbyOpen) return;
      const isHost = multiplayer.playerId === multiplayer.hostId;
      const players = [{ id: multiplayer.playerId, self: true }].concat(
        Array.from(multiplayer.players.keys()).map(function(id) { return { id: id, self: false }; })
      );
      ui.lobbyRoomLabel.textContent = multiplayer.room ? "Room " + multiplayer.room : "Village lobby";
      ui.lobbyStatusText.textContent = multiplayer.connected
        ? isHost
          ? "Your village is ready. Start when everyone has joined."
          : "Waiting for the host to begin the village."
        : "Connection to the host was closed.";
      ui.lobbyPlayerList.innerHTML = players.map(function(entry, index) {
        const isHostPlayer = entry.id === multiplayer.hostId;
        return '<div class="lobby-player"><span>' + (entry.self ? "You" : "Villager " + (index + 1)) + "</span>" +
          '<span class="lobby-player-role">' + (isHostPlayer ? "Host" : "Ready") + "</span></div>";
      }).join("");
      ui.lobbyStartButton.hidden = !isHost;
      ui.lobbyStartButton.disabled = !isHost || !multiplayer.connected;
      ui.lobbyStartButton.textContent = multiplayer.connected ? "Start game" : "Host disconnected";
    }

    function openLobby() {
      lobbyOpen = true;
      hideRegularMenus();
      ui.lobbyMenu.hidden = false;
      setPaused(true);
      renderLobby();
    }

    function closeLobby() {
      lobbyOpen = false;
      ui.lobbyMenu.hidden = true;
      setPaused(false);
    }

    function startLobbyGame() {
      if (!multiplayer.connected || multiplayer.playerId !== multiplayer.hostId) return;
      ui.lobbyStartButton.disabled = true;
      ui.lobbyStartButton.textContent = "Starting…";
      sendMultiplayer({ type: "start:game" });
    }

    function sendMultiplayer(message) {
      if (!multiplayer.connected || !multiplayer.socket || multiplayer.socket.readyState !== WebSocket.OPEN) return;
      multiplayer.socket.send(JSON.stringify(message));
    }

    function queueVillageSync() {
      if (!multiplayer.connected || multiplayer.villageSyncTimer) return;
      multiplayer.villageSyncTimer = window.setTimeout(function() {
        multiplayer.villageSyncTimer = null;
        sendMultiplayer({ type: "village:sync", villageState: sharedVillageSnapshot() });
      }, 80);
    }

    function applySharedVillageState(state) {
      if (!state) return;
      progress = {
        ...progress,
        ...state,
        bank: { ...progress.bank, ...(state.bank || {}) },
        upgrades: { ...progress.upgrades, ...(state.upgrades || {}) },
        village: { ...progress.village, ...(state.village || {}) }
      };
      gameOver = Boolean(progress.gameOver);
      syncWorkers();
      upgradeRenderKey = "";
      villageUpgradeRenderKey = "";
      trackerRenderKey = "";
      localStorage.setItem(SAVE_KEY, JSON.stringify(progress));
      updateUI();
    }

    function receiveMultiplayerMessage(event) {
      let message;
      try {
        message = JSON.parse(event.data);
      } catch (error) {
        return;
      }
      if (message.type === "welcome") {
        multiplayer.room = message.room;
        multiplayer.playerId = message.playerId;
        multiplayer.hostId = message.hostId;
        multiplayer.started = Boolean(message.started);
        multiplayer.connected = true;
        multiplayer.connecting = false;
        multiplayer.players.clear();
        (message.players || []).forEach(function(remotePlayer) {
          if (remotePlayer.id !== multiplayer.playerId) multiplayer.players.set(remotePlayer.id, remotePlayer.state);
        });
        applySharedVillageState(message.villageState);
        updateMultiplayerUi();
        if (!multiplayer.started) openLobby();
      } else if (message.type === "player:joined" && message.player.id !== multiplayer.playerId) {
        multiplayer.players.set(message.player.id, message.player.state);
        multiplayer.hostId = message.hostId || multiplayer.hostId;
        multiplayer.started = Boolean(message.started);
        updateMultiplayerUi();
        showMessage("Another villager has joined your village.", 2.8);
      } else if (message.type === "player:update" && message.id !== multiplayer.playerId) {
        multiplayer.players.set(message.id, message.player);
      } else if (message.type === "player:left") {
        multiplayer.players.delete(message.id);
        updateMultiplayerUi();
        showMessage("A villager has left the village.", 2.4);
      } else if (message.type === "village:state") {
        applySharedVillageState(message.villageState);
      } else if (message.type === "host:changed") {
        multiplayer.hostId = message.hostId;
        updateMultiplayerUi();
      } else if (message.type === "game:started") {
        multiplayer.started = true;
        multiplayer.hostId = message.hostId || multiplayer.hostId;
        if (lobbyOpen) closeLobby();
        updateMultiplayerUi();
        showMessage("The host has started the village.", 3);
      } else if (message.type === "error") {
        updateMultiplayerStatus(message.message || "Could not join this village.");
      }
    }

    async function connectToMultiplayerHost() {
      if (location.protocol === "file:" || !window.WebSocket) return;
      let room = new URLSearchParams(location.search).get("room");
      if (!room) {
        try {
          const response = await fetch("/session", { cache: "no-store" });
          if (!response.ok) return;
          const session = await response.json();
          room = session.room;
          const url = new URL(location.href);
          url.searchParams.set("room", room);
          history.replaceState(null, "", url);
        } catch (error) {
          return;
        }
      }

      const socketProtocol = location.protocol === "https:" ? "wss:" : "ws:";
      multiplayer.connecting = true;
      updateMultiplayerUi();
      const socket = new WebSocket(socketProtocol + "//" + location.host + "/ws");
      multiplayer.socket = socket;
      socket.addEventListener("open", function() {
        socket.send(JSON.stringify({
          type: "join",
          room: room,
          player: localPlayerSnapshot(),
          villageState: sharedVillageSnapshot()
        }));
      });
      socket.addEventListener("message", receiveMultiplayerMessage);
      socket.addEventListener("close", function() {
        multiplayer.connected = false;
        multiplayer.connecting = false;
        multiplayer.players.clear();
        updateMultiplayerStatus("Host connection closed");
      });
      socket.addEventListener("error", function() {
        if (!multiplayer.connected) updateMultiplayerStatus("Unable to join host");
      });
    }

    function updateMultiplayer(dt) {
      if (!multiplayer.connected) return;
      multiplayer.playerUpdateTimer -= dt;
      if (multiplayer.playerUpdateTimer > 0) return;
      multiplayer.playerUpdateTimer = 0.08;
      sendMultiplayer({ type: "player:update", player: localPlayerSnapshot() });
    }

    async function copyInviteLink() {
      if (!multiplayer.room) return;
      const invite = new URL(location.href);
      invite.searchParams.set("room", multiplayer.room);
      const desktopInviteHost = invite.searchParams.get("inviteHost");
      if (desktopInviteHost) {
        invite.host = desktopInviteHost;
        invite.searchParams.delete("inviteHost");
      }
      try {
        await navigator.clipboard.writeText(invite.href);
        showMessage("Invite link copied.", 2);
      } catch (error) {
        window.prompt("Copy this invite link:", invite.href);
      }
    }

    const cameraState = {
      x: clamp(player.x - VIEW.width / 2, 0, WORLD.width - VIEW.width),
      y: clamp(player.y - VIEW.height / 2, 0, WORLD.height - VIEW.height)
    };

    function saveProgress() {
      localStorage.setItem(SAVE_KEY, JSON.stringify(progress));
      queueVillageSync();
    }

    function totalHeld() {
      return player.held.wood + player.held.stone + player.held.crystal + player.held.hide;
    }

    function maxHp() {
      return 100 + progress.upgrades.armor * 20 + progress.demonCores * 5;
    }

    function bagCapacity() {
      return 8 + progress.upgrades.bag * 4;
    }

    function villageRadius() {
      return VILLAGE.radius + progress.village.center * 12;
    }

    function streetReach() {
      return 260 + progress.village.streets * 42;
    }

    function streetWidth() {
      return 14 + progress.village.streets * 3;
    }

    function isOnVillageStreet(entity) {
      const target = entity || player;
      const dx = Math.abs(target.x - VILLAGE.x);
      const dy = Math.abs(target.y - VILLAGE.y);
      const reach = streetReach();
      const width = streetWidth();
      return (dx <= reach && dy <= width) || (dy <= reach && dx <= width);
    }

    function moveSpeed() {
      const baseSpeed = 105 * Math.pow(1.10, progress.upgrades.boots);
      return baseSpeed * (isOnVillageStreet(player) ? 1 + progress.village.streets * 0.08 : 1);
    }

    function attackDamage() {
      return 22 + progress.upgrades.weapon * 8 + progress.demonCores * 2;
    }

    function damageReduction() {
      return Math.min(0.38, progress.upgrades.armor * 0.055);
    }

    function tributeCycle() {
      return Math.max(1, Math.ceil(progress.day / 7));
    }

    function daysUntilTribute() {
      return 7 - (progress.day % 7 || 7);
    }

    function tributeDueAtDusk() {
      return progress.day % 7 === 0;
    }

    function tributeCost(cycle) {
      const level = cycle || tributeCycle();
      return {
        wood: 18 + (level - 1) * 9,
        stone: 10 + (level - 1) * 7,
        crystal: Math.max(0, level - 1) * 2,
        hide: Math.max(0, level - 1) * 2
      };
    }

    function tributeReminderMessage() {
      const missing = Object.entries(tributeCost())
        .map(function(entry) {
          const shortfall = Math.max(0, entry[1] - progress.bank[entry[0]]);
          return shortfall > 0 ? shortfall + " " + entry[0] : "";
        })
        .filter(Boolean);
      const timing = tributeDueAtDusk()
        ? "The offering is due at dusk."
        : daysUntilTribute() + " day" + (daysUntilTribute() === 1 ? "" : "s") + " until the offering.";
      return missing.length
        ? timing + " Still needed: " + missing.join(", ") + "."
        : timing + " The offering is ready.";
    }

    function demonTier() {
      return tributeCycle();
    }

    function storedResourceTotal() {
      return ["wood", "stone", "crystal", "hide"].reduce(function(total, type) {
        return total + progress.bank[type];
      }, 0);
    }

    function addToStorage(type, amount) {
      if (amount > 0) progress.bank[type] += amount;
      return amount;
    }

    function inVillage(entity) {
      const target = entity || player;
      return Math.hypot(target.x - VILLAGE.x, target.y - VILLAGE.y) <= villageRadius();
    }

    function houseAt(entity) {
      const target = entity || player;
      return HOUSES.find(function(house) {
        const width = 19 + (house.variant % 2) * 2;
        return Math.abs(target.x - house.x) <= width &&
          target.y >= house.footY - 24 &&
          target.y <= house.footY + 4;
      }) || null;
    }

    function hideRegularMenus() {
      ui.upgradeMenu.hidden = true;
      ui.storageMenu.hidden = true;
      ui.villageMenu.hidden = true;
      ui.pauseMenu.hidden = true;
      pauseMenuOpen = false;
    }

    function openHouseMenu(house) {
      if (!house.menu || activeHouseMenu) return;
      hideRegularMenus();
      activeHouseMenu = house;
      ui[house.menu].hidden = false;
      ui.contextHint.classList.remove("show");
      setPaused(true);
      requestAnimationFrame(function() {
        const closeButton = ui[house.menu].querySelector("[data-close-menu]");
        if (closeButton) closeButton.focus();
      });
    }

    function closeHouseMenu() {
      if (!activeHouseMenu) return;
      const house = activeHouseMenu;
      hideRegularMenus();
      activeHouseMenu = null;
      houseExitRequired = house.id;
      setPaused(false);
      showMessage("Step outside before entering another village house.", 2.2);
    }

    function updateHouseInteraction() {
      const house = houseAt();
      if (!house) {
        houseExitRequired = null;
        return;
      }
      if (!activeHouseMenu && house.menu && houseExitRequired !== house.id) {
        openHouseMenu(house);
      }
    }

    function canAfford(cost) {
      return Object.entries(cost).every(function(entry) {
        return progress.bank[entry[0]] >= entry[1];
      });
    }

    function spend(cost) {
      Object.entries(cost).forEach(function(entry) {
        progress.bank[entry[0]] -= entry[1];
      });
    }

    function showMessage(text, seconds) {
      ui.message.textContent = text;
      ui.message.classList.add("show");
      messageTimer = seconds || 2.5;
    }

    function clamp(value, min, max) {
      return Math.max(min, Math.min(max, value));
    }

    function lerp(a, b, amount) {
      return a + (b - a) * amount;
    }

    function hash2(x, y) {
      let value = Math.imul(x, 374761393) + Math.imul(y, 668265263);
      value = (value ^ (value >>> 13)) * 1274126177;
      return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
    }

    function seededRandom(seed) {
      let state = seed >>> 0;
      return function() {
        state += 0x6D2B79F5;
        let result = state;
        result = Math.imul(result ^ (result >>> 15), result | 1);
        result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
        return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
      };
    }

    function generateScenery() {
      const random = seededRandom(1942);
      scenery = [];
      fireflies = [];

      for (let i = 0; i < 520; i++) {
        const x = 20 + random() * (WORLD.width - 40);
        const y = 20 + random() * (WORLD.height - 40);
        const villageDistance = Math.hypot(x - VILLAGE.x, y - VILLAGE.y);
        const onPath = villageDistance < 260 &&
          (Math.abs(x - VILLAGE.x) < 25 || Math.abs(y - VILLAGE.y) < 23);
        if (villageDistance < villageRadius() + 12 || onPath) continue;

        const roll = random();
        const kind = roll < 0.52 ? "grass" :
          roll < 0.70 ? "flower" :
          roll < 0.88 ? "bush" :
          roll < 0.95 ? "mushroom" : "stump";

        scenery.push({
          x: x,
          y: y,
          kind: kind,
          variant: Math.floor(random() * 4),
          tint: random()
        });
      }

      for (let i = 0; i < 34; i++) {
        const angle = random() * Math.PI * 2;
        const distance = 105 + random() * 360;
        fireflies.push({
          x: clamp(VILLAGE.x + Math.cos(angle) * distance, 20, WORLD.width - 20),
          y: clamp(VILLAGE.y + Math.sin(angle) * distance, 20, WORLD.height - 20),
          phase: random() * Math.PI * 2,
          speed: 0.6 + random() * 0.8
        });
      }
    }

    function clearVillageScenery() {
      const clearRadius = villageRadius() + 12;
      scenery = scenery.filter(function(item) {
        return Math.hypot(item.x - VILLAGE.x, item.y - VILLAGE.y) >= clearRadius;
      });
    }

    function weightedResourceType() {
      const roll = Math.random();
      let total = 0;
      for (const entry of Object.entries(resourceDefs)) {
        total += entry[1].weight;
        if (roll < total) return entry[0];
      }
      return "hide";
    }

    function spawnResource(type) {
      const resourceType = type || weightedResourceType();
      let x;
      let y;
      do {
        x = 35 + Math.random() * (WORLD.width - 70);
        y = 35 + Math.random() * (WORLD.height - 70);
      } while (Math.hypot(x - VILLAGE.x, y - VILLAGE.y) < villageRadius() + 68);

      resources.push({
        type: resourceType,
        x: x,
        y: y,
        radius: resourceDefs[resourceType].radius,
        amount: resourceType === "hide" ? 1 : 2 + Math.floor(Math.random() * 3),
        variant: Math.floor(Math.random() * 4),
        phase: Math.random() * Math.PI * 2,
        wanderAngle: Math.random() * Math.PI * 2,
        wanderTimer: 0.4 + Math.random() * 2.5
      });
    }

    function replenishResources() {
      while (resources.length < 96) spawnResource();
    }

    function updateAnimalResources(dt) {
      resources.forEach(function(resource) {
        if (resource.type !== "hide") return;

        const distanceToPlayer = Math.hypot(player.x - resource.x, player.y - resource.y);
        let speed = 12;
        resource.wanderTimer -= dt;

        if (distanceToPlayer < 56) {
          resource.wanderAngle = Math.atan2(resource.y - player.y, resource.x - player.x) +
            (Math.random() - 0.5) * 0.5;
          resource.wanderTimer = 0.42 + Math.random() * 0.28;
          speed = 42;
        } else if (resource.wanderTimer <= 0) {
          resource.wanderAngle += (Math.random() - 0.5) * 2.3;
          resource.wanderTimer = 0.8 + Math.random() * 2.2;
        }

        const nextX = resource.x + Math.cos(resource.wanderAngle) * speed * dt;
        const nextY = resource.y + Math.sin(resource.wanderAngle) * speed * dt;
        if (Math.hypot(nextX - VILLAGE.x, nextY - VILLAGE.y) < villageRadius() + 20) {
          resource.wanderAngle = Math.atan2(resource.y - VILLAGE.y, resource.x - VILLAGE.x);
        } else {
          resource.x = clamp(nextX, 18, WORLD.width - 18);
          resource.y = clamp(nextY, 18, WORLD.height - 18);
        }
        resource.phase += dt * (speed > 20 ? 16 : 8);
      });
    }

    function nearestResource(maxDistance) {
      let nearest = null;
      let bestDistance = maxDistance;
      resources.forEach(function(resource) {
        const distance = Math.hypot(player.x - resource.x, player.y - resource.y);
        if (distance < bestDistance) {
          bestDistance = distance;
          nearest = resource;
        }
      });
      return nearest;
    }

    function workerHome(index) {
      const offsets = [[-18, 17], [18, 18], [-25, -4], [25, -3]];
      const offset = offsets[index % offsets.length];
      return { x: VILLAGE.x + offset[0], y: VILLAGE.y + offset[1] };
    }

    function syncWorkers() {
      const desired = progress.village.villagers;
      while (workers.length < desired) {
        const home = workerHome(workers.length);
        workers.push({
          id: workers.length,
          x: home.x,
          y: home.y,
          state: "idle",
          target: null,
          carryType: null,
          carryAmount: 0,
          rest: 0.8 + Math.random() * 1.2,
          walkClock: Math.random() * Math.PI * 2
        });
      }
      if (workers.length > desired) workers = workers.slice(0, desired);
    }

    function workerSpeed() {
      return 32 + progress.village.workers * 8;
    }

    function moveWorkerToward(worker, targetX, targetY, dt) {
      const dx = targetX - worker.x;
      const dy = targetY - worker.y;
      const distance = Math.hypot(dx, dy);
      if (distance <= 1) return distance;
      const movement = Math.min(distance, workerSpeed() * dt);
      worker.x += dx / distance * movement;
      worker.y += dy / distance * movement;
      worker.walkClock += dt * 9;
      return distance;
    }

    function findWorkerTarget(worker) {
      const candidates = resources
        .filter(function(resource) {
          return !workers.some(function(other) {
            return other !== worker && other.target === resource;
          });
        })
        .sort(function(a, b) {
          return Math.hypot(a.x - worker.x, a.y - worker.y) - Math.hypot(b.x - worker.x, b.y - worker.y);
        });
      if (!candidates.length) return null;
      return candidates[Math.floor(Math.random() * Math.min(6, candidates.length))];
    }

    function updateWorkers(dt) {
      syncWorkers();
      workers.forEach(function(worker) {
        const home = workerHome(worker.id);

        if (phase !== "day" && worker.state !== "returning" && worker.state !== "waiting") {
          worker.target = null;
          worker.state = "returning";
        }

        if (worker.state === "idle") {
          worker.rest -= dt;
          if (worker.carryAmount > 0) {
            worker.state = "returning";
          } else if (phase === "day" && worker.rest <= 0) {
            worker.target = findWorkerTarget(worker);
            worker.state = worker.target ? "outbound" : "idle";
            worker.rest = worker.target ? 0 : 1;
          }
          return;
        }

        if (worker.state === "outbound") {
          const targetIndex = resources.indexOf(worker.target);
          if (targetIndex < 0 || !worker.target || worker.target.amount <= 0) {
            worker.target = null;
            worker.state = "idle";
            worker.rest = 0.7;
            return;
          }
          const distance = moveWorkerToward(worker, worker.target.x, worker.target.y, dt);
          if (distance <= 9) {
            const harvested = Math.min(1, worker.target.amount);
            worker.target.amount -= harvested;
            worker.carryType = worker.target.type;
            worker.carryAmount = harvested;
            if (worker.target.amount <= 0) resources.splice(targetIndex, 1);
            worker.target = null;
            worker.state = "returning";
          }
          return;
        }

        if (worker.state === "returning") {
          const distance = moveWorkerToward(worker, home.x, home.y, dt);
          if (distance <= 9) {
            if (worker.carryAmount > 0) {
              const stored = addToStorage(worker.carryType, worker.carryAmount);
              worker.carryAmount -= stored;
              if (stored > 0) {
                floatText(worker.x, worker.y - 10, "+" + stored + " " + worker.carryType, "#d8f1b2");
                saveProgress();
                upgradeRenderKey = "";
                villageUpgradeRenderKey = "";
              }
            }
            worker.carryType = null;
            worker.state = "idle";
            worker.rest = Math.max(0.55, 2.6 - progress.village.workers * 0.32);
          }
          return;
        }

        if (worker.state === "waiting") {
          worker.state = "returning";
        }
      });
    }

    function enemyScale() {
      return Math.pow(1.08, demonTier() - 1);
    }

    function nightIntensity() {
      if (phase !== "night" || demonFightActive) return 0;
      return clamp(1 - phaseTime / NIGHT_LENGTH, 0, 1);
    }

    function currentNightThreatStage() {
      const intensity = nightIntensity();
      if (intensity >= 0.68) return 2;
      if (intensity >= 0.34) return 1;
      return 0;
    }

    function updateNightEscalation(dt) {
      if (demonFightActive) return;

      const stage = currentNightThreatStage();
      if (stage > nightThreatStage) {
        nightThreatStage = stage;
        if (stage === 1) {
          showMessage("The woods are hunting. Swift shades are joining the pack.", 3.4);
        } else {
          showMessage("Last stand. Brutes stalk the dark and moonfall scars the woods.", 4);
        }
        sfx("dusk");
      }

      if (stage < 2 || inVillage(player)) return;
      nightHazardTimer -= dt;
      if (nightHazardTimer <= 0) {
        nightHazards.push({
          x: player.x,
          y: player.y,
          radius: 22,
          warning: 0.78,
          life: 1.08,
          struck: false
        });
        nightHazardTimer = Math.max(3.8, 5.8 - demonTier() * 0.18);
      }
    }

    function updateNightHazards(dt) {
      nightHazards.forEach(function(hazard) {
        hazard.warning -= dt;
        hazard.life -= dt;
        if (!hazard.struck && hazard.warning <= 0) {
          hazard.struck = true;
          burst(hazard.x, hazard.y, "#a76c9f", 14, 34);
          if (Math.hypot(player.x - hazard.x, player.y - hazard.y) <= hazard.radius + player.radius) {
            hurtPlayer(hazard.x, hazard.y, 15 * Math.pow(1.06, demonTier() - 1), 18);
          }
        }
      });
      nightHazards = nightHazards.filter(function(hazard) { return hazard.life > 0; });
    }

    function spawnMonster() {
      const angle = Math.random() * Math.PI * 2;
      const distance = 190 + Math.random() * 90;
      const scale = enemyScale();
      const intensity = nightIntensity();
      const roll = Math.random();
      const kind = intensity >= 0.68 && roll < 0.34
        ? "brute"
        : intensity >= 0.34 && roll < 0.46
          ? "runner"
          : "gloam";
      const profile = kind === "brute"
        ? { radius: 12, hp: 84, speed: 37, damage: 17 }
        : kind === "runner"
          ? { radius: 7, hp: 29, speed: 76, damage: 9 }
          : { radius: 9, hp: 42, speed: 49 + Math.random() * 10, damage: 11 };
      const lateNightScale = 1 + intensity * 0.2;
      const monster = {
        x: clamp(player.x + Math.cos(angle) * distance, 20, WORLD.width - 20),
        y: clamp(player.y + Math.sin(angle) * distance, 20, WORLD.height - 20),
        radius: profile.radius,
        hp: profile.hp * scale * lateNightScale,
        maxHp: profile.hp * scale * lateNightScale,
        speed: profile.speed * Math.min(1.45, Math.pow(1.04, demonTier() - 1)) * (1 + intensity * 0.16),
        damage: profile.damage * Math.pow(1.08, demonTier() - 1) * lateNightScale,
        kind: kind,
        hitCooldown: 0,
        isBoss: false,
        isDemon: false,
        phase: Math.random() * Math.PI * 2,
        flash: 0
      };
      monsters.push(monster);
      return monster;
    }

    function spawnDemonGod() {
      const tier = demonTier();
      const angle = Math.random() * Math.PI * 2;
      const distance = 135;
      const scale = Math.pow(1.30, tier - 1);
      const demon = {
        x: clamp(player.x + Math.cos(angle) * distance, 28, WORLD.width - 28),
        y: clamp(player.y + Math.sin(angle) * distance, 28, WORLD.height - 28),
        radius: 19,
        hp: Math.round(330 * scale),
        maxHp: Math.round(330 * scale),
        speed: 36 + Math.min(18, tier * 2),
        damage: 22 * Math.pow(1.12, tier - 1),
        hitCooldown: 0,
        isBoss: true,
        isDemon: true,
        tier: tier,
        phase: Math.random() * Math.PI * 2,
        flash: 0,
        patternCooldown: 2.4,
        patternStep: 0,
        patternLabel: "AWAKENING",
        dashWindup: 0,
        dashTime: 0,
        dashVX: 0,
        dashVY: 0
      };
      boss = demon;
      monsters.push(demon);
      return demon;
    }

    function addParticle(x, y, color, options) {
      const config = options || {};
      particles.push({
        x: x,
        y: y,
        vx: config.vx || 0,
        vy: config.vy || 0,
        life: config.life || 0.5,
        maxLife: config.life || 0.5,
        color: color,
        size: config.size || 2,
        gravity: config.gravity || 0,
        kind: config.kind || "square",
        text: config.text || ""
      });
    }

    function burst(x, y, color, count, strength) {
      const amount = REDUCE_MOTION ? Math.ceil(count / 2) : count;
      for (let i = 0; i < amount; i++) {
        const angle = Math.random() * Math.PI * 2;
        const force = 8 + Math.random() * strength;
        addParticle(x, y, color, {
          vx: Math.cos(angle) * force,
          vy: Math.sin(angle) * force - 6,
          life: 0.35 + Math.random() * 0.3,
          size: 1 + Math.floor(Math.random() * 2),
          gravity: 18
        });
      }
    }

    function floatText(x, y, text, color) {
      addParticle(x, y, color, {
        vy: -13,
        life: 0.8,
        size: 1,
        kind: "text",
        text: text
      });
    }

    function ensureAudio() {
      if (!audioContext) {
        const AudioCtor = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtor) return null;
        audioContext = new AudioCtor();
      }
      if (audioContext.state === "suspended") audioContext.resume();
      return audioContext;
    }

    function tone(frequency, duration, volume, wave, delay) {
      if (!soundsEnabled) return;
      const audio = ensureAudio();
      if (!audio) return;
      const start = audio.currentTime + (delay || 0);
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      oscillator.type = wave || "sine";
      oscillator.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(volume || 0.025, start + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      oscillator.connect(gain);
      gain.connect(audio.destination);
      oscillator.start(start);
      oscillator.stop(start + duration + 0.02);
    }

    function sfx(name) {
      if (name === "gather") {
        tone(520, 0.08, 0.018, "triangle", 0);
        tone(660, 0.1, 0.014, "triangle", 0.05);
      } else if (name === "deposit") {
        tone(392, 0.18, 0.018, "sine", 0);
        tone(523, 0.22, 0.018, "sine", 0.09);
        tone(659, 0.28, 0.014, "sine", 0.18);
      } else if (name === "upgrade") {
        tone(440, 0.12, 0.02, "triangle", 0);
        tone(554, 0.15, 0.02, "triangle", 0.08);
        tone(698, 0.2, 0.018, "triangle", 0.16);
      } else if (name === "swing") {
        tone(175, 0.07, 0.012, "square", 0);
      } else if (name === "hit") {
        tone(120, 0.1, 0.018, "triangle", 0);
      } else if (name === "dusk") {
        tone(294, 0.35, 0.016, "sine", 0);
        tone(220, 0.45, 0.015, "sine", 0.18);
      } else if (name === "demon") {
        tone(82, 0.55, 0.028, "sawtooth", 0);
        tone(123, 0.48, 0.02, "sawtooth", 0.12);
        tone(196, 0.35, 0.014, "triangle", 0.28);
      } else if (name === "victory") {
        tone(392, 0.18, 0.02, "triangle", 0);
        tone(523, 0.18, 0.02, "triangle", 0.12);
        tone(659, 0.3, 0.02, "triangle", 0.24);
      }
    }

    function beginNight(demonBattle) {
      phase = "night";
      phaseTime = NIGHT_LENGTH;
      enemySpawnTimer = 0;
      nightThreatStage = 0;
      nightHazardTimer = 3.5;
      nightHazards = [];
      demonFightActive = Boolean(demonBattle);
      demonResolvedTonight = false;
      demonProjectiles = [];
      sfx(demonBattle ? "demon" : "dusk");

      if (demonBattle) {
        spawnDemonGod();
        showMessage("The Demon God descends. The lantern circle cannot shield you now.", 4.2);
      } else {
        showMessage("Lanterns on. The village circle is safe until morning.", 3.6);
      }
    }

    function openTributeMenu() {
      const cycle = tributeCycle();
      const cost = tributeCost(cycle);
      tributeChoiceActive = true;
      ui.tributeMenu.hidden = false;
      ui.tributeCycleLabel.textContent = "Seven days have passed. This is tribute " + cycle + ".";
      ui.tributeMenuCost.innerHTML = costMarkup(cost);
      ui.payTributeButton.disabled = !canAfford(cost);
      ui.tributeMenuNote.textContent = canAfford(cost)
        ? "Paying lets the village see another night. Refusing starts a fight to the death."
        : "Your stores cannot meet this demand. Refuse and face the Demon God, or keep the game paused while you decide.";
      setPaused(true);
      requestAnimationFrame(function() {
        (canAfford(cost) ? ui.payTributeButton : ui.refuseTributeButton).focus();
      });
    }

    function payTribute() {
      if (!tributeChoiceActive) return;
      const cost = tributeCost();
      if (!canAfford(cost)) return;
      spend(cost);
      progress.tributesPaid += 1;
      tributeChoiceActive = false;
      ui.tributeMenu.hidden = true;
      saveProgress();
      setPaused(false);
      beginNight(false);
      showMessage("The Demon God accepts the tribute. The village lives for another week.", 4);
      updateUI();
    }

    function refuseTribute() {
      if (!tributeChoiceActive) return;
      tributeChoiceActive = false;
      ui.tributeMenu.hidden = true;
      setPaused(false);
      beginNight(true);
      updateUI();
    }

    function startNight() {
      if (tributeDueAtDusk()) {
        openTributeMenu();
        return;
      }
      beginNight(false);
    }

    function startDay() {
      const survivedDemon = demonResolvedTonight;
      const returnedHome = inVillage();
      phase = "day";
      phaseTime = DAY_LENGTH;
      progress.day += 1;
      monsters = [];
      boss = null;
      demonProjectiles = [];
      nightHazards = [];
      demonFightActive = false;
      demonResolvedTonight = false;
      player.hp = maxHp();
      if (returnedHome) {
        player.x = VILLAGE.x;
        player.y = VILLAGE.y + 15;
        depositHeld(true);
      }
      replenishResources();
      saveProgress();

      const dawn = survivedDemon
        ? "Dawn breaks. The Demon God has been driven away."
        : returnedHome
          ? "A new golden morning. The woods have grown generous again."
          : "Dawn finds you beyond the village. Your bag is still with you.";
      showMessage(dawn + " " + tributeReminderMessage(), survivedDemon ? 5.5 : 4.8);
    }

    function depositHeld(silentSound) {
      const amount = totalHeld();
      if (amount <= 0) return;

      let stored = 0;
      Object.keys(player.held).forEach(function(type) {
        const accepted = addToStorage(type, player.held[type]);
        player.held[type] -= accepted;
        stored += accepted;
      });

      burst(VILLAGE.x, VILLAGE.y + 8, "#f4c76c", 12, 24);
      floatText(VILLAGE.x, VILLAGE.y - 12, "+" + stored + " safely stored", "#fff0a8");
      if (!silentSound) {
        showMessage("The hearth keeper stored " + stored + " resources for you.");
        sfx("deposit");
      }
      saveProgress();
      upgradeRenderKey = "";
      villageUpgradeRenderKey = "";
    }

    function knockOut() {
      if (demonFightActive) {
        triggerGameOver();
        return;
      }
      const lost = totalHeld();
      player.held = { wood: 0, stone: 0, crystal: 0, hide: 0 };
      player.hp = maxHp();
      player.x = VILLAGE.x;
      player.y = VILLAGE.y + 15;
      monsters = [];
      boss = null;
      demonProjectiles = [];
      nightHazards = [];
      phase = "day";
      phaseTime = DAY_LENGTH;
      progress.day += 1;
      saveProgress();
      const rescue = lost > 0
        ? "The wardens carried you home. Your bag spilled " + lost + " resources."
        : "The wardens found you and tucked you safely beside the hearth.";
      showMessage(rescue + " " + tributeReminderMessage(), 5);
    }

    function triggerGameOver() {
      gameOver = true;
      progress.gameOver = true;
      player.hp = 0;
      monsters = [];
      boss = null;
      demonProjectiles = [];
      nightHazards = [];
      demonFightActive = false;
      tributeChoiceActive = false;
      ui.tributeMenu.hidden = true;
      saveProgress();
      setPaused(true);
      ui.gameOverMenu.hidden = false;
      requestAnimationFrame(function() {
        ui.newVillageButton.focus();
      });
    }

    function gather() {
      if (gatherCooldown > 0) return;
      if (totalHeld() >= bagCapacity()) {
        showMessage("Your pack is full. Bring it home to the hearth.", 1.6);
        gatherCooldown = 0.45;
        return;
      }

      const resource = nearestResource(34);
      if (!resource) return;
      const index = resources.indexOf(resource);
      const yieldAmount = Math.min(
        1 + progress.upgrades.tools,
        resource.amount,
        bagCapacity() - totalHeld()
      );

      player.held[resource.type] += yieldAmount;
      resource.amount -= yieldAmount;
      gatherCooldown = 0.34;
      burst(resource.x, resource.y, resourceDefs[resource.type].color, 7, 28);
      floatText(resource.x, resource.y - 8, "+" + yieldAmount + " " + resource.type, "#fff1bd");
      sfx("gather");

      if (resource.amount <= 0) {
        resources.splice(index, 1);
        burst(resource.x, resource.y, "#d6bb78", 5, 18);
      }
    }

    function attack() {
      if (attackCooldown > 0) return;
      attackCooldown = 0.38;
      sfx("swing");

      const reach = 43;
      const damage = attackDamage();
      monsters.forEach(function(monster) {
        const dx = monster.x - player.x;
        const dy = monster.y - player.y;
        const distance = Math.hypot(dx, dy);
        const facingDot = distance > 0
          ? (dx / distance) * player.facingX + (dy / distance) * player.facingY
          : 1;

        if (distance <= reach + monster.radius && facingDot > -0.12) {
          monster.hp -= damage;
          monster.flash = 0.12;
          monster.x += player.facingX * 15;
          monster.y += player.facingY * 15;
          burst(monster.x, monster.y, monster.isBoss ? "#e0ab5b" : "#a98aae", 9, 38);
          floatText(monster.x, monster.y - monster.radius, "-" + Math.round(damage), "#ffe0a5");
          sfx("hit");
        }
      });

      for (let i = monsters.length - 1; i >= 0; i--) {
        if (monsters[i].hp > 0) continue;
        const killed = monsters[i];
        monsters.splice(i, 1);
        burst(killed.x, killed.y, "#b495bc", killed.isBoss ? 24 : 12, 46);

        if (killed.isDemon) {
          defeatDemonGod(killed);
        } else if (Math.random() < 0.28) {
          const storedCrystal = addToStorage("crystal", 1);
          if (storedCrystal > 0) {
            floatText(killed.x, killed.y - 4, "+1 crystal at home", "#9ce0d3");
            saveProgress();
            upgradeRenderKey = "";
            villageUpgradeRenderKey = "";
          }
        }
      }
    }

    function defeatDemonGod(demon) {
      const crystalReward = 12 + demon.tier * 8;
      boss = null;
      demonFightActive = false;
      demonResolvedTonight = true;
      demonProjectiles = [];
      progress.demonCores += 1;
      progress.demonVictories += 1;
      const storedCrystals = addToStorage("crystal", crystalReward);
      player.hp = Math.min(maxHp(), player.hp + 35 + demon.tier * 5);
      phaseTime = Math.min(phaseTime, 4);
      saveProgress();
      upgradeRenderKey = "";
      villageUpgradeRenderKey = "";
      sfx("victory");
      burst(demon.x, demon.y, "#f2c468", 32, 58);
      floatText(demon.x, demon.y - 18, "+1 DEMON CORE", "#fff0a8");
      showMessage(
        "The Demon God retreats. +1 Demon Core and +" + storedCrystals + " crystals return to the village." +
          (storedCrystals < crystalReward ? " The storehouse could not hold the rest." : ""),
        5
      );
    }

    function updatePlayer(dt) {
      let dx = 0;
      let dy = 0;
      if (keys.has("KeyW") || keys.has("ArrowUp")) dy -= 1;
      if (keys.has("KeyS") || keys.has("ArrowDown")) dy += 1;
      if (keys.has("KeyA") || keys.has("ArrowLeft")) dx -= 1;
      if (keys.has("KeyD") || keys.has("ArrowRight")) dx += 1;

      moving = dx !== 0 || dy !== 0;
      if (moving) {
        const length = Math.hypot(dx, dy);
        dx /= length;
        dy /= length;
        player.facingX = dx;
        player.facingY = dy;
        const speed = moveSpeed();
        player.x = clamp(player.x + dx * speed * dt, player.radius, WORLD.width - player.radius);
        player.y = clamp(player.y + dy * speed * dt, player.radius, WORLD.height - player.radius);
        walkClock += dt * 9;
      }

      if (keys.has("KeyE")) gather();
      if (keys.has("Space")) attack();
      if (inVillage()) depositHeld(false);
      updateHouseInteraction();
    }

    function hurtPlayer(sourceX, sourceY, damage, knockback) {
      if (player.invulnerability > 0 || gameOver) return false;
      const dx = player.x - sourceX;
      const dy = player.y - sourceY;
      const distance = Math.max(1, Math.hypot(dx, dy));
      const actualDamage = damage * (1 - damageReduction());
      player.hp -= actualDamage;
      player.invulnerability = 0.38;
      const push = knockback || 12;
      player.x = clamp(player.x + (dx / distance) * push, player.radius, WORLD.width - player.radius);
      player.y = clamp(player.y + (dy / distance) * push, player.radius, WORLD.height - player.radius);
      burst(player.x, player.y, "#d88a72", 7, 28);
      floatText(player.x, player.y - 10, "-" + Math.ceil(actualDamage), "#ffd4b0");
      sfx("hit");
      if (player.hp <= 0) {
        knockOut();
        return true;
      }
      return false;
    }

    function spawnDemonProjectile(demon, angle, speed, damage, color) {
      demonProjectiles.push({
        x: demon.x,
        y: demon.y - 3,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: 4,
        damage: damage,
        color: color || "#e27864",
        life: 5.2
      });
    }

    function startDemonCharge(demon) {
      const dx = player.x - demon.x;
      const dy = player.y - demon.y;
      const distance = Math.max(1, Math.hypot(dx, dy));
      demon.dashVX = dx / distance;
      demon.dashVY = dy / distance;
      demon.dashWindup = 0.54;
      demon.patternLabel = "HELLSTEP";
      floatText(demon.x, demon.y - 24, "HELLSTEP", "#ffd3a0");
    }

    function launchDemonRing(demon) {
      const count = 6 + Math.min(8, demon.tier * 2);
      const start = elapsed * 0.8 + demon.phase;
      for (let i = 0; i < count; i++) {
        spawnDemonProjectile(
          demon,
          start + Math.PI * 2 * i / count,
          82 + demon.tier * 4,
          10 + demon.tier * 2,
          "#d86d62"
        );
      }
      demon.patternLabel = "EMBER RING";
      burst(demon.x, demon.y, "#e27e65", 12, 32);
    }

    function launchDemonFan(demon) {
      const base = Math.atan2(player.y - demon.y, player.x - demon.x);
      const count = 3 + Math.min(4, demon.tier);
      for (let i = 0; i < count; i++) {
        const offset = (i - (count - 1) / 2) * 0.23;
        spawnDemonProjectile(demon, base + offset, 112 + demon.tier * 4, 12 + demon.tier * 2, "#e7a452");
      }
      demon.patternLabel = "CINDER FAN";
      burst(demon.x, demon.y, "#f1b861", 10, 28);
    }

    function launchDemonSpiral(demon) {
      const count = 10 + Math.min(6, demon.tier);
      const start = elapsed * 1.7 + demon.phase;
      for (let i = 0; i < count; i++) {
        spawnDemonProjectile(
          demon,
          start + Math.PI * 2 * i / count,
          70 + demon.tier * 5,
          11 + demon.tier * 2,
          "#c66f9f"
        );
      }
      demon.patternLabel = "SOUL SPIRAL";
      burst(demon.x, demon.y, "#d987b5", 16, 38);
    }

    function triggerDemonPattern(demon) {
      const patterns = ["charge"];
      if (demon.tier >= 2) patterns.push("ring");
      if (demon.tier >= 3) patterns.push("fan");
      if (demon.tier >= 4) patterns.push("spiral");
      const pattern = patterns[demon.patternStep % patterns.length];
      demon.patternStep += 1;
      demon.patternCooldown = Math.max(1.45, 3.5 - demon.tier * 0.13);
      if (pattern === "charge") startDemonCharge(demon);
      if (pattern === "ring") launchDemonRing(demon);
      if (pattern === "fan") launchDemonFan(demon);
      if (pattern === "spiral") launchDemonSpiral(demon);
    }

    function updateDemonGod(demon, dt) {
      if (demon.dashWindup > 0) {
        demon.dashWindup = Math.max(0, demon.dashWindup - dt);
        if (demon.dashWindup <= 0) demon.dashTime = 0.40;
        return;
      }

      if (demon.dashTime > 0) {
        demon.x = clamp(demon.x + demon.dashVX * (220 + demon.tier * 10) * dt, 22, WORLD.width - 22);
        demon.y = clamp(demon.y + demon.dashVY * (220 + demon.tier * 10) * dt, 22, WORLD.height - 22);
        demon.dashTime = Math.max(0, demon.dashTime - dt);
      } else {
        const dx = player.x - demon.x;
        const dy = player.y - demon.y;
        const distance = Math.max(1, Math.hypot(dx, dy));
        const sway = Math.sin(elapsed * 1.8 + demon.phase) * 0.34;
        demon.x = clamp(demon.x + ((dx / distance) - (dy / distance) * sway) * demon.speed * dt, 22, WORLD.width - 22);
        demon.y = clamp(demon.y + ((dy / distance) + (dx / distance) * sway) * demon.speed * dt, 22, WORLD.height - 22);
      }

      demon.patternCooldown -= dt;
      if (demon.patternCooldown <= 0 && demon.dashTime <= 0) triggerDemonPattern(demon);

      const distance = Math.hypot(player.x - demon.x, player.y - demon.y);
      if (distance < player.radius + demon.radius + 4 && demon.hitCooldown <= 0) {
        demon.hitCooldown = 0.72;
        hurtPlayer(demon.x, demon.y, demon.damage, 18);
      }
    }

    function updateDemonProjectiles(dt) {
      demonProjectiles.forEach(function(projectile) {
        projectile.x += projectile.vx * dt;
        projectile.y += projectile.vy * dt;
        projectile.life -= dt;
        if (
          projectile.life > 0 &&
          Math.hypot(player.x - projectile.x, player.y - projectile.y) < player.radius + projectile.radius
        ) {
          hurtPlayer(projectile.x, projectile.y, projectile.damage, 9);
          projectile.life = 0;
        }
      });
      demonProjectiles = demonProjectiles.filter(function(projectile) {
        return projectile.life > 0 &&
          projectile.x > -20 && projectile.y > -20 &&
          projectile.x < WORLD.width + 20 && projectile.y < WORLD.height + 20;
      });
    }

    function updateMonsters(dt) {
      if (phase !== "night") return;

      if (!demonFightActive && !demonResolvedTonight) {
        updateNightEscalation(dt);
        enemySpawnTimer -= dt;
        const intensity = nightIntensity();
        const desiredCount = Math.min(4 + demonTier() * 2 + Math.floor(intensity * 8), 28);
        if (enemySpawnTimer <= 0 && monsters.length < desiredCount) {
          spawnMonster();
          enemySpawnTimer = Math.max(0.48, (2.25 - demonTier() * 0.08) * (1 - intensity * 0.56));
        }
      }

      for (const monster of monsters) {
        monster.hitCooldown = Math.max(0, monster.hitCooldown - dt);
        monster.flash = Math.max(0, monster.flash - dt);

        if (monster.isDemon) {
          updateDemonGod(monster, dt);
          if (gameOver) return;
          continue;
        }

        if (inVillage(player)) {
          const awayX = monster.x - VILLAGE.x;
          const awayY = monster.y - VILLAGE.y;
          const length = Math.max(1, Math.hypot(awayX, awayY));
          monster.x += (awayX / length) * monster.speed * 0.56 * dt;
          monster.y += (awayY / length) * monster.speed * 0.56 * dt;
          continue;
        }

        const dx = player.x - monster.x;
        const dy = player.y - monster.y;
        const distance = Math.max(1, Math.hypot(dx, dy));
        monster.x += (dx / distance) * monster.speed * dt;
        monster.y += (dy / distance) * monster.speed * dt;

        if (distance < player.radius + monster.radius + 3 && monster.hitCooldown <= 0) {
          monster.hitCooldown = 0.68;
          if (hurtPlayer(monster.x, monster.y, monster.damage, 12)) return;
        }
      }

      updateNightHazards(dt);
      updateDemonProjectiles(dt);
    }

    function updateParticles(dt) {
      particles.forEach(function(particle) {
        particle.life -= dt;
        particle.x += particle.vx * dt;
        particle.y += particle.vy * dt;
        particle.vy += particle.gravity * dt;
        particle.vx *= 0.96;
      });
      particles = particles.filter(function(particle) {
        return particle.life > 0;
      });
    }

    function updateCamera(dt) {
      const targetX = clamp(player.x - VIEW.width / 2, 0, WORLD.width - VIEW.width);
      const targetY = clamp(player.y - VIEW.height / 2, 0, WORLD.height - VIEW.height);
      const amount = REDUCE_MOTION ? 1 : 1 - Math.exp(-dt * 8);
      cameraState.x = lerp(cameraState.x, targetX, amount);
      cameraState.y = lerp(cameraState.y, targetY, amount);
    }

    function updateContextHint() {
      const closeResource = nearestResource(34);
      if (closeResource) {
        ui.contextHint.classList.add("show");
        if (totalHeld() >= bagCapacity()) {
          ui.contextText.textContent = "Pack full — return home";
        } else {
          ui.contextText.textContent = "Gather " + resourceDefs[closeResource.type].label;
        }
      } else if (phase === "night" && inVillage()) {
        ui.contextHint.classList.add("show");
        ui.contextText.textContent = demonFightActive
          ? "The Demon God ignores the lantern circle"
          : "The lantern circle is safe";
      } else {
        ui.contextHint.classList.remove("show");
      }
    }

    function update(dt) {
      if (paused) return;
      elapsed += dt;
      gatherCooldown = Math.max(0, gatherCooldown - dt);
      attackCooldown = Math.max(0, attackCooldown - dt);
      player.invulnerability = Math.max(0, player.invulnerability - dt);

      if (messageTimer > 0) {
        messageTimer -= dt;
        if (messageTimer <= 0) ui.message.classList.remove("show");
      }

      updatePlayer(dt);
      updateAnimalResources(dt);
      updateWorkers(dt);
      updateMonsters(dt);
      updateParticles(dt);
      updateCamera(dt);
      if (!demonFightActive) phaseTime -= dt;

      if (phase === "day" && phaseTime <= 0) {
        startNight();
      } else if (phase === "night") {
        if (!demonFightActive && phaseTime <= 0) startDay();
      }

      replenishResources();
      updateContextHint();
      updateMultiplayer(dt);
      updateUI();
    }

    function camera() {
      return {
        x: Math.round(cameraState.x),
        y: Math.round(cameraState.y)
      };
    }

    function visible(x, y, margin, cam) {
      return x >= cam.x - margin &&
        y >= cam.y - margin &&
        x <= cam.x + VIEW.width + margin &&
        y <= cam.y + VIEW.height + margin;
    }

    function fillRect(x, y, width, height, color, context) {
      const target = context || ctx;
      target.fillStyle = color;
      target.fillRect(Math.round(x), Math.round(y), Math.round(width), Math.round(height));
    }

    function polygon(points, color, context) {
      const target = context || ctx;
      target.beginPath();
      target.moveTo(Math.round(points[0][0]), Math.round(points[0][1]));
      for (let i = 1; i < points.length; i++) {
        target.lineTo(Math.round(points[i][0]), Math.round(points[i][1]));
      }
      target.closePath();
      target.fillStyle = color;
      target.fill();
    }

    function drawGround(cam) {
      const dusk = phase === "day" ? clamp((12 - phaseTime) / 12, 0, 1) : 1;
      ctx.fillStyle = phase === "day" ? "#426c4b" : "#314d49";
      ctx.fillRect(0, 0, VIEW.width, VIEW.height);

      const tile = 16;
      const startX = Math.floor(cam.x / tile) * tile;
      const startY = Math.floor(cam.y / tile) * tile;
      for (let worldY = startY; worldY < cam.y + VIEW.height + tile; worldY += tile) {
        for (let worldX = startX; worldX < cam.x + VIEW.width + tile; worldX += tile) {
          const roll = hash2(worldX / tile, worldY / tile);
          const x = worldX - cam.x;
          const y = worldY - cam.y;
          if (roll < 0.18) {
            fillRect(x + 2, y + 4, 2, 1, phase === "day" ? "#527a54" : "#3c5b51");
            fillRect(x + 12, y + 11, 1, 2, phase === "day" ? "#315f45" : "#294744");
          } else if (roll > 0.84) {
            fillRect(x + 6, y + 8, 3, 1, phase === "day" ? "#3a6448" : "#294b47");
          }
        }
      }

      drawPaths(cam);

      if (dusk > 0 && phase === "day") {
        ctx.fillStyle = "rgba(142, 78, 74, " + (dusk * 0.10) + ")";
        ctx.fillRect(0, 0, VIEW.width, VIEW.height);
      }
    }

    function drawPaths(cam) {
      const cx = VILLAGE.x - cam.x;
      const cy = VILLAGE.y - cam.y;
      const reach = streetReach();
      const level = progress.village.streets;
      ctx.save();
      ctx.lineCap = "square";
      ctx.strokeStyle = phase === "day" ? "#927852" : "#665b4f";
      ctx.lineWidth = 28 + level * 6;
      ctx.beginPath();
      ctx.moveTo(cx - reach, cy);
      ctx.lineTo(cx + reach, cy);
      ctx.moveTo(cx, cy - reach);
      ctx.lineTo(cx, cy + reach);
      ctx.stroke();
      ctx.strokeStyle = phase === "day" ? "#a1885c" : "#75685a";
      ctx.lineWidth = 18 + level * 4;
      ctx.stroke();
      ctx.restore();

      for (let offset = -reach; offset <= reach; offset += 24) {
        const horizontalX = VILLAGE.x + offset;
        const verticalY = VILLAGE.y + offset;
        const wobble = Math.round((hash2(offset, 17) - 0.5) * 8);
        if (visible(horizontalX, VILLAGE.y, 8, cam)) {
          fillRect(horizontalX - cam.x - 4, VILLAGE.y - cam.y + wobble - 2, 9, 3, "#b49a6b");
        }
        if (visible(VILLAGE.x, verticalY, 8, cam)) {
          fillRect(VILLAGE.x - cam.x + wobble - 4, verticalY - cam.y - 2, 9, 3, "#b49a6b");
        }
      }
    }

    function drawScenery(cam) {
      scenery.forEach(function(item) {
        if (!visible(item.x, item.y, 14, cam)) return;
        const x = Math.round(item.x - cam.x);
        const y = Math.round(item.y - cam.y);
        if (item.kind === "grass") {
          const dark = item.tint > 0.5 ? "#315f43" : "#3a6847";
          fillRect(x, y - 2, 1, 4, dark);
          fillRect(x - 2, y - 1, 2, 1, dark);
          fillRect(x + 1, y, 2, 1, dark);
        } else if (item.kind === "flower") {
          fillRect(x, y - 2, 1, 4, "#3c6644");
          const flowerColors = ["#efd07b", "#d88671", "#d8c2db", "#f2e4b0"];
          fillRect(x - 1, y - 3, 3, 2, flowerColors[item.variant]);
        } else if (item.kind === "bush") {
          fillRect(x - 5, y - 2, 11, 5, "#315b42");
          fillRect(x - 3, y - 5, 7, 5, item.tint > 0.5 ? "#4b754b" : "#456f48");
          if (item.variant === 2) fillRect(x + 1, y - 4, 1, 1, "#d6a25f");
        } else if (item.kind === "mushroom") {
          fillRect(x, y - 1, 1, 3, "#dfc89c");
          fillRect(x - 2, y - 3, 5, 2, item.variant % 2 ? "#c26c58" : "#e0b568");
        } else {
          fillRect(x - 4, y - 3, 8, 5, "#694b34");
          fillRect(x - 3, y - 4, 6, 2, "#a9794f");
          fillRect(x - 1, y - 4, 2, 1, "#664632");
        }
      });
    }

    function drawVillageBase(cam) {
      const x = Math.round(VILLAGE.x - cam.x);
      const y = Math.round(VILLAGE.y - cam.y);
      const radius = villageRadius();
      const growth = progress.village.center;
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(x, y, radius, radius * 0.82, 0, 0, Math.PI * 2);
      ctx.fillStyle = phase === "day" ? "#9d8558" : "#6f6556";
      ctx.fill();
      ctx.strokeStyle = phase === "day" ? "#d1ae6d" : "#a18965";
      ctx.lineWidth = 3;
      ctx.setLineDash([7, 4]);
      ctx.stroke();
      ctx.restore();

      drawFence(x - 78 - growth * 6, y - 58 - growth * 4, 42 + growth * 4, false);
      drawFence(x + 41 + growth * 4, y - 59 - growth * 4, 38 + growth * 4, false);
      drawFence(x - 84 - growth * 6, y + 56 + growth * 4, 40 + growth * 4, false);
      drawFence(x + 45 + growth * 4, y + 57 + growth * 4, 36 + growth * 4, false);

      HOUSES.forEach(function(house) {
        drawHouse(
          Math.round(house.x - cam.x),
          Math.round(house.footY - cam.y),
          house.variant,
          house.sign
        );
      });
      drawVillageCenterGrowth(x, y, growth);
      drawCampfire(x, y + 5);
      drawVillageSign(x, y + 78);
    }

    function drawVillageCenterGrowth(x, y, level) {
      for (let step = 1; step <= level; step++) {
        const angle = step * Math.PI * 2 / 5 - 0.55;
        const distance = 27 + step * 7;
        const px = Math.round(x + Math.cos(angle) * distance);
        const py = Math.round(y + Math.sin(angle) * distance);
        fillRect(px - 5, py - 2, 11, 5, "#7c543d");
        fillRect(px - 4, py - 4, 9, 3, "#d0a15f");
        fillRect(px - 1, py - 8, 3, 5, "#b95f4e");
        if (step >= 3) fillRect(px + 4, py - 8, 2, 7, "#e4c16d");
      }
    }

    function drawFence(x, y, length) {
      fillRect(x, y, length, 2, "#6b4535");
      for (let offset = 1; offset < length; offset += 8) {
        fillRect(x + offset, y - 3, 3, 8, "#c79a5d");
        fillRect(x + offset + 1, y - 4, 1, 1, "#ead29a");
      }
    }

    function drawHouse(cx, footY, variant, sign) {
      const palettes = [
        ["#d9b272", "#9f5847", "#f0cd80"],
        ["#c8a36b", "#77505a", "#f3d68e"],
        ["#d3ad71", "#7e704a", "#f5d88e"],
        ["#c99867", "#a25d45", "#efd18a"]
      ];
      const colors = palettes[variant];
      const width = 35 + (variant % 2) * 4;
      const left = Math.round(cx - width / 2);
      const top = footY - 25;
      fillRect(left - 3, footY - 2, width + 6, 4, "rgba(53,37,35,0.28)");
      fillRect(left, top, width, 24, colors[0]);
      fillRect(left + width - 5, top + 2, 5, 22, "#a47855");

      polygon([
        [left - 4, top + 2],
        [left + width / 2, top - 14],
        [left + width + 4, top + 2],
        [left + width, top + 7],
        [left - 1, top + 7]
      ], colors[1]);
      fillRect(left + 3, top + 2, width - 6, 3, "#bc6d52");
      fillRect(left + Math.floor(width / 2) - 4, footY - 13, 8, 13, "#64483a");
      fillRect(left + Math.floor(width / 2) - 2, footY - 10, 4, 10, "#8b6447");
      fillRect(left + 5, top + 10, 6, 7, phase === "night" ? "#f3ce75" : "#9cc0b2");
      fillRect(left + 6, top + 11, 4, 5, phase === "night" ? "#ffe8a4" : "#c9dfca");
      fillRect(left + width - 11, top - 9, 5, 10, "#6c4438");

      const smoke = Math.sin(elapsed * 1.2 + variant) * 2;
      if (!REDUCE_MOTION) {
        fillRect(left + width - 10 + smoke, top - 15, 4, 3, "rgba(233,219,188,0.44)");
        fillRect(left + width - 7 - smoke, top - 21, 3, 3, "rgba(233,219,188,0.28)");
      }

      if (sign) {
        const signWidth = Math.max(25, sign.length * 4);
        fillRect(Math.round(cx - signWidth / 2), top - 25, signWidth, 7, "#654338");
        fillRect(Math.round(cx - signWidth / 2) + 1, top - 24, signWidth - 2, 5, "#e2b86e");
        ctx.fillStyle = "#50362f";
        ctx.font = "bold 4px monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(sign, cx, top - 21);
      }
    }

    function drawCampfire(x, y) {
      fillRect(x - 8, y + 5, 16, 3, "#553b32");
      fillRect(x - 6, y + 4, 12, 2, "#8a583d");
      const flicker = Math.floor(elapsed * 8) % 2;
      polygon([[x, y - 10 - flicker], [x + 6, y + 3], [x, y], [x - 6, y + 3]], "#d66a42");
      polygon([[x, y - 7], [x + 3, y + 1], [x, y - 1], [x - 3, y + 1]], "#f2bd54");
      fillRect(x - 1, y - 4, 2, 5, "#fff0a0");
    }

    function drawVillageSign(x, y) {
      fillRect(x - 17, y - 4, 34, 11, "#6e4634");
      fillRect(x - 14, y - 2, 28, 7, "#d4a75f");
      fillRect(x - 12, y + 7, 3, 7, "#6e4634");
      fillRect(x + 9, y + 7, 3, 7, "#6e4634");
      ctx.fillStyle = "#57392f";
      ctx.font = "bold 6px monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("HOME", x, y + 2);
    }

    function drawResources(cam) {
      resources
        .filter(function(resource) { return visible(resource.x, resource.y, 24, cam); })
        .sort(function(a, b) { return a.y - b.y; })
        .forEach(function(resource) {
          const x = Math.round(resource.x - cam.x);
          const y = Math.round(resource.y - cam.y);
          const near = Math.hypot(player.x - resource.x, player.y - resource.y) < 34;
          if (resource.type === "wood") drawTree(x, y, resource.variant, near);
          if (resource.type === "stone") drawStone(x, y, resource.variant, near);
          if (resource.type === "crystal") drawCrystal(x, y, resource.variant, near);
          if (resource.type === "hide") drawHare(x, y, resource, near);
        });
    }

    function drawTree(x, y, variant, near) {
      fillRect(x - 8, y + 5, 17, 4, "rgba(41,39,32,0.25)");
      fillRect(x - 2, y - 2, 5, 11, "#6e4630");
      fillRect(x + 1, y, 2, 7, "#9a6740");
      const dark = variant % 2 ? "#456d46" : "#3d6844";
      const light = variant % 2 ? "#719153" : "#678d50";
      fillRect(x - 8, y - 13, 17, 13, dark);
      fillRect(x - 5, y - 17, 12, 17, dark);
      fillRect(x - 11, y - 9, 22, 8, dark);
      fillRect(x - 4, y - 15, 8, 5, light);
      fillRect(x - 9, y - 7, 7, 4, light);
      fillRect(x + 4, y - 9, 5, 4, "#567b48");
      if (near) drawSelection(x, y - 5, 15, "#fff1b0");
    }

    function drawStone(x, y, variant, near) {
      fillRect(x - 9, y + 4, 19, 3, "rgba(38,38,35,0.25)");
      polygon([
        [x - 9, y + 4],
        [x - 7, y - 5],
        [x - 2, y - 10],
        [x + 6, y - 8],
        [x + 10, y - 1],
        [x + 6, y + 5]
      ], variant % 2 ? "#7f8982" : "#868b84");
      polygon([[x - 6, y - 4], [x - 1, y - 8], [x + 3, y - 6], [x, y - 2]], "#aeb0a2");
      fillRect(x + 4, y - 3, 3, 4, "#68766e");
      fillRect(x - 5, y + 1, 4, 2, "#6f865f");
      if (near) drawSelection(x, y - 2, 13, "#fff1b0");
    }

    function drawCrystal(x, y, variant, near) {
      if (phase === "night") {
        ctx.save();
        ctx.globalAlpha = 0.12 + Math.sin(elapsed * 2 + variant) * 0.03;
        ctx.fillStyle = "#a2eee0";
        ctx.beginPath();
        ctx.arc(x, y - 4, 17, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      fillRect(x - 8, y + 5, 16, 3, "rgba(31,40,40,0.25)");
      polygon([[x - 7, y + 5], [x - 5, y - 6], [x - 1, y - 10], [x + 2, y - 3], [x + 1, y + 6]], "#5ca89f");
      polygon([[x, y + 5], [x + 3, y - 13], [x + 8, y - 5], [x + 7, y + 5]], "#78c7bc");
      polygon([[x + 3, y - 11], [x + 5, y - 5], [x + 2, y + 2]], "#c2ead8");
      if (near) drawSelection(x, y - 3, 13, "#d8fff2");
    }

    function drawHare(x, y, hare, near) {
      const direction = Math.cos(hare.wanderAngle) >= 0 ? 1 : -1;
      const hop = Math.round(Math.abs(Math.sin(hare.phase)) * 2);
      const body = hare.variant % 2 ? "#b88260" : "#a87455";
      const light = hare.variant % 2 ? "#d8af87" : "#cea079";
      fillRect(x - 7, y + 5, 15, 3, "rgba(38,31,31,0.24)");
      fillRect(x - 6, y - 2 - hop, 11, 7, body);
      fillRect(x + direction * 4, y - 5 - hop, 5, 6, light);
      fillRect(x + direction * 5, y - 12 - hop, 2, 8, body);
      fillRect(x + direction * 1, y - 11 - hop, 2, 7, body);
      fillRect(x + direction * 6, y - 3 - hop, 1, 1, "#382c2c");
      fillRect(x - direction * 7, y, 3, 2, "#f0e0ca");
      fillRect(x - 4, y + 4 - hop, 3, 3, "#76513d");
      fillRect(x + 2, y + 4 - hop, 3, 3, "#76513d");
      if (near) drawSelection(x, y - 3, 14, "#ffe3a6");
    }

    function drawSelection(x, y, radius, color) {
      const pulse = Math.floor(elapsed * 4) % 2;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 2]);
      ctx.strokeRect(x - radius - pulse, y - radius, (radius + pulse) * 2, radius * 2);
      ctx.setLineDash([]);
    }

    function drawWorkers(cam) {
      workers
        .slice()
        .sort(function(a, b) { return a.y - b.y; })
        .forEach(function(worker) {
          if (!visible(worker.x, worker.y, 14, cam)) return;
          const x = Math.round(worker.x - cam.x);
          const y = Math.round(worker.y - cam.y);
          const step = Math.round(Math.sin(worker.walkClock));
          const carrying = worker.carryType ? resourceDefs[worker.carryType].color : "#7d6246";
          fillRect(x - 5, y + 6, 11, 3, "rgba(36,30,30,0.25)");
          fillRect(x - 3, y + 2 + step, 2, 5 - step, "#4d3c36");
          fillRect(x + 2, y + 2 - step, 2, 5 + step, "#4d3c36");
          fillRect(x - 5, y - 5, 11, 10, worker.id % 2 ? "#6d8f72" : "#7897a1");
          fillRect(x - 4, y - 12, 9, 8, "#d7a47c");
          fillRect(x - 5, y - 13, 11, 4, "#62463b");
          fillRect(x - 3, y - 8, 1, 1, "#3b2e2d");
          fillRect(x + 2, y - 8, 1, 1, "#3b2e2d");
          fillRect(x + 5, y - 2, 4, 6, carrying);
          fillRect(x + 6, y - 1, 2, 4, "rgba(255,255,255,0.2)");
        });
    }

    function drawMonsters(cam) {
      monsters
        .slice()
        .sort(function(a, b) { return a.y - b.y; })
        .forEach(function(monster) {
          const x = Math.round(monster.x - cam.x);
          const y = Math.round(monster.y - cam.y);
          if (monster.isBoss) drawBossSprite(x, y, monster);
          else drawGloamSprite(x, y, monster);
          drawMonsterBar(x, y, monster);
        });
      drawNightHazards(cam);
      drawDemonProjectiles(cam);
    }

    function drawGloamSprite(x, y, monster) {
      const bob = Math.round(Math.sin(elapsed * 5 + monster.phase));
      const isBrute = monster.kind === "brute";
      const isRunner = monster.kind === "runner";
      const body = monster.flash > 0
        ? "#d7b8d8"
        : isBrute
          ? "#70485e"
          : isRunner
            ? "#4d5c7a"
            : "#5c4966";
      const width = isBrute ? 20 : isRunner ? 11 : 15;
      const half = Math.floor(width / 2);
      fillRect(x - half, y + 5, width, 3, "rgba(25,20,31,0.34)");
      fillRect(x - half, y - 5 + bob, width, isBrute ? 13 : isRunner ? 8 : 10, body);
      fillRect(x - half + 2, y - (isBrute ? 10 : 8) + bob, width - 4, isBrute ? 20 : isRunner ? 12 : 15, body);
      polygon([[x - half + 1, y - 6 + bob], [x - half - 2, y - (isBrute ? 15 : 12) + bob], [x - 2, y - 8 + bob]], body);
      polygon([[x + half - 1, y - 6 + bob], [x + half + 2, y - (isBrute ? 15 : 12) + bob], [x + 1, y - 8 + bob]], body);
      fillRect(x - 4, y - 3 + bob, 3, 2, isRunner ? "#9fd7ef" : "#e9cf7c");
      fillRect(x + 2, y - 3 + bob, 3, 2, isRunner ? "#9fd7ef" : "#e9cf7c");
      if (isBrute) fillRect(x - 3, y + 1 + bob, 7, 2, "#b57975");
      if (isRunner) fillRect(x - 6, y + 2 + bob, 12, 2, "#8bb2d1");
    }

    function drawNightHazards(cam) {
      nightHazards.forEach(function(hazard) {
        if (!visible(hazard.x, hazard.y, hazard.radius + 3, cam)) return;
        const x = Math.round(hazard.x - cam.x);
        const y = Math.round(hazard.y - cam.y);
        const warningRatio = clamp(hazard.warning / 0.78, 0, 1);
        ctx.save();
        ctx.globalAlpha = hazard.struck ? Math.max(0, hazard.life / 0.3) * 0.46 : 0.24 + (1 - warningRatio) * 0.42;
        ctx.strokeStyle = hazard.struck ? "#f2b56b" : "#c980bc";
        ctx.lineWidth = hazard.struck ? 4 : 2;
        ctx.beginPath();
        ctx.arc(x, y, hazard.radius * (hazard.struck ? 0.82 : 1), 0, Math.PI * 2);
        ctx.stroke();
        if (hazard.struck) {
          ctx.fillStyle = "#b06a9c";
          ctx.beginPath();
          ctx.arc(x, y, hazard.radius * 0.7, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      });
    }

    function drawBossSprite(x, y, monster) {
      const bob = Math.round(Math.sin(elapsed * 3 + monster.phase));
      const body = monster.flash > 0 ? "#f0c8c2" : (monster.tier >= 4 ? "#512f58" : "#5b3b50");
      if (monster.dashWindup > 0) {
        ctx.save();
        ctx.globalAlpha = 0.32 + Math.sin(elapsed * 18) * 0.16;
        ctx.fillStyle = "#f07c5c";
        ctx.beginPath();
        ctx.arc(x, y - 4, 27, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      fillRect(x - 14, y + 10, 29, 5, "rgba(24,18,28,0.38)");
      fillRect(x - 13, y - 8 + bob, 27, 18, body);
      fillRect(x - 10, y - 14 + bob, 21, 27, body);
      polygon([[x - 9, y - 11 + bob], [x - 17, y - 22 + bob], [x - 11, y - 5 + bob]], "#7f5a53");
      polygon([[x + 9, y - 11 + bob], [x + 17, y - 22 + bob], [x + 11, y - 5 + bob]], "#7f5a53");
      fillRect(x - 7, y - 7 + bob, 5, 3, "#f3c96d");
      fillRect(x + 3, y - 7 + bob, 5, 3, "#f3c96d");
      fillRect(x - 1, y - 20 + bob, 3, 5, "#d89b52");
      fillRect(x - 7, y - 18 + bob, 15, 3, "#d89b52");
      fillRect(x - 10, y - 21 + bob, 4, 5, "#d89b52");
      fillRect(x + 7, y - 21 + bob, 4, 5, "#d89b52");
      fillRect(x - 3, y + 1 + bob, 6, 2, monster.dashTime > 0 ? "#fff0b0" : "#a96377");
    }

    function drawDemonProjectiles(cam) {
      demonProjectiles.forEach(function(projectile) {
        if (!visible(projectile.x, projectile.y, 8, cam)) return;
        const x = Math.round(projectile.x - cam.x);
        const y = Math.round(projectile.y - cam.y);
        ctx.save();
        ctx.globalAlpha = clamp(projectile.life / 0.7, 0.35, 1);
        ctx.fillStyle = projectile.color;
        ctx.beginPath();
        ctx.arc(x, y, projectile.radius + 2, 0, Math.PI * 2);
        ctx.fill();
        fillRect(x - 1, y - 1, 3, 3, "#fff0ae");
        ctx.restore();
      });
    }

    function drawMonsterBar(x, y, monster) {
      const width = monster.isBoss ? 38 : 20;
      const top = y - monster.radius - (monster.isBoss ? 19 : 12);
      fillRect(x - width / 2 - 1, top - 1, width + 2, 5, "#352a33");
      fillRect(
        x - width / 2,
        top,
        width * Math.max(0, monster.hp / monster.maxHp),
        3,
        monster.isBoss ? "#d49a4c" : "#a26c87"
      );
      if (monster.isDemon) {
        ctx.fillStyle = "#ffe4a8";
        ctx.font = "bold 6px monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        ctx.fillText("DEMON GOD T" + monster.tier + " · " + monster.patternLabel, x, top - 2);
      }
    }

    function drawRemotePlayers(cam) {
      multiplayer.players.forEach(function(remotePlayer, id) {
        if (!remotePlayer || !visible(remotePlayer.x, remotePlayer.y, 18, cam)) return;
        const x = Math.round(remotePlayer.x - cam.x);
        const y = Math.round(remotePlayer.y - cam.y);
        const hue = Array.from(id).reduce(function(total, character) {
          return total + character.charCodeAt(0);
        }, 0) % 2;
        const tunic = hue ? "#5d88a7" : "#78a070";
        fillRect(x - 7, y + 7, 15, 3, "rgba(38,31,31,0.3)");
        fillRect(x - 4, y + 3, 3, 6, "#4c3731");
        fillRect(x + 2, y + 3, 3, 6, "#4c3731");
        fillRect(x - 6, y - 6, 12, 11, tunic);
        fillRect(x - 5, y - 5, 10, 4, hue ? "#8fb7d0" : "#9cc58c");
        fillRect(x - 4, y - 12, 9, 8, "#d7a77d");
        fillRect(x - 5, y - 13, 10, 4, "#65443a");
        fillRect(x - 2, y - 8, 1, 1, "#473531");
        fillRect(x + 2, y - 8, 1, 1, "#473531");
        ctx.fillStyle = "#dff4ff";
        ctx.font = "bold 6px monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        ctx.fillText("ALLY", x, y - 17);
      });
    }

    function drawPlayer(cam) {
      const x = Math.round(player.x - cam.x);
      const y = Math.round(player.y - cam.y);
      const step = moving ? Math.round(Math.sin(walkClock)) : 0;
      const flashOff = player.invulnerability > 0 && Math.floor(player.invulnerability * 22) % 2 === 0;
      if (flashOff) ctx.globalAlpha = 0.38;

      fillRect(x - 7, y + 7, 15, 3, "rgba(38,31,31,0.3)");
      const facingDown = player.facingY > 0.45;
      const facingUp = player.facingY < -0.45;
      const facingSide = !facingDown && !facingUp;
      const sideDirection = player.facingX >= 0 ? 1 : -1;
      const bob = moving ? Math.abs(step) : 0;

      fillRect(x - 4, y + 3 + bob, 3, 6 + step, "#4c3731");
      fillRect(x + 2, y + 3 + bob, 3, 6 - step, "#4c3731");
      fillRect(x - 6, y - 6 + bob, 12, 11, "#bf6552");
      fillRect(x - 5, y - 5 + bob, 10, 4, "#d97a5d");

      if (facingUp) {
        fillRect(x - 5, y - 4 + bob, 10, 8, "#80513e");
        fillRect(x - 4, y - 12 + bob, 9, 8, "#d7a77d");
        fillRect(x - 5, y - 13 + bob, 10, 4, "#65443a");
        fillRect(x - 6, y - 9 + bob, 2, 6, "#65443a");
      } else if (facingDown) {
        fillRect(x - 4, y - 12 + bob, 9, 8, "#e0ad82");
        fillRect(x - 5, y - 13 + bob, 10, 4, "#65443a");
        fillRect(x - 5, y - 10 + bob, 2, 4, "#65443a");
        fillRect(x + 4, y - 10 + bob, 2, 4, "#65443a");
        fillRect(x - 2, y - 8 + bob, 1, 1, "#473531");
        fillRect(x + 2, y - 8 + bob, 1, 1, "#473531");
      } else {
        fillRect(x - 4, y - 12 + bob, 9, 8, "#dfa980");
        fillRect(x - 5, y - 13 + bob, 10, 4, "#65443a");
        fillRect(x - sideDirection * 5, y - 10 + bob, 2, 5, "#65443a");
        fillRect(x + sideDirection * 3, y - 8 + bob, 1, 1, "#473531");
        fillRect(x - sideDirection * 6, y - 3 + bob, 3, 7, "#80513e");
      }

      drawPlayerTool(x, y + bob, facingSide ? sideDirection : 0);
      if (attackCooldown > 0.20) drawSwing(x, y);
      ctx.globalAlpha = 1;
    }

    function drawPlayerTool(x, y, sideDirection) {
      const fx = player.facingX;
      const fy = player.facingY;
      const handX = x + Math.round(fx * 6) + (sideDirection ? sideDirection : 0);
      const handY = y - 2 + Math.round(fy * 3);
      ctx.save();
      ctx.translate(handX, handY);
      ctx.rotate(Math.atan2(fy, fx) + 0.55);
      fillRect(-1, -1, 2, 12, "#76513b");
      fillRect(-2, -3, 4, 4, "#d4b170");
      ctx.restore();
    }

    function drawSwing(x, y) {
      const angle = Math.atan2(player.facingY, player.facingX);
      ctx.save();
      ctx.strokeStyle = "rgba(255, 232, 163, 0.9)";
      ctx.lineWidth = 3;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.arc(x, y - 2, 27, angle - 0.82, angle + 0.82);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

    function drawParticles(cam) {
      particles.forEach(function(particle) {
        const alpha = clamp(particle.life / particle.maxLife, 0, 1);
        ctx.globalAlpha = alpha;
        if (particle.kind === "text") {
          ctx.fillStyle = particle.color;
          ctx.font = "bold 6px monospace";
          ctx.textAlign = "center";
          ctx.textBaseline = "bottom";
          ctx.fillText(particle.text, Math.round(particle.x - cam.x), Math.round(particle.y - cam.y));
        } else {
          fillRect(
            particle.x - cam.x - particle.size / 2,
            particle.y - cam.y - particle.size / 2,
            particle.size,
            particle.size,
            particle.color
          );
        }
      });
      ctx.globalAlpha = 1;
    }

    function drawFireflies(cam) {
      if (phase !== "night") return;
      fireflies.forEach(function(firefly) {
        const driftX = Math.sin(elapsed * firefly.speed + firefly.phase) * 3;
        const driftY = Math.cos(elapsed * firefly.speed * 0.7 + firefly.phase) * 2;
        const worldX = firefly.x + driftX;
        const worldY = firefly.y + driftY;
        if (!visible(worldX, worldY, 8, cam)) return;
        const pulse = 0.45 + Math.sin(elapsed * 3 + firefly.phase) * 0.35;
        ctx.globalAlpha = clamp(pulse, 0.15, 0.8);
        fillRect(worldX - cam.x - 1, worldY - cam.y - 1, 3, 3, "#f2d779");
        fillRect(worldX - cam.x, worldY - cam.y, 1, 1, "#fff4b0");
      });
      ctx.globalAlpha = 1;
    }

    function punchLight(context, x, y, innerRadius, outerRadius, strength) {
      const gradient = context.createRadialGradient(x, y, innerRadius, x, y, outerRadius);
      gradient.addColorStop(0, "rgba(0,0,0," + strength + ")");
      gradient.addColorStop(0.55, "rgba(0,0,0," + (strength * 0.7) + ")");
      gradient.addColorStop(1, "rgba(0,0,0,0)");
      context.fillStyle = gradient;
      context.beginPath();
      context.arc(x, y, outerRadius, 0, Math.PI * 2);
      context.fill();
    }

    function drawDarkness(cam) {
      if (phase !== "night") return;
      shadeCtx.clearRect(0, 0, VIEW.width, VIEW.height);
      shadeCtx.globalCompositeOperation = "source-over";
      shadeCtx.fillStyle = "rgba(25, 27, 53, 0.66)";
      shadeCtx.fillRect(0, 0, VIEW.width, VIEW.height);
      shadeCtx.globalCompositeOperation = "destination-out";
      punchLight(
        shadeCtx,
        VILLAGE.x - cam.x,
        VILLAGE.y - cam.y,
        40,
        villageRadius() + 32,
        0.92
      );
      punchLight(
        shadeCtx,
        player.x - cam.x,
        player.y - cam.y,
        12,
        62 + progress.upgrades.armor * 3,
        0.70
      );
      shadeCtx.globalCompositeOperation = "source-over";
      ctx.drawImage(shadeCanvas, 0, 0);

      const villageGlow = ctx.createRadialGradient(
        VILLAGE.x - cam.x,
        VILLAGE.y - cam.y,
        10,
        VILLAGE.x - cam.x,
        VILLAGE.y - cam.y,
        villageRadius() + 18
      );
      villageGlow.addColorStop(0, "rgba(255, 200, 91, 0.18)");
      villageGlow.addColorStop(1, "rgba(255, 200, 91, 0)");
      ctx.fillStyle = villageGlow;
      ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    }

    function drawVignette() {
      const gradient = ctx.createRadialGradient(
        VIEW.width / 2,
        VIEW.height / 2,
        VIEW.height * 0.25,
        VIEW.width / 2,
        VIEW.height / 2,
        VIEW.width * 0.68
      );
      gradient.addColorStop(0, "rgba(47,30,34,0)");
      gradient.addColorStop(1, phase === "night" ? "rgba(22,18,31,0.32)" : "rgba(63,39,34,0.17)");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    }

    function drawPaused() {
      ctx.fillStyle = "rgba(43, 32, 39, 0.72)";
      ctx.fillRect(0, 0, VIEW.width, VIEW.height);
      fillRect(VIEW.width / 2 - 68, VIEW.height / 2 - 26, 136, 52, "#f2d69d");
      ctx.strokeStyle = "#543731";
      ctx.lineWidth = 3;
      ctx.strokeRect(VIEW.width / 2 - 68, VIEW.height / 2 - 26, 136, 52);
      ctx.fillStyle = "#4a322f";
      ctx.font = "bold 14px Georgia";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("A quiet pause", VIEW.width / 2, VIEW.height / 2 - 5);
      ctx.font = "bold 6px monospace";
      ctx.fillText("PRESS ESC OR RESUME", VIEW.width / 2, VIEW.height / 2 + 13);
    }

    function render() {
      const cam = camera();
      drawGround(cam);
      drawScenery(cam);
      if (visible(VILLAGE.x, VILLAGE.y, villageRadius() + 35, cam)) drawVillageBase(cam);
      drawResources(cam);
      drawWorkers(cam);
      drawMonsters(cam);
      drawRemotePlayers(cam);
      drawPlayer(cam);
      drawParticles(cam);
      drawDarkness(cam);
      drawFireflies(cam);
      drawVignette();
      if (paused) drawPaused();
    }

    function costMarkup(cost) {
      return Object.entries(cost)
        .filter(function(entry) { return entry[1] > 0; })
        .map(function(entry) {
          const missing = progress.bank[entry[0]] < entry[1] ? " missing" : "";
          return '<span class="cost-pill' + missing + '">' +
            entry[1] + " " + entry[0] +
            "</span>";
        })
        .join("");
    }

    function trackingCostMarkup(cost) {
      return Object.entries(cost)
        .filter(function(entry) { return entry[1] > 0; })
        .map(function(entry) {
          const type = entry[0];
          const needed = entry[1];
          const stored = progress.bank[type] || 0;
          const carried = player.held[type] || 0;
          const available = stored + carried;
          const state = available < needed ? " missing" : "";
          const detail = available + "/" + needed + " " + type;
          return '<span class="cost-pill' + state + '" title="' + stored + ' stored + ' + carried + ' carried">' + detail + "</span>";
        })
        .join("");
    }

    function trackedUpgradeDefinition(tracked) {
      const definitions = tracked.group === "village" ? villageUpgradeDefs : upgradeDefs;
      return definitions.find(function(def) { return def.id === tracked.id; }) || null;
    }

    function normalizeTrackedUpgrades() {
      const seen = new Set();
      const tracked = Array.isArray(progress.trackedUpgrades) ? progress.trackedUpgrades : [];
      progress.trackedUpgrades = tracked.filter(function(entry) {
        if (!entry || (entry.group !== "workshop" && entry.group !== "village")) return false;
        const key = entry.group + ":" + entry.id;
        const def = trackedUpgradeDefinition(entry);
        const levels = entry.group === "village" ? progress.village : progress.upgrades;
        if (!def || seen.has(key) || levels[entry.id] >= def.max) return false;
        seen.add(key);
        return true;
      }).slice(0, 3);
      return progress.trackedUpgrades;
    }

    function isTrackingUpgrade(group, id) {
      return normalizeTrackedUpgrades().some(function(entry) {
        return entry.group === group && entry.id === id;
      });
    }

    function stopTrackingUpgrade(group, id) {
      progress.trackedUpgrades = normalizeTrackedUpgrades().filter(function(entry) {
        return entry.group !== group || entry.id !== id;
      });
      trackerRenderKey = "";
    }

    function toggleTrackedUpgrade(group, id) {
      const tracked = normalizeTrackedUpgrades();
      const index = tracked.findIndex(function(entry) {
        return entry.group === group && entry.id === id;
      });
      if (index >= 0) {
        tracked.splice(index, 1);
        showMessage("Upgrade tracking removed.", 2);
      } else if (tracked.length >= 3) {
        showMessage("You can track up to three upgrades.", 2.5);
        return;
      } else {
        tracked.push({ group: group, id: id });
        showMessage("Upgrade materials are now tracked in the top-right.", 2.5);
      }
      saveProgress();
      trackerRenderKey = "";
      upgradeRenderKey = "";
      villageUpgradeRenderKey = "";
      renderUpgradeTracker(true);
      renderUpgrades(true);
      renderVillageUpgrades(true);
    }

    function renderUpgradeTracker(force) {
      const tracked = normalizeTrackedUpgrades();
      const signature = JSON.stringify({
        tracked: tracked,
        bank: progress.bank,
        held: player.held,
        upgrades: progress.upgrades,
        village: progress.village
      });
      if (!force && signature === trackerRenderKey) return;
      trackerRenderKey = signature;
      ui.upgradeTracker.hidden = tracked.length === 0;
      if (!tracked.length) {
        ui.upgradeTracker.innerHTML = "";
        return;
      }
      ui.upgradeTracker.innerHTML = '<p class="upgrade-tracker-title">Tracked upgrades</p>' + tracked.map(function(entry) {
        const def = trackedUpgradeDefinition(entry);
        const levels = entry.group === "village" ? progress.village : progress.upgrades;
        const source = entry.group === "village" ? "Village" : "Workshop";
        return '<div class="tracked-upgrade">' +
          '<span class="tracked-upgrade-name"><span class="tracked-upgrade-source">' + source + "</span>" + def.name + "</span>" +
          '<div class="cost-row">' + trackingCostMarkup(def.cost(levels[entry.id])) + "</div>" +
        "</div>";
      }).join("");
    }

    function addUpgradeButtonInteractions(button, group, id, purchase) {
      let purchaseTimer = null;
      button.addEventListener("click", function() {
        if (purchaseTimer) return;
        purchaseTimer = window.setTimeout(function() {
          purchaseTimer = null;
          purchase();
        }, 220);
      });
      button.addEventListener("dblclick", function(event) {
        event.preventDefault();
        if (purchaseTimer) window.clearTimeout(purchaseTimer);
        purchaseTimer = null;
        toggleTrackedUpgrade(group, id);
      });
    }

    function upgradeSignature() {
      return JSON.stringify({
        bank: progress.bank,
        upgrades: progress.upgrades,
        home: inVillage(),
        phase: phase
      });
    }

    function renderUpgrades(force) {
      const signature = upgradeSignature();
      if (!force && signature === upgradeRenderKey) return;
      upgradeRenderKey = signature;
      ui.upgradeList.innerHTML = "";

      upgradeDefs.forEach(function(def) {
        const level = progress.upgrades[def.id];
        const cost = def.cost(level);
        const maxed = level >= def.max;
        const unavailable = !canAfford(cost) || !inVillage();
        const tracked = isTrackingUpgrade("workshop", def.id);
        const button = document.createElement("button");
        button.type = "button";
        button.className = "upgrade-card" + (maxed ? " maxed" : "") + (tracked ? " tracked" : "") + (unavailable && !maxed ? " unavailable" : "");
        button.disabled = maxed;
        button.setAttribute("aria-disabled", String(maxed || unavailable));
        button.innerHTML =
          '<span class="upgrade-glyph" aria-hidden="true">' + def.glyph + "</span>" +
          "<span>" +
            '<span class="upgrade-title">' +
              "<span>" + def.name + "</span>" +
              '<span class="upgrade-level">LV ' + level + "/" + def.max + "</span>" +
            "</span>" +
            '<span class="upgrade-desc">' + def.description + "</span>" +
            (maxed
              ? '<span class="max-label">MASTERED</span>'
              : '<span class="cost-row">' + costMarkup(cost) + "</span>") +
          "</span>";

        addUpgradeButtonInteractions(button, "workshop", def.id, function() {
          const currentLevel = progress.upgrades[def.id];
          const currentCost = def.cost(currentLevel);
          if (
            currentLevel >= def.max ||
            !canAfford(currentCost) ||
            !inVillage()
          ) return;
          spend(currentCost);
          progress.upgrades[def.id] += 1;
          player.hp = Math.min(maxHp(), player.hp + (def.id === "armor" ? 20 : 0));
          stopTrackingUpgrade("workshop", def.id);
          normalizeTrackedUpgrades();
          saveProgress();
          upgradeRenderKey = "";
          renderUpgrades(true);
          updateUI();
          sfx("upgrade");
          showMessage(def.name + " improved. The village feels a little stronger.");
        });

        ui.upgradeList.appendChild(button);
      });
    }

    function villageUpgradeSignature() {
      return JSON.stringify({
        bank: progress.bank,
        village: progress.village,
        home: inVillage(),
        phase: phase
      });
    }

    function renderVillageUpgrades(force) {
      const signature = villageUpgradeSignature();
      if (!force && signature === villageUpgradeRenderKey) return;
      villageUpgradeRenderKey = signature;
      ui.villageUpgradeList.innerHTML = "";

      villageUpgradeDefs.forEach(function(def) {
        const level = progress.village[def.id];
        const cost = def.cost(level);
        const maxed = level >= def.max;
        const needsGatherer = def.requiresGatherer && progress.village.villagers <= 0;
        const unavailable = needsGatherer || !canAfford(cost) || !inVillage();
        const tracked = isTrackingUpgrade("village", def.id);
        const button = document.createElement("button");
        button.type = "button";
        button.className = "upgrade-card" + (maxed ? " maxed" : "") + (tracked ? " tracked" : "") + (unavailable && !maxed ? " unavailable" : "");
        button.disabled = maxed;
        button.setAttribute("aria-disabled", String(maxed || unavailable));
        button.innerHTML =
          '<span class="upgrade-glyph" aria-hidden="true">' + def.glyph + "</span>" +
          "<span>" +
            '<span class="upgrade-title">' +
              "<span>" + def.name + "</span>" +
              '<span class="upgrade-level">LV ' + level + "/" + def.max + "</span>" +
            "</span>" +
            '<span class="upgrade-desc">' + def.description + "</span>" +
            (maxed
              ? '<span class="max-label">MASTERED</span>'
              : needsGatherer
                ? '<span class="max-label">HIRE A GATHERER FIRST</span>'
                : '<span class="cost-row">' + costMarkup(cost) + "</span>") +
          "</span>";

        addUpgradeButtonInteractions(button, "village", def.id, function() {
          const currentLevel = progress.village[def.id];
          const currentCost = def.cost(currentLevel);
          if (
            currentLevel >= def.max ||
            (def.requiresGatherer && progress.village.villagers <= 0) ||
            !canAfford(currentCost) ||
            !inVillage()
          ) return;

          spend(currentCost);
          progress.village[def.id] += 1;
          if (def.id === "villagers") syncWorkers();
          if (def.id === "center") clearVillageScenery();
          stopTrackingUpgrade("village", def.id);
          normalizeTrackedUpgrades();
          saveProgress();
          upgradeRenderKey = "";
          villageUpgradeRenderKey = "";
          renderVillageUpgrades(true);
          updateUI();
          sfx("upgrade");
          showMessage(def.name + " improved. The village grows stronger.");
        });

        ui.villageUpgradeList.appendChild(button);
      });
    }

    function tributeStatusText() {
      if (tributeDueAtDusk()) return "Demon tribute due at dusk";
      const days = daysUntilTribute();
      return "Demon tribute in " + days + " day" + (days === 1 ? "" : "s");
    }

    function renderTributeInfo(force) {
      const cost = tributeCost();
      const signature = JSON.stringify({
        day: progress.day,
        bank: progress.bank,
        cost: cost
      });
      ui.tributeStatus.textContent = tributeStatusText();
      if (!force && signature === tributeRenderKey) return;
      tributeRenderKey = signature;
      ui.tributeStorageStatus.textContent = tributeDueAtDusk()
        ? "Due at dusk today"
        : "Due on day " + (progress.day + daysUntilTribute());
      ui.tributeStorageCost.innerHTML = costMarkup(cost);
    }

    function updateUI() {
      const currentMaxHp = maxHp();
      const capacity = bagCapacity();
      const held = totalHeld();
      const phaseLength = phase === "day" ? DAY_LENGTH : NIGHT_LENGTH;
      const timeRatio = clamp(phaseTime / phaseLength, 0, 1);

      ui.day.textContent = progress.day;
      ui.time.textContent = Math.max(0, phaseTime).toFixed(1);
      ui.hp.textContent = Math.max(0, Math.ceil(player.hp)) + "/" + currentMaxHp;
      ui.bag.textContent = held + "/" + capacity;
      ui.hpFill.style.width = clamp(player.hp / currentMaxHp * 100, 0, 100) + "%";
      ui.bagFill.style.width = clamp(held / capacity * 100, 0, 100) + "%";
      ui.timeFill.style.width = timeRatio * 100 + "%";

      if (phase === "day") {
        const dusk = phaseTime <= 12;
        ui.phase.textContent = dusk ? "Amber dusk" : "Golden daylight";
        ui.phaseGlyph.textContent = dusk ? "DUSK" : "DAY";
        ui.phaseGlyph.classList.remove("night");
        ui.timePrompt.textContent = dusk ? "Lanterns soon" : "Until dusk";
        ui.timeFill.classList.remove("night");
      } else {
        const nightStage = currentNightThreatStage();
        ui.phase.textContent = demonFightActive
          ? "Demon night"
          : nightStage === 2
            ? "Last stand"
            : nightStage === 1
              ? "Hunting night"
              : "Lantern night";
        ui.phaseGlyph.textContent = "NIGHT";
        ui.phaseGlyph.classList.add("night");
        ui.timePrompt.textContent = "Until dawn";
        ui.timeFill.classList.add("night");
      }

      ui.wood.textContent = progress.bank.wood;
      ui.stone.textContent = progress.bank.stone;
      ui.crystal.textContent = progress.bank.crystal;
      ui.hide.textContent = progress.bank.hide;
      ui.demonCores.textContent = progress.demonCores;
      ui.storageTotal.textContent = storedResourceTotal();

      renderTributeInfo(false);
      renderUpgrades(false);
      renderVillageUpgrades(false);
      renderUpgradeTracker(false);
    }

    function setPaused(value, message) {
      paused = value;
      document.querySelector(".game-shell").classList.toggle("menu-active", paused);
      keys.clear();
      document.querySelectorAll(".touch.is-held").forEach(function(button) {
        button.classList.remove("is-held");
      });
      ui.pauseButton.textContent = paused ? "Resume" : "Pause";
      if (message) showMessage(message, 2);
    }

    function openPauseMenu(message) {
      if (lobbyOpen || tributeChoiceActive || gameOver) return;
      if (activeHouseMenu) {
        const house = activeHouseMenu;
        activeHouseMenu = null;
        houseExitRequired = house.id;
      }
      hideRegularMenus();
      pauseMenuOpen = true;
      ui.pauseMenu.hidden = false;
      setPaused(true, message);
      requestAnimationFrame(function() {
        ui.resumeButton.focus();
      });
    }

    function closePauseMenu() {
      if (!pauseMenuOpen) return;
      pauseMenuOpen = false;
      ui.pauseMenu.hidden = true;
      setPaused(false, "Back to the trail.");
    }

    function togglePaused() {
      if (lobbyOpen || tributeChoiceActive || gameOver) return;
      if (pauseMenuOpen) {
        closePauseMenu();
      } else {
        openPauseMenu();
      }
    }

    function frame(now) {
      const dt = Math.min(0.033, (now - lastTime) / 1000);
      lastTime = now;
      update(dt);
      render();
      requestAnimationFrame(frame);
    }

    window.addEventListener("keydown", function(event) {
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(event.code)) {
        event.preventDefault();
      }
      if (event.code === "Escape" && !tributeChoiceActive && !gameOver) {
        event.preventDefault();
        if (event.repeat) return;
        if (lobbyOpen) return;
        if (activeHouseMenu) {
          closeHouseMenu();
          return;
        }
        togglePaused();
        return;
      }
      if (activeHouseMenu || pauseMenuOpen || lobbyOpen || tributeChoiceActive || gameOver) return;
      if (event.code === "KeyP" && !event.repeat) {
        togglePaused();
        return;
      }
      keys.add(event.code);
    });

    window.addEventListener("keyup", function(event) {
      keys.delete(event.code);
    });

    window.addEventListener("blur", function() {
      if (!paused) openPauseMenu("Paused while you were away.");
    });

    document.querySelectorAll("[data-key]").forEach(function(button) {
      const code = button.dataset.key;
      const press = function(event) {
        event.preventDefault();
        button.setPointerCapture(event.pointerId);
        button.classList.add("is-held");
        keys.add(code);
      };
      const release = function(event) {
        event.preventDefault();
        button.classList.remove("is-held");
        keys.delete(code);
      };
      button.addEventListener("pointerdown", press);
      button.addEventListener("pointerup", release);
      button.addEventListener("pointercancel", release);
      button.addEventListener("lostpointercapture", release);
    });

    document.querySelectorAll("[data-close-menu]").forEach(function(button) {
      button.addEventListener("click", closeHouseMenu);
    });

    ui.pauseButton.addEventListener("click", togglePaused);
    ui.resumeButton.addEventListener("click", closePauseMenu);
    ui.lobbyStartButton.addEventListener("click", startLobbyGame);

    function toggleSound() {
      soundsEnabled = !soundsEnabled;
      const label = soundsEnabled ? "Sound: on" : "Sound: off";
      ui.soundButton.textContent = label;
      ui.pauseSoundButton.textContent = label;
      ui.soundButton.setAttribute("aria-pressed", String(soundsEnabled));
      ui.pauseSoundButton.setAttribute("aria-pressed", String(soundsEnabled));
      if (soundsEnabled) {
        ensureAudio();
        tone(523, 0.16, 0.018, "sine", 0);
        tone(659, 0.22, 0.014, "sine", 0.1);
      }
    }

    ui.soundButton.addEventListener("click", toggleSound);
    ui.pauseSoundButton.addEventListener("click", toggleSound);
    ui.copyInviteButton.addEventListener("click", copyInviteLink);

    ui.payTributeButton.addEventListener("click", payTribute);
    ui.refuseTributeButton.addEventListener("click", refuseTribute);

    function resetVillage() {
      localStorage.removeItem(SAVE_KEY);
      progress = defaultProgress();
      gameOver = false;
      player.held = { wood: 0, stone: 0, crystal: 0, hide: 0 };
      player.hp = maxHp();
      player.x = VILLAGE.x;
      player.y = VILLAGE.y + 15;
      resources = [];
      workers = [];
      monsters = [];
      particles = [];
      demonProjectiles = [];
      boss = null;
      phase = "day";
      phaseTime = DAY_LENGTH;
      tributeChoiceActive = false;
      demonFightActive = false;
      demonResolvedTonight = false;
      nightThreatStage = 0;
      nightHazardTimer = 0;
      nightHazards = [];
      activeHouseMenu = null;
      houseExitRequired = null;
      pauseMenuOpen = false;
      lobbyOpen = false;
      paused = false;
      ui.upgradeMenu.hidden = true;
      ui.storageMenu.hidden = true;
      ui.villageMenu.hidden = true;
      ui.pauseMenu.hidden = true;
      ui.lobbyMenu.hidden = true;
      ui.tributeMenu.hidden = true;
      ui.gameOverMenu.hidden = true;
      ui.pauseButton.textContent = "Pause";
      document.querySelector(".game-shell").classList.remove("menu-active");
      cameraState.x = clamp(player.x - VIEW.width / 2, 0, WORLD.width - VIEW.width);
      cameraState.y = clamp(player.y - VIEW.height / 2, 0, WORLD.height - VIEW.height);
      replenishResources();
      saveProgress();
      upgradeRenderKey = "";
      villageUpgradeRenderKey = "";
      tributeRenderKey = "";
      showMessage("A fresh first morning begins. " + tributeReminderMessage(), 5);
      updateUI();
    }

    function confirmResetVillage() {
      const confirmed = window.confirm("Reset all village progress? This cannot be undone.");
      if (!confirmed) return;
      resetVillage();
    }

    ui.resetButton.addEventListener("click", confirmResetVillage);
    ui.pauseResetButton.addEventListener("click", confirmResetVillage);

    ui.newVillageButton.addEventListener("click", resetVillage);

    player.hp = maxHp();
    generateScenery();
    replenishResources();
    syncWorkers();
    renderUpgrades(true);
    renderVillageUpgrades(true);
    renderTributeInfo(true);
    updateUI();
    if (gameOver) {
      player.hp = 0;
      setPaused(true);
      ui.gameOverMenu.hidden = false;
    } else {
      showMessage("Day " + progress.day + ". " + tributeReminderMessage(), 5);
    }
    connectToMultiplayerHost();
    requestAnimationFrame(frame);
