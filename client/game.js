// ---------------- Supabase Setup ----------------
const SUPABASE_URL = "https://ignzvfcfgwowuqebzffq.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlnbnp2ZmNmZ3dvd3VxZWJ6ZmZxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2Mjg0NTc0OSwiZXhwIjoyMDc4NDIxNzQ5fQ.sRYzTrlBKgtlwtlRdB-hkQ4ruN9BPDzcY0QFNDba7Rs";
const supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let game, ws, player, stakeAmount;
let players = {}; // snapshot from WS
let pellets = [];
const SEGMENT_SIZE = 15;

// DOM Elements
const loginContainer = document.getElementById("login-container");
const loginBtn = document.getElementById("login-btn");
const loginError = document.getElementById("login-error");
const menu = document.getElementById("menu");
const playBtn = document.getElementById("play");
const leaderboardDiv = document.getElementById("leaderboard");
const minimapDiv = document.getElementById("minimap");

// ---------------- LOGIN ----------------
loginBtn.addEventListener("click", async () => {
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    loginError.innerText = error.message;
    return;
  }

  localStorage.setItem("jwt", data.session.access_token);
  loginContainer.style.display = "none";
  menu.style.display = "block";
  playBtn.disabled = false;
});

// ---------------- START GAME ----------------
playBtn.addEventListener("click", startGame);

async function startGame() {
  stakeAmount = parseInt(document.getElementById("stake").value);
  const token = localStorage.getItem("jwt");
  if (!token) {
    alert("You must log in first!");
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

  menu.style.display = "none";
  document.getElementById("game-container").style.display = "block";

  ws = new WebSocket(`wss://credder-io-urk4.onrender.com?token=${token}`);
  ws.onopen = () => console.log("✅ Connected to WebSocket server");

  ws.onmessage = (msg) => {
    const snap = JSON.parse(msg.data);
    if (snap.type === "snapshot") {
      players = {};
      snap.players.forEach(p => players[p.id] = p);
      pellets = snap.pellets || [];
    }
    if (snap.type === "cashout_success") {
      alert("Cashout successful!");
      location.reload();
    }
  };

  initPhaser();
}

// ---------------- PHASER GAME ----------------
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
  this.load.image("dot", "https://i.imgur.com/0k7s6Cw.png"); // segment placeholder
  this.load.image("pellet", "https://i.imgur.com/3XvPNqC.png"); // pellet placeholder
}

function create() {
  const self = this;

  this.snakeGraphics = this.add.graphics();
  this.pelletGraphics = this.add.graphics();

  this.input.on("pointerdown", () => {
    if (player) player.boost = true;
  });
  this.input.on("pointerup", () => {
    if (player) player.boost = false;
  });

  // Cashout with Q
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
}

function update() {
  if (!players) return;

  const graphics = game.scene.scenes[0].snakeGraphics;
  const pelletGraphics = game.scene.scenes[0].pelletGraphics;
  graphics.clear();
  pelletGraphics.clear();
  leaderboardDiv.innerHTML = "<b>Leaderboard</b><br>";

  const mouseX = game.input.activePointer.worldX;
  const mouseY = game.input.activePointer.worldY;

  // Draw pellets
  pellets.forEach(pellet => {
    pelletGraphics.fillStyle(0xffff00, 1);
    pelletGraphics.fillCircle(pellet.x, pellet.y, 6);

    // Collision with player
    if (player) {
      const dx = pellet.x - player.segments[0].x;
      const dy = pellet.y - player.segments[0].y;
      if (Math.sqrt(dx*dx + dy*dy) < SEGMENT_SIZE) {
        player.length += 1;
        // remove from server snapshot
        const idx = pellets.indexOf(pellet);
        if (idx !== -1) pellets.splice(idx, 1);
      }
    }
  });

  Object.values(players).forEach((p) => {
    leaderboardDiv.innerHTML += `Player ${p.id.substring(0,4)}: ${p.length}<br>`;

    if (!p.segments) {
      p.segments = [];
      for (let i = 0; i < p.length; i++) {
        p.segments.push({ x: p.x, y: p.y });
      }
    }

    // Only move local player
    if (!player) player = p;
    if (p.id === player.id) {
      const dx = mouseX - player.segments[0].x;
      const dy = mouseY - player.segments[0].y;
      const len = Math.sqrt(dx*dx + dy*dy) || 1;
      const speed = player.boost ? 8 : 4;
      player.segments[0].x += (dx/len)*speed;
      player.segments[0].y += (dy/len)*speed;

      ws.send(JSON.stringify({ type:"input", dir:{x:dx/len, y:dy/len}, boost:player.boost }));
    }

    // Move segments
    for (let i = 1; i < p.segments.length; i++) {
      const prev = p.segments[i-1];
      const seg = p.segments[i];
      const dx = prev.x - seg.x;
      const dy = prev.y - seg.y;
      const dist = Math.sqrt(dx*dx + dy*dy) || 1;
      const followSpeed = dist > SEGMENT_SIZE ? dist*0.3 : 0;
      seg.x += dx/dist * followSpeed;
      seg.y += dy/dist * followSpeed;
    }

    // Draw snake
    p.segments.forEach((seg, i) => {
      graphics.fillStyle(p.color, 1);
      graphics.fillCircle(seg.x, seg.y, SEGMENT_SIZE - i*0.5);
    });
  });

  // Minimap
  const ctx = minimapDiv.getContext?.("2d");
  if (ctx) {
    ctx.clearRect(0,0,150,150);
    // pellets
    ctx.fillStyle = "#ff0";
    pellets.forEach(p => ctx.fillRect((p.x+2500)/5000*150, (p.y+2500)/5000*150, 2,2));
    // snakes
    ctx.fillStyle = "#fff";
    Object.values(players).forEach(p => {
      p.segments.forEach(seg => ctx.fillRect((seg.x+2500)/5000*150, (seg.y+2500)/5000*150, 2,2));
    });
  }
}
