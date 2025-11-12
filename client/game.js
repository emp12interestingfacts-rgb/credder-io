// client/game.js
const BACKEND_BASE = "https://credder-io-urk4.onrender.com"; // your backend
let game;
let ws;
let player;
let phaserSceneRef = null;
let stakeAmount;

// Helper: ensure JWT exists
function ensureJwt() {
  let token = localStorage.getItem("jwt");
  if (token && token.length > 10) return token;

  const pasted = window.prompt(
    "Paste your JWT (server-issued) here. This will be saved locally in your browser for future logins:",
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
    console.error("Network error calling /enter-match:", err);
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

  ws.onopen = () => {
    console.log("✅ Connected to WebSocket server");
    ws.send(JSON.stringify({ type: "hello", ts: Date.now() }));
  };
  ws.onerror = (err) => console.error("❌ WebSocket error:", err);
  ws.onclose = (ev) => console.log("🔌 Disconnected from server", ev);
  ws.onmessage = (msg) => {
    try {
      const payload = JSON.parse(msg.data);
      if (payload.type === "cashout_success") {
        alert("Cashout successful!");
        location.reload();
      }
      // Add snapshot handling here later
    } catch (e) {
      console.warn("Invalid WS message", e);
    }
  };

  initPhaser();
}

// Phaser initialization
function initPhaser() {
  if (game) {
    console.warn("Phaser already running");
    return;
  }

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

// Preload assets
function preload() {
  this.load.image("dot", "https://i.imgur.com/0k7s6Cw.png");
}

// Create scene
function create() {
  phaserSceneRef = this;
  player = this.physics.add.group();

  // Snake setup
  this.snake = [this.add.image(400, 300, "dot")];
  this.head = this.snake[0];
  this.speed = 200;
  this.boostSpeed = 400;
  this.length = 10;
  this.isBoosting = false;

  // Mouse tracking
  this.input.on("pointermove", (pointer) => {
    this.pointer = pointer;
  });

  // Click to boost
  this.input.on("pointerdown", () => {
    if (this.length > 0) {
      this.isBoosting = true;
      setTimeout(() => {
        this.isBoosting = false;
      }, 500); // boost duration 0.5s
    }
  });

  // Q hold -> cashout
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

// Update loop
function update(time) {
  if (!phaserSceneRef || !phaserSceneRef.pointer || !phaserSceneRef.head) return;
  if (!ws || ws.readyState !== 1) return;

  const scene = phaserSceneRef;
  const dx = scene.pointer.x - scene.head.x;
  const dy = scene.pointer.y - scene.head.y;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist > 1) {
    const dirX = dx / dist;
    const dirY = dy / dist;
    const speed = scene.isBoosting ? scene.boostSpeed : scene.speed;

    scene.head.x += dirX * speed * (scene.game.loop.delta / 1000);
    scene.head.y += dirY * speed * (scene.game.loop.delta / 1000);

    // Send WS input
    ws.send(JSON.stringify({
      type: "input",
      dir: { x: dirX, y: dirY },
      boost: !!scene.isBoosting
    }));
  }
}
