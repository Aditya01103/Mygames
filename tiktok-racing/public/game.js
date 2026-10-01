const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const usernameInput = document.getElementById("username");
const connectBtn = document.getElementById("connectBtn");
const disconnectBtn = document.getElementById("disconnectBtn");
const statusDot = document.getElementById("statusDot");
const statusText = document.getElementById("statusText");
const raceStatus = document.getElementById("raceStatus");
const viewerCount = document.getElementById("viewerCount");
const activityLog = document.getElementById("activityLog");
const winnerOverlay = document.getElementById("winnerOverlay");
const winnerText = document.getElementById("winnerText");
const winnerCountdown = document.getElementById("winnerCountdown");
const clearLog = document.getElementById("clearLog");

const TRACK = {
  left: 150,
  right: 1050,
  top: 70,
  bottom: 650,
  finishX: 930
};

const LANE_COUNT = 6;

const CAR_COLORS = [
  "#ef4444", "#3b82f6", "#22c55e",
  "#eab308", "#a855f7", "#f97316"
];

const CAR_NAMES = [
  "Mobil Merah", "Mobil Biru", "Mobil Hijau",
  "Mobil Kuning", "Mobil Ungu", "Mobil Oranye"
];

const CAR_EMOJIS = [
  "🚗", "🚙", "🏎️", "🚕", "🚓", "🚘"
];

let cars = [];
let particles = [];
let effects = [];
let raceFinished = false;
let resetTimer = null;
let countdownTimer = null;
let websocket = null;
let lastFrameTime = performance.now();

function createCars() {
  cars = [];
  const laneHeight = (TRACK.bottom - TRACK.top) / LANE_COUNT;

  for (let i = 0; i < LANE_COUNT; i++) {
    cars.push({
      id: i,
      name: CAR_NAMES[i],
      emoji: CAR_EMOJIS[i],
      color: CAR_COLORS[i],
      x: TRACK.left + 20,
      y: TRACK.top + laneHeight * i + laneHeight / 2,
      laneY: TRACK.top + laneHeight * i + laneHeight / 2,
      width: 58,
      height: 32,
      baseSpeed: 65 + Math.random() * 25,
      speedBoost: 0,
      fuel: 0,
      superBoost: 0,
      finished: false,
      finishTime: null
    });
  }
}

function resetRace() {
  raceFinished = false;
  clearTimeout(resetTimer);
  clearInterval(countdownTimer);

  winnerOverlay.classList.add("hidden");
  winnerOverlay.classList.remove("flex");

  raceStatus.textContent = "RACE READY";
  raceStatus.className = "text-xs font-bold text-blue-400";

  particles = [];
  effects = [];
  createCars();
  addLog("🏁", "Race baru dimulai.");
}

function update(delta) {
  if (raceFinished) {
    updateParticles(delta);
    updateEffects(delta);
    return;
  }

  for (const car of cars) {
    if (car.finished) continue;

    let speed = car.baseSpeed;

    if (car.speedBoost > 0) {
      speed += 150 * car.speedBoost;
      car.speedBoost -= delta * 0.65;
      if (car.speedBoost < 0) car.speedBoost = 0;
    }

    if (car.superBoost > 0) {
      speed += 450;
      car.superBoost -= delta;
      createExhaustParticle(car);
    }

    if (car.fuel > 0) {
      speed += 30;
      car.fuel -= delta * 1.5;
      if (car.fuel < 0) car.fuel = 0;
    }

    car.x += speed * delta;
    car.y += (car.laneY - car.y) * Math.min(delta * 5, 1);

    if (car.x + car.width / 2 >= TRACK.finishX) finishCar(car);
  }

  updateParticles(delta);
  updateEffects(delta);

  if (Math.random() < 0.25) {
    const randomCar = cars[Math.floor(Math.random() * cars.length)];
    createExhaustParticle(randomCar);
  }
}

function finishCar(car) {
  if (car.finished) return;

  car.finished = true;
  car.finishTime = performance.now();

  if (raceFinished) return;

  raceFinished = true;
  winnerText.textContent = `${car.name} Menang!`;
  winnerOverlay.classList.remove("hidden");
  winnerOverlay.classList.add("flex");

  raceStatus.textContent = "RACE FINISHED";
  raceStatus.className = "text-xs font-bold text-yellow-400";

  addLog("🏆", `${car.name} memenangkan balapan!`);

  for (let i = 0; i < 80; i++) {
    particles.push({
      x: canvas.width / 2,
      y: canvas.height / 2,
      vx: (Math.random() - 0.5) * 500,
      vy: (Math.random() - 0.8) * 500,
      gravity: 400,
      life: 1.5 + Math.random(),
      maxLife: 2.5,
      size: 3 + Math.random() * 6,
      color: CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)]
    });
  }

  let seconds = 5;
  winnerCountdown.textContent = `Balapan baru dalam ${seconds} detik...`;

  countdownTimer = setInterval(() => {
    seconds--;
    if (seconds > 0) {
      winnerCountdown.textContent = `Balapan baru dalam ${seconds} detik...`;
    }
  }, 1000);

  resetTimer = setTimeout(() => {
    clearInterval(countdownTimer);
    resetRace();
  }, 5000);
}

function draw() {
  const width = canvas.width;
  const height = canvas.height;

  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, "#0f172a");
  gradient.addColorStop(1, "#020617");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  drawTrack();
  drawFinishLine();

  for (const car of cars) drawCar(car);

  drawParticles();
  drawEffects();
}

function drawTrack() {
  ctx.save();

  ctx.fillStyle = "#334155";
  ctx.beginPath();
  ctx.roundRect(
    TRACK.left,
    TRACK.top - 20,
    TRACK.right - TRACK.left,
    TRACK.bottom - TRACK.top + 40,
    25
  );
  ctx.fill();

  ctx.strokeStyle = "#64748b";
  ctx.lineWidth = 5;
  ctx.stroke();

  const laneHeight = (TRACK.bottom - TRACK.top) / LANE_COUNT;

  for (let i = 1; i < LANE_COUNT; i++) {
    const y = TRACK.top + laneHeight * i;

    ctx.strokeStyle = "rgba(255,255,255,0.16)";
    ctx.lineWidth = 2;
    ctx.setLineDash([20, 15]);

    ctx.beginPath();
    ctx.moveTo(TRACK.left, y);
    ctx.lineTo(TRACK.right, y);
    ctx.stroke();
  }

  ctx.setLineDash([]);
  ctx.restore();
}

function drawFinishLine() {
  const tileSize = 16;

  for (let y = TRACK.top - 20; y < TRACK.bottom + 20; y += tileSize) {
    const row = Math.floor((y - (TRACK.top - 20)) / tileSize);

    ctx.fillStyle = row % 2 === 0 ? "#ffffff" : "#111827";
    ctx.fillRect(TRACK.finishX, y, tileSize, tileSize);

    ctx.fillStyle = row % 2 === 0 ? "#111827" : "#ffffff";
    ctx.fillRect(TRACK.finishX + tileSize, y, tileSize, tileSize);
  }

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 16px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("FINISH", TRACK.finishX + 16, TRACK.top - 30);
}

function drawCar(car) {
  ctx.save();
  ctx.translate(car.x, car.y);

  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath();
  ctx.ellipse(0, 7, car.width * 0.6, 10, 0, 0, Math.PI * 2);
  ctx.fill();

  if (car.superBoost > 0) {
    const pulse = Math.sin(performance.now() * 0.02);
    ctx.globalAlpha = 0.3 + pulse * 0.1;
    ctx.fillStyle = "#facc15";
    ctx.beginPath();
    ctx.arc(0, 0, 40 + pulse * 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  ctx.fillStyle = car.color;
  ctx.beginPath();
  ctx.roundRect(
    -car.width / 2,
    -car.height / 2,
    car.width,
    car.height,
    8
  );
  ctx.fill();

  ctx.fillStyle = "rgba(255,255,255,0.25)";
  ctx.beginPath();
  ctx.roundRect(-15, -10, 27, 20, 5);
  ctx.fill();

  ctx.fillStyle = "#0f172a";
  ctx.fillRect(-9, -7, 8, 14);
  ctx.fillRect(2, -7, 8, 14);

  ctx.fillStyle = "#020617";
  ctx.fillRect(-car.width / 2 - 3, -13, 8, 9);
  ctx.fillRect(-car.width / 2 - 3, 4, 8, 9);
  ctx.fillRect(car.width / 2 - 5, -13, 8, 9);
  ctx.fillRect(car.width / 2 - 5, 4, 8, 9);

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 12px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(car.id + 1, -30, 0);

  ctx.font = "bold 11px sans-serif";
  ctx.fillText(car.name, 0, -27);

  ctx.restore();
}

function createExhaustParticle(car) {
  particles.push({
    x: car.x - car.width / 2,
    y: car.y + (Math.random() - 0.5) * 10,
    vx: -80 - Math.random() * 60,
    vy: (Math.random() - 0.5) * 40,
    gravity: 0,
    life: 0.3 + Math.random() * 0.3,
    maxLife: 0.6,
    size: 2 + Math.random() * 4,
    color: "#fbbf24"
  });
}

function updateParticles(delta) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];

    p.x += p.vx * delta;
    p.y += p.vy * delta;
    p.vy += p.gravity * delta;
    p.life -= delta;

    if (p.life <= 0) particles.splice(i, 1);
  }
}

function drawParticles() {
  for (const p of particles) {
    ctx.save();
    ctx.globalAlpha = Math.max(p.life / p.maxLife, 0);
    ctx.fillStyle = p.color;

    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }
}

function addEffect(x, y, text, color = "#ffffff") {
  effects.push({
    x, y, text, color,
    life: 1.2,
    maxLife: 1.2
  });
}

function updateEffects(delta) {
  for (let i = effects.length - 1; i >= 0; i--) {
    const effect = effects[i];
    effect.y -= 30 * delta;
    effect.life -= delta;

    if (effect.life <= 0) effects.splice(i, 1);
  }
}

function drawEffects() {
  ctx.save();
  ctx.textAlign = "center";
  ctx.font = "bold 24px sans-serif";

  for (const effect of effects) {
    ctx.globalAlpha = Math.max(effect.life / effect.maxLife, 0);
    ctx.fillStyle = effect.color;
    ctx.fillText(effect.text, effect.x, effect.y);
  }

  ctx.restore();
}

function handleTikTokEvent(data) {
  const event = data.event;

  if (event === "like") {
    const boost = Number(data.effect?.boost) || 0.1;

    for (const car of cars) {
      car.speedBoost = Math.min(car.speedBoost + boost, 1);
    }

    addEffect(canvas.width / 2, 80, `❤️ LIKE +${data.amount}`, "#fb7185");
    addLog("❤️", `@${data.user} memberikan ${data.amount} LIKE`);
    return;
  }

  if (event === "comment") {
    if (data.effect?.target === "car") {
      const index = Number(data.effect.carIndex);
      const car = cars[index];

      if (car) {
        car.speedBoost = Math.min(
          car.speedBoost + Number(data.effect.boost),
          1.5
        );

        car.fuel += Number(data.effect.fuel) || 0;

        addEffect(
          car.x,
          car.y - 30,
          `🚀 #MOBIL${index + 1}`,
          car.color
        );
      }
    }

    addLog("💬", `@${data.user}: ${data.comment}`);
    return;
  }

  if (event === "gift") {
    const index = Number(data.effect?.carIndex) || 0;
    const car = cars[index];

    if (car) {
      car.superBoost = Math.min(
        car.superBoost + Number(data.effect?.duration) / 1000,
        5
      );

      car.speedBoost = Math.min(
        car.speedBoost + Number(data.effect?.boost),
        2
      );

      addEffect(
        car.x,
        car.y - 40,
        `🎁 ${data.giftName}`,
        "#facc15"
      );

      for (let i = 0; i < 30; i++) {
        particles.push({
          x: car.x,
          y: car.y,
          vx: (Math.random() - 0.5) * 400,
          vy: (Math.random() - 0.5) * 400,
          gravity: 100,
          life: 0.5 + Math.random(),
          maxLife: 1.5,
          size: 2 + Math.random() * 5,
          color: Math.random() > 0.5 ? "#facc15" : "#fb7185"
        });
      }
    }

    addLog(
      "🎁",
      `@${data.user} mengirim ${data.giftName} x${data.repeatCount}`
    );
  }
}

function addLog(icon, message) {
  const placeholder = activityLog.querySelector(".text-slate-500");
  if (placeholder) placeholder.remove();

  const item = document.createElement("div");
  item.className =
    "rounded-xl bg-slate-950/70 border border-white/5 p-3 text-sm";

  const time = new Date().toLocaleTimeString();

  item.innerHTML = `
    <div class="flex gap-2">
      <span>${icon}</span>
      <div class="flex-1">
        <div class="text-slate-200">${escapeHtml(message)}</div>
        <div class="text-[10px] text-slate-500 mt-1">${time}</div>
      </div>
    </div>
  `;

  activityLog.prepend(item);

  while (activityLog.children.length > 80) {
    activityLog.lastElementChild.remove();
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function connectWebSocket() {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  const url = `${protocol}//${location.host}/ws`;

  websocket = new WebSocket(url);

  websocket.addEventListener("open", () => {
    console.log("[WS] Connected");
  });

  websocket.addEventListener("message", (event) => {
    try {
      handleServerMessage(JSON.parse(event.data));
    } catch (error) {
      console.error("[WS] Invalid message:", error);
    }
  });

  websocket.addEventListener("close", () => {
    console.log("[WS] Closed");
    setStatus("disconnected");

    setTimeout(connectWebSocket, 2000);
  });

  websocket.addEventListener("error", (error) => {
    console.error("[WS] Error:", error);
  });
}

function sendWebSocket(data) {
  if (websocket && websocket.readyState === WebSocket.OPEN) {
    websocket.send(JSON.stringify(data));
  } else {
    addLog("⚠️", "WebSocket belum terhubung.");
  }
}

function handleServerMessage(data) {
  if (data.type === "status") {
    setStatus(data.status);
    return;
  }

  if (data.type === "error") {
    addLog("❌", data.message);
    return;
  }

  if (data.type === "tiktok_event") {
    handleTikTokEvent(data);
    return;
  }

  if (data.type === "viewer_count") {
    viewerCount.textContent =
      Number(data.viewerCount).toLocaleString();
  }
}

function setStatus(status) {
  statusDot.className = "status-dot";

  if (status === "connecting") {
    statusDot.classList.add("bg-yellow-400");
    statusText.textContent = "Connecting...";
    connectBtn.disabled = true;
    disconnectBtn.disabled = false;
    return;
  }

  if (status === "connected") {
    statusDot.classList.add("bg-green-500");
    statusText.textContent = "Connected";
    connectBtn.disabled = true;
    disconnectBtn.disabled = false;
    return;
  }

  statusDot.classList.add("bg-red-500");
  statusText.textContent = "Disconnected";
  connectBtn.disabled = false;
  disconnectBtn.disabled = true;
}

connectBtn.addEventListener("click", () => {
  const username = usernameInput.value.trim();

  if (!username) {
    addLog("⚠️", "Masukkan username TikTok terlebih dahulu.");
    usernameInput.focus();
    return;
  }

  sendWebSocket({
    type: "connect",
    username
  });
});

disconnectBtn.addEventListener("click", () => {
  sendWebSocket({ type: "disconnect" });
});

usernameInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") connectBtn.click();
});

clearLog.addEventListener("click", () => {
  activityLog.innerHTML =
    '<div class="text-sm text-slate-500">Belum ada event...</div>';
});

function gameLoop(now) {
  const delta = Math.min((now - lastFrameTime) / 1000, 0.05);
  lastFrameTime = now;

  update(delta);
  draw();

  requestAnimationFrame(gameLoop);
}

createCars();
resetRace();
connectWebSocket();
requestAnimationFrame(gameLoop);
