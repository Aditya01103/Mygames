import express from "express";
import http from "http";
import { WebSocketServer } from "ws";
import { TikTokLiveConnection, WebcastEvent } from "tiktok-live-connector";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = process.env.PORT || 3000;

const app = express();
const server = http.createServer(app);
app.use(express.static(path.join(__dirname, "public")));

const wss = new WebSocketServer({ server, path: "/ws" });
const clients = new Set();

function broadcast(data) {
  const message = JSON.stringify(data);
  for (const client of clients) {
    if (client.readyState === 1) client.send(message);
  }
}

wss.on("connection", (socket) => {
  console.log("[WS] Browser connected");
  clients.add(socket);
  socket.send(JSON.stringify({ type: "status", status: "disconnected" }));

  socket.on("close", () => {
    clients.delete(socket);
    console.log("[WS] Browser disconnected");
  });

  socket.on("error", (error) => console.error("[WS] Error:", error));

  socket.on("message", async (raw) => {
    try {
      const message = JSON.parse(raw.toString());

      if (message.type === "connect") await connectTikTok(message.username);
      if (message.type === "disconnect") await disconnectTikTok();
    } catch (error) {
      console.error("[WS] Invalid message:", error);
      socket.send(JSON.stringify({
        type: "error",
        message: "Invalid WebSocket message."
      }));
    }
  });
});

let tiktokConnection = null;
let currentUsername = null;
let connectionGeneration = 0;

function cleanUsername(username) {
  if (!username) return null;

  let value = String(username).trim().replace(/^@/, "");
  const urlMatch = value.match(/tiktok\.com\/@([^/?]+)/i);
  if (urlMatch) value = urlMatch[1];

  if (!/^[a-zA-Z0-9._-]{1,50}$/.test(value)) return null;
  return value;
}

async function connectTikTok(username) {
  const clean = cleanUsername(username);

  if (!clean) {
    broadcast({ type: "error", message: "Username TikTok tidak valid." });
    return;
  }

  await disconnectTikTok();

  const generation = ++connectionGeneration;

  broadcast({
    type: "status",
    status: "connecting",
    username: clean
  });

  console.log(`[TikTok] Connecting to @${clean}...`);

  try {
    const connection = new TikTokLiveConnection(clean, {
      enableExtendedGiftInfo: true
    });

    tiktokConnection = connection;
    currentUsername = clean;

    connection.on("connected", (state) => {
      if (generation !== connectionGeneration) return;

      console.log(`[TikTok] Connected to @${clean}`);
      console.log(`[TikTok] Room ID: ${state.roomId}`);

      broadcast({
        type: "status",
        status: "connected",
        username: clean,
        roomId: state.roomId
      });
    });

    connection.on("disconnected", () => {
      if (generation !== connectionGeneration) return;
      console.log("[TikTok] Disconnected");
      broadcast({ type: "status", status: "disconnected" });
    });

    connection.on("streamEnd", () => {
      if (generation !== connectionGeneration) return;
      console.log("[TikTok] Stream ended");
      broadcast({
        type: "status",
        status: "disconnected",
        reason: "streamEnd"
      });
    });

    connection.on("error", (error) => {
      console.error("[TikTok] Connection error:", error);
      if (generation !== connectionGeneration) return;

      broadcast({
        type: "error",
        message: error?.message || "TikTok connection error."
      });
    });

    connection.on(WebcastEvent.LIKE, (data) => {
      if (generation !== connectionGeneration) return;

      const user = data?.user?.uniqueId || data?.uniqueId || "viewer";
      const nickname = data?.user?.nickname || data?.nickname || user;
      const likeCount = Number(data?.likeCount) || 1;

      broadcast({
        type: "tiktok_event",
        event: "like",
        user,
        nickname,
        amount: likeCount,
        effect: {
          target: "all",
          boost: Math.min(0.035 * likeCount, 0.30)
        }
      });
    });

    connection.on(WebcastEvent.CHAT, (data) => {
      if (generation !== connectionGeneration) return;

      const user = data?.user?.uniqueId || data?.uniqueId || "viewer";
      const nickname = data?.user?.nickname || data?.nickname || user;
      const comment = String(data?.comment || "").trim();
      const match = comment.match(/#mobil\s*([1-6])/i);

      if (match) {
        const carNumber = Number(match[1]) - 1;

        broadcast({
          type: "tiktok_event",
          event: "comment",
          user,
          nickname,
          comment,
          effect: {
            target: "car",
            carIndex: carNumber,
            boost: 0.90,
            fuel: 10
          }
        });
        return;
      }

      broadcast({
        type: "tiktok_event",
        event: "comment",
        user,
        nickname,
        comment,
        effect: { target: "none" }
      });
    });

    connection.on(WebcastEvent.GIFT, (data) => {
      if (generation !== connectionGeneration) return;

      // Streak gifts can emit intermediate events.
      if (Number(data?.giftType) === 1 && data?.repeatEnd === false) return;

      const user = data?.user?.uniqueId || data?.uniqueId || "viewer";
      const nickname = data?.user?.nickname || data?.nickname || user;
      const giftName =
        data?.giftName ||
        data?.extendedGiftInfo?.name ||
        "Gift";

      const repeatCount = Number(data?.repeatCount) || 1;
      const diamondCount =
        Number(data?.diamondCount) ||
        Number(data?.extendedGiftInfo?.diamondCount) ||
        1;

      const totalValue = diamondCount * repeatCount;
      const boost = Math.min(
        2.5,
        0.45 + Math.log10(Math.max(totalValue, 1)) * 0.55
      );

      broadcast({
        type: "tiktok_event",
        event: "gift",
        user,
        nickname,
        giftName,
        repeatCount,
        diamondCount,
        totalValue,
        effect: {
          target: "car",
          carIndex: 0,
          boost,
          superBoost: true,
          duration: 1600
        }
      });
    });

    connection.on(WebcastEvent.ROOM_USER, (data) => {
      if (generation !== connectionGeneration) return;

      broadcast({
        type: "viewer_count",
        viewerCount: Number(data?.viewerCount) || 0
      });
    });

    await connection.connect();
  } catch (error) {
    console.error("[TikTok] Failed to connect:", error);

    if (generation !== connectionGeneration) return;

    tiktokConnection = null;
    currentUsername = null;

    broadcast({ type: "status", status: "disconnected" });
    broadcast({
      type: "error",
      message: error?.message || "Gagal terhubung ke TikTok LIVE."
    });
  }
}

async function disconnectTikTok() {
  connectionGeneration++;

  if (!tiktokConnection) {
    currentUsername = null;
    broadcast({ type: "status", status: "disconnected" });
    return;
  }

  console.log("[TikTok] Disconnecting...");

  try {
    await tiktokConnection.disconnect();
  } catch (error) {
    console.error("[TikTok] Disconnect error:", error);
  }

  tiktokConnection = null;
  currentUsername = null;
  broadcast({ type: "status", status: "disconnected" });
}

app.get("/api/status", (req, res) => {
  res.json({
    connected: Boolean(tiktokConnection?.isConnected),
    username: currentUsername
  });
});

server.listen(PORT, () => {
  console.log("");
  console.log("========================================");
  console.log(" TikTok LIVE Racing Game");
  console.log("========================================");
  console.log(` Server: http://localhost:${PORT}`);
  console.log(` WebSocket: ws://localhost:${PORT}/ws`);
  console.log("========================================");
  console.log("");
});
