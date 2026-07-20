const { app, BrowserWindow, shell } = require("electron");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const developmentUrl = process.env.ELECTRON_START_URL || "http://localhost:3000";
const productionPort = Number(process.env.ELECTRON_NEXT_PORT || 3210);
let nextServer;

function productionServerPath() {
  return path.join(process.resourcesPath, "next-standalone", "server.js");
}

function vaultDirectory() {
  const directory = path.join(app.getPath("userData"), "vault");
  fs.mkdirSync(directory, { recursive: true });
  return directory;
}

function waitForServer(url, timeoutMs = 30_000) {
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    const retry = () => {
      if (Date.now() - startedAt > timeoutMs) {
        reject(new Error(`Timed out waiting for Next.js at ${url}`));
        return;
      }
      setTimeout(check, 250);
    };

    const check = () => {
      const request = http.get(url, (response) => {
        response.resume();
        if (response.statusCode && response.statusCode < 500) {
          resolve();
          return;
        }
        retry();
      });

      request.on("error", retry);
    };

    check();
  });
}

async function startProductionServer() {
  const serverPath = productionServerPath();

  if (!fs.existsSync(serverPath)) {
    throw new Error(`Next.js standalone server is missing: ${serverPath}`);
  }

  nextServer = spawn(process.execPath, [serverPath], {
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      HOSTNAME: "127.0.0.1",
      ARCHEION_VAULT_DIR: vaultDirectory(),
      NODE_ENV: "production",
      PORT: String(productionPort),
    },
    stdio: "inherit",
  });

  nextServer.on("exit", (code) => {
    if (code && app.isReady()) {
      app.quit();
    }
  });

  await waitForServer(`http://127.0.0.1:${productionPort}`);
}

function isLocalUrl(target) {
  try {
    const targetUrl = new URL(target);
    return (
      targetUrl.protocol === "http:" &&
      ["localhost", "127.0.0.1"].includes(targetUrl.hostname)
    );
  } catch {
    return false;
  }
}

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 980,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: "#f4f5f0",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.cjs"),
      sandbox: true,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, target) => {
    if (!isLocalUrl(target)) {
      event.preventDefault();
      if (target.startsWith("https://")) {
        shell.openExternal(target);
      }
    }
  });

  return mainWindow;
}

async function boot() {
  let url = developmentUrl;

  if (app.isPackaged) {
    await startProductionServer();
    url = `http://127.0.0.1:${productionPort}`;
  }

  const mainWindow = createWindow();
  await mainWindow.loadURL(url);
}

app.whenReady().then(() => {
  boot().catch((error) => {
    console.error("Failed to start Archeion desktop shell", error);
    app.quit();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  nextServer?.kill();
});
