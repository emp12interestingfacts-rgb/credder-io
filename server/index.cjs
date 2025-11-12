// server/index.cjs
const express = require("express");
const http = require("http");
const { WebSocketServer } = require("ws");
const cors = require("cors");
const { createClient } = require("@supabase/supabase-js");

const app = express();
app.use(cors());
app.use(express.json());

const supabase = createClient(
  "https://ignzvfcfgwowuqebzffq.supabase.co",
  process.env.SUPABASE_SERVICE_KEY // server-side key
);

const players = {};
const pellets = [];
const WORLD_SIZE = 5000;

function spawnPellet(x, y, credits = 10) {
  pellets.push({ id: "p_" + Math.random(), x, y, credits });
}
for (let i = 0; i < 100; i++) {
  spawnPellet(Math.random() * WORLD_SIZE - WORLD_SIZE / 2, Math.random() * WORLD_SIZE - WORLD_SIZE / 2);
}

async function verifyUser(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: "No token" });

  const token = authHeader.split(" ")[1];
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return res.status(401).json({ error: "Invalid token" });

  req.user = data.user;
  next();
}

app.post("/enter-match", verifyUser, async (req, res) => {
  const { stake } = req.body;
  if (![100, 500, 1000].includes(stake)) return res.status(400).json({ error: "Invalid stake" });

  const matchToken = Math.random().toString(36).slice(2);
  res.json({ matchToken });
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

wss.on("connection", async (ws, req) => {
  const url = new URL(req.url, "http://localhost");
  const token = url.searchParams.get("token");
  if (!token) return ws.close();

  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (!user) return ws.close();

  const id = user.id;
  players[id] = {
    id,
    ws,
    x: Math.random() * WORLD_SIZE - WORLD_SIZE / 2,
    y: Math.random() * WORLD_SIZE - WORLD_SIZE / 2,
    dir: { x: 0, y: 0 },
    length: 10,
    color: Math.floor(Math.random() * 0xffffff),
  };

  ws.on("message", (msg) => {
    const data = JSON.parse(msg);
    if (data.type === "input") {
      const p = players[id];
      if (!p) return;
      p.dir = data.dir;
      p.boost = data.boost;
    } else if (data.type === "cashout") {
      ws.send(JSON.stringify({ type: "cashout_success" }));
      ws.close();
    }
  });

  ws.on("close", () => {
    delete players[id];
  });
});

setInterval(() => {
  const snapshot = {
    type: "snapshot",
    players: Object.values(players).map((p) => ({
      id: p.id,
      x: p.x,
      y: p.y,
      color: p.color,
      length: p.length,
    })),
    pellets,
  };

  const tickRate = 1 / 30;
  const moveSpeed = 300 * tickRate;

  for (const p of Object.values(players)) {
    if (p.dir.x || p.dir.y) {
      const speed = p.boost ? moveSpeed * 1.5 : moveSpeed;
      p.x += p.dir.x * speed;
      p.y += p.dir.y * speed;
    }
  }

  const data = JSON.stringify(snapshot);
  for (const p of Object.values(players)) {
    if (p.ws.readyState === 1) p.ws.send(data);
  }
}, 33);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
