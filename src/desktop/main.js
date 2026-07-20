"use strict";

const { app, BrowserWindow, dialog, session } = require("electron");
const { startServer } = require("../../server");

const DEFAULT_PORT = 3000;
let mainWindow = null;
let hostDetails = null;

function requestedPort() {
  const port = Number.parseInt(process.env.PORT || String(DEFAULT_PORT), 10);
  return Number.isInteger(port) && port > 0 && port <= 65535 ? port : DEFAULT_PORT;
}

async function startDesktopHost() {
  try {
    return await startServer({ port: requestedPort() });
  } catch (error) {
    if (error && error.code === "EADDRINUSE") return startServer({ port: 0 });
    throw error;
  }
}

function desktopGameUrl(details) {
  const gameUrl = new URL(details.localUrl);
  if (details.lanUrls.length > 0) {
    gameUrl.searchParams.set("inviteHost", new URL(details.lanUrls[0]).host);
  }
  return gameUrl.href;
}

function createMainWindow(url) {
  const allowedOrigin = new URL(url).origin;
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: "#302532",
    title: "Nightfall Village",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  window.webContents.setWindowOpenHandler(function() {
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", function(event, destination) {
    if (new URL(destination).origin !== allowedOrigin) event.preventDefault();
  });
  window.once("ready-to-show", function() { window.show(); });
  window.on("closed", function() { mainWindow = null; });
  window.loadURL(url);
  return window;
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", function() {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.whenReady().then(async function() {
    session.defaultSession.setPermissionRequestHandler(function(_webContents, _permission, callback) {
      callback(false);
    });
    hostDetails = await startDesktopHost();
    mainWindow = createMainWindow(desktopGameUrl(hostDetails));
  }).catch(function(error) {
    dialog.showErrorBox(
      "Nightfall Village could not start",
      "The local game host failed to start.\n\n" + (error && error.message ? error.message : String(error))
    );
    app.quit();
  });

  app.on("activate", function() {
    if (!mainWindow && hostDetails) mainWindow = createMainWindow(desktopGameUrl(hostDetails));
  });

  app.on("window-all-closed", function() {
    app.quit();
  });
}
