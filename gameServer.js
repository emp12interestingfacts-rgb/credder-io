import jwt from "jsonwebtoken";

const players = new Map();

export function handleGameConnection(ws, req, supabase) {
  const url = new URL(req.url, "http://localhost");
  const token = url.searchParams.get("token");
  if (!token) {
    ws.close();
    return;
  }

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    ws.close();
    return;
  }

  const player = {
    id: decoded.sub,
    stake: decoded.stake,
    x: Math.random() * 2000,
    y: Math.random() * 2000,
    length: 6,
    credits: decoded.stake,
    alive: true
  };

  players.set(player.id, player);
  console.log(`Player ${player.id} joined match (${decoded.stake} credits)`);

  ws.on("message", async (message) => {
    const data = JSON.parse(message.toString());

    if (data.type === "input") {
      player.x += data.dir.x * 5;
      player.y += data.dir.y * 5;
    }

    if (data.type === "cashout") {
      await supabase
        .from("profiles")
        .update({ credits: player.credits + player.stake })
        .eq("id", player.id);

      ws.send(JSON.stringify({ type: "cashout_success" }));
      ws.close();
      players.delete(player.id);
    }
  });

  ws.on("close", () => {
    players.delete(player.id);
  });
}
