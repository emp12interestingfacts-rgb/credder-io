import Phaser from "https://cdn.jsdelivr.net/npm/phaser@3.55.2/dist/phaser.min.js";

const serverUrl = "wss://credder-io-urk4.onrender.com";

let game;
let ws;
let player;
let stakeAmount;

document.getElementById("play").addEventListener("click", startGame);

async function startGame() {
  stakeAmount = parseInt(document.getElementById("stake").value);
  const token = localStorage.getItem("jwt");
  if (!token) return alert("You must log in first.");

  const res = await fetch("/enter-match", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ stake: stakeAmount }),
  });
  const data = await res.json();
  if (data.error) return alert(data.error);

  document.getElementById("menu").style.display = "none";
  document.getElementById("game-container").style.display = "block";

  ws = new WebSocket(`${serverUrl}?token=${token}`);
  ws.onopen = () => console.log("✅ Connected to WebSocket server");

  initPhaser();
}

let snakes = {};
let pellets = [];

function initPhaser() {
  game = new Phaser.Game({
    type: Phaser.AUTO,
    width: window.innerWidth,
    height: window.innerHeight,
    parent: "game-container",
    backgroundColor: "#000000",
    physics: { default: "arcade" },
    scene: { preload, create, update },
  });
}

function preload() {
  this.load.image("segment", "https://i.imgur.com/0k7s6Cw.png"); // placeholder
  this.load.image("pellet", "https://i.imgur.com/Qo9e3ps.png");
}

function create() {
  const scene = this;

  this.input.on("pointerdown", () => { if (player) player.boost = true; });
  this.input.on("pointerup", () => { if (player) player.boost = false; });

  this.input.on("pointermove", (pointer) => {
    if (!player) return;
    const dx = pointer.worldX - player.x;
    const dy = pointer.worldY - player.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    player.dir = { x: dx / len, y: dy / len };
  });

  ws.onmessage = (msg) => {
    const data = JSON.parse(msg.data);
    snakes = {};
    data.players.forEach((p) => {
      snakes[p.id] = p;
      if (!player || player.id === p.id) player = p;
    });
    pellets = data.pellets;
  };

  // Leaderboard container
  this.leaderboard = this.add.text(window.innerWidth - 200, 50, '', { fontSize: '16px', fill: '#ffffff' });
}

function update() {
  const scene = game.scene.scenes[0];
  scene.children.removeAll();

  // --- Draw pellets ---
  pellets.forEach(p => scene.add.image(p.x, p.y, "pellet").setScale(0.5));

  // --- Draw snakes ---
  Object.values(snakes).forEach(s => {
    if (!s.segments) s.segments = Array.from({ length: s.length }, () => ({ x: s.x, y: s.y }));

    // Move head toward direction always
    const speed = s.boost ? 5 : 3; // adjust for scale
    const head = s.segments[0];
    head.x += (s.dir?.x || 0) * speed;
    head.y += (s.dir?.y || 0) * speed;

    // Body follows head
    for (let i = 1; i < s.segments.length; i++) {
      const seg = s.segments[i];
      const prev = s.segments[i - 1];
      seg.x += (prev.x - seg.x) * 0.5;
      seg.y += (prev.y - seg.y) * 0.5;
    }

    // Render segments
    s.segments.forEach((seg, idx) => {
      const tint = Phaser.Display.Color.Interpolate.ColorWithColor(
        Phaser.Display.Color.IntegerToColor(s.color),
        Phaser.Display.Color.IntegerToColor(0xffffff),
        s.segments.length,
        idx
      );
      scene.add.image(seg.x, seg.y, "segment")
        .setTint(Phaser.Display.Color.GetColor(tint.r, tint.g, tint.b))
        .setScale(1);
    });
  });

  // --- Send player input ---
  if (player && ws.readyState === 1) {
    ws.send(JSON.stringify({
      type: "input",
      dir: player.dir || { x: 0, y: 0 },
      boost: player.boost || false
    }));
  }

  // --- Mini-map ---
  const miniMapX = 20, miniMapY = 20, miniMapSize = 200;
  const worldSize = 5000;
  scene.add.rectangle(miniMapX + miniMapSize/2, miniMapY + miniMapSize/2, miniMapSize, miniMapSize).setStrokeStyle(2, 0xffffff);
  // draw players on mini-map
  Object.values(snakes).forEach(s => {
    const x = miniMapX + (s.x + worldSize/2) / worldSize * miniMapSize;
    const y = miniMapY + (s.y + worldSize/2) / worldSize * miniMapSize;
    scene.add.rectangle(x, y, 4, 4, s.color);
  });
  // draw pellets on mini-map
  pellets.forEach(p => {
    const x = miniMapX + (p.x + worldSize/2) / worldSize * miniMapSize;
    const y = miniMapY + (p.y + worldSize/2) / worldSize * miniMapSize;
    scene.add.rectangle(x, y, 2, 2, 0xffff00);
  });

  // --- Leaderboard ---
  const topPlayers = Object.values(snakes).sort((a,b)=>b.length-a.length).slice(0,5);
  let lbText = 'Leaderboard\n';
  topPlayers.forEach((p,i) => lbText += `${i+1}. ${p.id.slice(0,5)}: ${p.length}\n`);
  scene.leaderboard.setText(lbText);
}
