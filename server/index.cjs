const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const cors = require("cors");
const bodyParser = require("body-parser");

// ====== EXPRESS SETUP ======
const app = express();
app.use(cors());
app.use(bodyParser.json());

// Example /enter-match route
app.post("/enter-match", (req, res) => {
  const { stake } = req.body;
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: "No JWT provided" });

  // In production, verify JWT here
  const matchToken = Math.random().toString(36).substr(2, 12); // dummy token
  return res.json({ matchToken });
});

// ====== HTTP SERVER ======
const PORT = process.env.PORT || 3000;
const server = http.createServer(app);

// ====== WEBSOCKET SERVER ======
const wss = new WebSocket.Server({ server });

wss.on("connection", (socket, req) => {
  console.log("✅ New WS connection from", req.socket.remoteAddress);

  socket.on("message", (msg) => {
    try {
      const data = JSON.parse(msg);
      if (data.type === "hello") socket.send(JSON.stringify({ type: "hello_ack" }));
      if (data.type === "cashout") socket.send(JSON.stringify({ type: "cashout_success" }));
      if (data.type === "input") {
        // TODO: handle snake movement
        // console.log("input:", data.dir);
      }
    } catch (e) {
      console.warn("Invalid WS message", e);
    }
  });

  socket.on("close", () => console.log("🔌 WS disconnected"));
});

// ====== START SERVER ======
server.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
