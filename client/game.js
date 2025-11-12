import Phaser from "https://cdn.jsdelivr.net/npm/phaser@3.55.2/dist/phaser.min.js";

const serverUrl = "wss://credder-io-urk4.onrender.com";

let game;
let ws;
let player;
let cursors;
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

function initPhaser() {
  game = new Phaser.Game({
    type: Phaser.AUTO,
    width: window.innerWidth,
    height: window.innerHeight,
    parent: "game-container",
    backgroundColor: "#000",
    physics: { default: "arcade" },
    scene: { preload, create, update },
  });
}

function preload() {
  this.load.image("snake-head", "https://i.imgur.com/0k7s6Cw.png"); // temporary snake head image
  this.load.image("pellet", "https://i.imgur.com/Qo9e3ps.png"); // example pellet
}

let snakes = {};
let pellets = [];

function create() {
  cursors = this.input.keyboard.createCursorKeys();

  this.input.on("pointermove", (pointer) => {
    if (player) {
      const dx = pointer.worldX - player.x;
      const dy = pointer.worldY - player.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      player.dir = { x: dx / len, y: dy / len };
    }
  });

  this.input.on("pointerdown", () => {
    if (player) player.boost = true;
  });
  this.input.on("pointerup", () => {
    if (player) player.boost = false;
  });

  ws.onmessage = (msg) => {
    const data = JSON.parse(msg.data);

    // update snakes and pellets
    snakes = {};
    data.players.forEach((p) => {
      snakes[p.id] = p;
      if (!player || player.id === p.id) player = p;
    });
    pellets = data.pellets;
  };
}

function update() {
  const scene = game.scene.scenes[0];
  scene.cameras.main.setBackgroundColor("#000");

  scene.children.removeAll(); // simple clear

  // draw pellets
  pellets.forEach((p) => {
    scene.add.image(p.x, p.y, "pellet").setScale(0.5);
  });

  // draw snakes
  Object.values(snakes).forEach((s) => {
    scene.add.image(s.x, s.y, "snake-head").setTint(s.color).setScale(1);
  });

  // send input
  if (player && ws.readyState === 1) {
    ws.send(JSON.stringify({ type: "input", dir: player.dir || { x: 0, y: 0 }, boost: player.boost || false }));
  }
}
