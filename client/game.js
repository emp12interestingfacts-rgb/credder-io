// client/game.js
const BACKEND_BASE = "https://credder-io-urk4.onrender.com"; // your backend
let game;
let ws;
let phaserScene = null;
let stakeAmount;

// Ensure JWT exists
function ensureJwt() {
  let token = localStorage.getItem("jwt");
  if (token && token.length > 10) return token;

  const pasted = window.prompt(
    "Paste your JWT (server-issued) here. This will be saved locally for future logins:",
    ""
  );
  if (pasted && pasted.length > 10) {
    localStorage.setItem("jwt", pasted.trim());
    return pasted.trim();
  }
  return null;
}

// Start Game
document.getElementById("play").addEventListener("click", startGame);

async function startGame() {
  stakeAmount = parseInt(document.getElementById("stake").value);
  const token = ensureJwt();
  if (!token) {
    alert("No JWT provided.");
    return;
  }

  // Call backend /enter-match
  let res;
  try {
    res = await fetch(`${BACKEND_BASE}/enter-match`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ stake: stakeAmount }),
    });
  } catch (err) {
    console.error("Network error:", err);
    alert("Network error calling backend.");
    return;
  }

  const data = await res.json();
  if (!res.ok || !data.matchToken) {
    console.error("enter-match error:", data);
    alert("Enter-match failed or no matchToken returned.");
    return;
  }

  document.getElementById("menu").style.display = "none";
  document.getElementById("game-container").style.display = "block";

  // Connect WebSocket
  const wsUrl = `wss://credder-io-urk4.onrender.com?token=${encodeURIComponent(
    data.matchToken
  )}`;
  console.log("Connecting to WS:", wsUrl);

  ws = new WebSocket(wsUrl);
  ws.onopen = () => console.log("✅ Connected to WebSocket server");
  ws.onerror = (err) => console.error("❌ WebSocket error:", err);
  ws.onclose = () => console.log("🔌 Disconnected from server");
  ws.onmessage = (msg) => {
    try {
      const payload = JSON.parse(msg.data);
      if (payload.type === "cashout_success") {
        alert("Cashout successful!");
        location.reload();
      }
      // Here you can add updates from other players
    } catch (e) {
      console.warn("Invalid WS message", e);
    }
  };

  initPhaser();
}

// Phaser setup
function initPhaser() {
  if (game) return;

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
  // we can use simple circles, no images needed
}

function create() {
  phaserScene = this;

  // Snake setup
  this.snake = [];
  this.head = this.add.circle(400, 300, 10, 0x00ff00);
  this.snake.push(this.head);
  this.segmentSpacing = 12;
  this.speed = 200;
  this.boostSpeed = 400;
  this.isBoosting = false;

  // Initial length
  for (let i = 1; i < 10; i++) {
    const seg = this.add.circle(400 - i * this.segmentSpacing, 300, 10, 0x00ff00);
    this.snake.push(seg);
  }

  // Mouse tracking
  this.input.on("pointermove", (pointer) => {
    this.pointer = pointer;
  });

  // Click to boost
  this.input.on("pointerdown", () => {
    if (this.snake.length > 1) {
      this.isBoosting = true;
      setTimeout(() => (this.isBoosting = false), 500);
      shrinkSnake(this, 1); // lose 1 segment on boost
    }
  });

  // Q hold for cashout
  this.input.keyboard.on("keydown-Q", () => {
    const startHold = Date.now();
    const interval = setInterval(() => {
      if (Date.now() - startHold >= 4000) {
        if (ws && ws.readyState === 1) ws.send(JSON.stringify({ type: "cashout" }));
        clearInterval(interval);
      }
    }, 100);
    this.input.keyboard.once("keyup-Q", () => clearInterval(interval));
  });
}

function update() {
  if (!phaserScene || !phaserScene.pointer) return;
  if (!ws || ws.readyState !== 1) return;

  const scene = phaserScene;
  const head = scene.snake[0];

  const dx = scene.pointer.x - head.x;
  const dy = scene.pointer.y - head.y;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist > 1) {
    const dirX = dx / dist;
    const dirY = dy / dist;
    const speed = scene.isBoosting ? scene.boostSpeed : scene.speed;

    // Move head
    head.x += dirX * speed * (scene.game.loop.delta / 1000);
    head.y += dirY * speed * (scene.game.loop.delta / 1000);

    // Move segments
    for (let i = 1; i < scene.snake.length; i++) {
      const seg = scene.snake[i];
      const prev = scene.snake[i - 1];
      const vx = prev.x - seg.x;
      const vy = prev.y - seg.y;
      const distance = Math.sqrt(vx * vx + vy * vy);
      if (distance > scene.segmentSpacing) {
        seg.x += vx * 0.2;
        seg.y += vy * 0.2;
      }
    }

    // Send input to server
    ws.send(
      JSON.stringify({
        type: "input",
        dir: { x: dirX, y: dirY },
        boost: !!scene.isBoosting,
      })
    );
  }
}

// Grow snake function
function growSnake(scene, segments = 1) {
  for (let i = 0; i < segments; i++) {
    const tail = scene.snake[scene.snake.length - 1];
    const seg = scene.add.circle(tail.x, tail.y, 10, 0x00ff00);
    scene.snake.push(seg);
  }
}

// Shrink snake on boost
function shrinkSnake(scene, segments = 1) {
  for (let i = 0; i < segments; i++) {
    if (scene.snake.length > 1) {
      const seg = scene.snake.pop();
      seg.destroy();
    }
  }
}
