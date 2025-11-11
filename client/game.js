import Phaser from "phaser";

const serverUrl = window.location.origin.replace(/\/$/, "") + "/ws";

let game;
let ws;
let player;
let cursors;
let stakeAmount;

document.getElementById("play").addEventListener("click", startGame);

async function startGame() {
  stakeAmount = parseInt(document.getElementById("stake").value);

  const token = localStorage.getItem("jwt");
  if (!token) {
    alert("You must log in first (JWT missing).");
    return;
  }

  const res = await fetch("/enter-match", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ stake: stakeAmount }),
  });

  const data = await res.json();
  if (data.error) {
    alert(data.error);
    return;
  }

  document.getElementById("menu").style.display = "none";
  document.getElementById("game-container").style.display = "block";

const socket = new WebSocket("wss://credder-io-urk4.onrender.com");
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
  this.load.image("dot", "https://i.imgur.com/0k7s6Cw.png");
}

function create() {
  player = this.physics.add.group();
  this.snake = [this.add.image(400, 300, "dot")];
  this.head = this.snake[0];
  this.speed = 200;
  this.length = 10;
  this.lastMove = 0;

  cursors = this.input.keyboard.createCursorKeys();

  this.input.keyboard.on("keydown-Q", () => {
    const startHold = Date.now();
    const interval = setInterval(() => {
      if (Date.now() - startHold >= 4000) {
        ws.send(JSON.stringify({ type: "cashout" }));
        clearInterval(interval);
      }
    }, 100);
    this.input.keyboard.once("keyup-Q", () => clearInterval(interval));
  });

  ws.onmessage = (msg) => {
    const data = JSON.parse(msg.data);
    if (data.type === "cashout_success") {
      alert("Cashout successful!");
      location.reload();
    }
  };
}

function update(time) {
  if (!player || !cursors) return;

  const dir = { x: 0, y: 0 };
  if (cursors.left.isDown) dir.x = -1;
  if (cursors.right.isDown) dir.x = 1;
  if (cursors.up.isDown) dir.y = -1;
  if (cursors.down.isDown) dir.y = 1;

  if (dir.x !== 0 || dir.y !== 0) {
    ws.send(JSON.stringify({ type: "input", dir }));
  }
}
