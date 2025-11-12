// client/game.js — updated
const BACKEND_BASE = "https://credder-io-urk4.onrender.com"; // your backend
let game;
let ws;
let player;
let cursors;
let stakeAmount;
let phaserSceneRef = null;

document.getElementById("play").addEventListener("click", startGame);

// helper: ensure a real JWT exists in localStorage (prompt once)
function ensureJwt() {
  let token = localStorage.getItem("jwt");
  if (token && token.length > 10) return token;

  // prompt the user to paste a real JWT (one-time; stored in localStorage)
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

async function startGame() {
  stakeAmount = parseInt(document.getElementById("stake").value);

  const token = ensureJwt();
  if (!token) {
    alert("No JWT provided. Paste a valid JWT when prompted.");
    return;
  }

  // Call backend /enter-match with Authorization header (full URL)
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
    alert("Network error calling backend. Check console & Render logs.");
    return;
  }

  const data = await res.json();
  if (!res.ok) {
    console.error("enter-match error:", data);
    alert("Enter-match failed: " + (data.error || JSON.stringify(data)));
    return;
  }

  if (!data.matchToken) {
    console.error("enter-match returned no matchToken:", data);
    alert("Server did not return matchToken. Check backend logs.");
    return;
  }

  // Hide menu / show game
  document.getElementById("menu").style.display = "none";
  document.getElementById("game-container").style.display = "block";

  // open WebSocket to backend with match token as query param (server expects ?token=...)
  const wsUrl = `wss://credder-io-urk4.onrender.com?token=${encodeURIComponent(
    data.matchToken
  )}`;
  console.log("Connecting to WS:", wsUrl);

  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    console.log("✅ Connected to WebSocket server");
    // optional: send a hello/join message if your server expects it
    try {
      ws.send(JSON.stringify({ type: "hello", ts: Date.now() }));
    } catch (e) {}
  };
  ws.onerror = (err) => {
    console.error("❌ WebSocket error:", err);
  };
  ws.onclose = (ev) => {
    console.log("🔌 Disconnected from server", ev);
  };

  ws.onmessage = (msg) => {
    // minimal incoming handling for now
    try {
      const payload = JSON.parse(msg.data);
      // the server will eventually send snapshots; log them for debugging
      // keep this light — avoid spamming console in production
      // console.log("WS <-", payload);
      if (payload.type === "snapshot") {
        // you can update other players / pellets here later
      }
      if (payload.type === "cashout_success") {
        alert("Cashout successful!");
        location.reload();
      }
    } catch (e) {
      console.warn("Invalid WS message", e);
    }
  };

  initPhaser();
}

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

function preload() {
  this.load.image("dot", "https://i.imgur.com/0k7s6Cw.png");
}

function create() {
  phaserSceneRef = this;
  player = this.physics.add.group();
  this.snake = [this.add.image(400, 300, "dot")];
  this.head = this.snake[0];
  this.speed = 200;
  this.length = 10;
  this.lastMove = 0;

  cursors = this.input.keyboard.createCursorKeys();

  // Q hold -> cashout (4s)
  this.input.keyboard.on("keydown-Q", () => {
    const startHold = Date.now();
    const interval = setInterval(() => {
      if (Date.now() - startHold >= 4000) {
        if (ws && ws.readyState === 1) {
          ws.send(JSON.stringify({ type: "cashout" }));
          console.log("Sent cashout request");
        } else {
          console.warn("WS not open — cannot cashout");
        }
        clearInterval(interval);
      }
    }, 100);
    this.input.keyboard.once("keyup-Q", () => clearInterval(interval));
  });
}

function update(time) {
  if (!player || !cursors) return;
  if (!ws || ws.readyState !== 1) return; // wait for WS to be open

  const dir = { x: 0, y: 0 };
  if (cursors.left.isDown) dir.x = -1;
  if (cursors.right.isDown) dir.x = 1;
  if (cursors.up.isDown) dir.y = -1;
  if (cursors.down.isDown) dir.y = 1;

  // normalize diagonal speed
  if (dir.x !== 0 && dir.y !== 0) {
    const inv = 1 / Math.sqrt(2);
    dir.x *= inv;
    dir.y *= inv;
  }

  // only send input when there is movement to reduce traffic
  if (dir.x !== 0 || dir.y !== 0) {
    try {
      ws.send(JSON.stringify({ type: "input", dir }));
    } catch (e) {
      console.warn("Failed to send input:", e);
    }
  }
}
