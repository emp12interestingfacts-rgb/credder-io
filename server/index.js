import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { WebSocketServer } from "ws";
import jwt from "jsonwebtoken";
import { createClient } from "@supabase/supabase-js";
import { handleGameConnection } from "./gameServer.js";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Supabase client
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// Middleware to check JWT
const verifyJWT = (req, res, next) => {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ error: "No auth header" });
  try {
    const token = auth.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded.sub;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
};

// --- ROUTES ---

// 🧍 Account endpoint
app.get("/account", verifyJWT, async (req, res) => {
  const { data, error } = await supabase
    .from("profiles")
    .select("credits")
    .eq("id", req.user)
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ credits: data.credits });
});

// 🏁 Enter match
app.post("/enter-match", verifyJWT, async (req, res) => {
  const { stake } = req.body;
  const allowed = [100, 500, 1000];
  if (!allowed.includes(stake))
    return res.status(400).json({ error: "Invalid stake" });

  const { data: profile } = await supabase
    .from("profiles")
    .select("credits")
    .eq("id", req.user)
    .single();

  if (!profile || profile.credits < stake)
    return res.status(400).json({ error: "Insufficient credits" });

  await supabase
    .from("profiles")
    .update({ credits: profile.credits - stake })
    .eq("id", req.user);

  const matchToken = jwt.sign(
    { sub: req.user, stake },
    process.env.JWT_SECRET,
    { expiresIn: "2h" }
  );

  res.json({ matchToken, stake });
});

// 💰 Cashout
app.post("/cashout", verifyJWT, async (req, res) => {
  const { amount } = req.body;
  if (amount <= 0) return res.status(400).json({ error: "Invalid amount" });

  const { data: profile } = await supabase
    .from("profiles")
    .select("credits")
    .eq("id", req.user)
    .single();

  const newCredits = (profile?.credits || 0) + amount;

  await supabase
    .from("profiles")
    .update({ credits: newCredits })
    .eq("id", req.user);

  res.json({ success: true, newCredits });
});

const server = app.listen(process.env.PORT || 3000, () => {
  console.log(`HTTP server running on port ${process.env.PORT}`);
});

// 🎮 WebSocket
const wss = new WebSocketServer({ server });
wss.on("connection", (ws, req) => handleGameConnection(ws, req, supabase));
