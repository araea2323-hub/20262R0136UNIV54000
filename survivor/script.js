"use strict";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const ui = Object.fromEntries([
  "level", "score", "time", "kills", "shield-status", "progress-label", "progress-fill",
  "progress", "start-button", "upgrade-overlay", "upgrade-level", "upgrade-choices", "ability-grid"
].map((id) => [id, document.getElementById(id)]));
const GROUND = 300;
const INK = "#394237";
const PAPER = "#fafbf6";
const dinosaur = { x: 90, y: GROUND, width: 36, height: 48, velocityY: 0, airJumps: 0 };
const abilities = [
  { id: "beam", name: "입 빔", tag: "AUTO / LASER", summary: "입에서 전방으로 관통 빔을 발사합니다.",
    detail: (n) => `${interval("beam", n).toFixed(1)}초마다 두께 ${8 + n * 4}px의 관통 빔` },
  { id: "jump", name: "도약 강화", tag: "PASSIVE / JUMP", summary: "더 높이, 더 멀리 뛰어넘습니다.",
    detail: (n) => `도약력 +${Math.round((jumpVelocity(n) / 650 - 1) * 100)}% · 높이와 체공 시간 증가` },
  { id: "meteor", name: "운석 소환", tag: "AUTO / METEOR", summary: "운석을 떨어뜨려 주변을 파괴합니다.",
    detail: (n) => `${interval("meteor", n).toFixed(1)}초마다 운석 · 폭발 반경 ${72 + n * 12}px` },
  { id: "shield", name: "보호막", tag: "DEFENSE / SHIELD", summary: "충돌을 흡수하고 자동 충전합니다.",
    detail: (n) => `최대 ${n}회 방어 · ${interval("shield", n).toFixed(1)}초마다 1회 충전` },
  { id: "pulse", name: "지면 충격파", tag: "AUTO / WAVE", summary: "전방의 지상 장애물을 쓸어버립니다.",
    detail: (n) => `${interval("pulse", n).toFixed(1)}초마다 반경 ${100 + n * 20}px 지상 충격파` },
  { id: "drone", name: "지원 드론", tag: "AUTO / DRONE", summary: "유도탄으로 가까운 장애물을 추적합니다.",
    detail: (n) => `${interval("drone", n).toFixed(1)}초마다 유도탄 · 탄 크기 ${3 + n}px` },
  { id: "lightning", name: "연쇄 번개", tag: "AUTO / CHAIN", summary: "여러 장애물에 번개가 연쇄 적중합니다.",
    detail: (n) => `${interval("lightning", n).toFixed(1)}초마다 최대 ${n + 1}개 연쇄 파괴` },
  { id: "frost", name: "냉기장", tag: "PASSIVE / FROST", summary: "주변 장애물의 이동을 느리게 합니다.",
    detail: (n) => `반경 ${140 + n * 10}px · 이동 속도 ${Math.round((1 - frostFactor(n)) * 100)}% 감소` },
  { id: "airjump", name: "공중 도약", tag: "PASSIVE / AIR", summary: "공중에서도 한 번 더 점프합니다.",
    detail: (n) => `착지 전까지 공중에서 ${n}회 추가 점프 가능` }
];
let state = "ready";
let levels = {};
let cooldowns = {};
let obstacles = [];
let effects = [];
let projectiles = [];
let choices = [];
let elapsed = 0;
let scoreValue = 0;
let kills = 0;
let level = 1;
let levelStartScore = 0;
let nextLevelScore = 80;
let spawnTimer = 1.5;
let shieldCharges = 0;
let shieldTimer = 0;
let invulnerable = 0;
let restartAllowedAt = 0;
let lastTimestamp = null;

function interval(id, n) {
  const timing = { beam: [4.5, .8], meteor: [8, 3], shield: [13, 4], pulse: [6, 1.5], drone: [3, .45], lightning: [7, 2] }[id];
  return timing ? timing[1] + (timing[0] - timing[1]) * .82 ** (n - 1) : 0;
}
function jumpVelocity(n) { return 650 + 160 * (1 - .75 ** n); }
function frostFactor(n) { return 1 - .6 * (1 - .78 ** n); }
function speed() { return Math.min(420, 320 + elapsed * .65); }
function spawnDelay() { return Math.max(.48, 1.65 - elapsed * .012); }
function center(obstacle) { return { x: obstacle.x + obstacle.w / 2, y: obstacle.y + obstacle.h / 2 }; }
function visibleTargets() { return obstacles.filter((o) => o.alive && o.x + o.w > dinosaur.x && o.x < 880).sort((a, b) => a.x - b.x); }
function addEffect(type, x, y, duration, extra = {}) {
  effects.push({ type, x, y, life: duration, duration, ...extra });
}

function resetGame() {
  levels = Object.fromEntries(abilities.map((a) => [a.id, 0]));
  cooldowns = Object.fromEntries(abilities.map((a) => [a.id, 0]));
  dinosaur.y = GROUND;
  dinosaur.velocityY = 0;
  dinosaur.airJumps = 0;
  obstacles = [];
  effects = [];
  projectiles = [];
  choices = [];
  elapsed = 0;
  scoreValue = 0;
  kills = 0;
  level = 1;
  levelStartScore = 0;
  nextLevelScore = 80;
  spawnTimer = 1.5;
  shieldCharges = 0;
  shieldTimer = 0;
  invulnerable = 0;
  restartAllowedAt = 0;
  lastTimestamp = null;
  ui["upgrade-overlay"].hidden = true;
  ui["upgrade-choices"].replaceChildren();
  ui["start-button"].disabled = false;
  renderBuild();
  updateHud();
}

function startOrJump() {
  if (choices.length || (state === "gameover" && performance.now() < restartAllowedAt)) return;
  if (state !== "running") {
    resetGame();
    state = "running";
    ui["start-button"].textContent = "점프 ↑";
  }
  const grounded = dinosaur.y === GROUND;
  if (!grounded && dinosaur.airJumps >= levels.airjump) return;
  if (!grounded) {
    dinosaur.airJumps++;
    addEffect("jump", dinosaur.x + 18, dinosaur.y, .35);
  }
  dinosaur.velocityY = -jumpVelocity(levels.jump);
}

function breakObstacle(obstacle) {
  if (!obstacle.alive) return;
  obstacle.alive = false;
  kills++;
  scoreValue += 12;
  const p = center(obstacle);
  addEffect("debris", p.x, p.y, .4, { color: obstacle.kind === "bird" ? "#9c8f65" : "#7d8b65" });
}

function spawnWave() {
  const roll = Math.random();
  const kind = elapsed >= 15 && roll < .24 ? "bird" : elapsed >= 8 && roll < .48 ? "rock" : "cactus";
  const count = kind === "bird" ? 1 : 1 + (elapsed > 20 && Math.random() < .45 ? 1 : 0) + (elapsed > 60 && Math.random() < .35 ? 1 : 0);
  for (let i = 0; i < count; i++) {
    const w = kind === "bird" ? 34 : kind === "rock" ? 34 : 24;
    const h = kind === "bird" ? 22 : kind === "rock" ? 32 : 44;
    const y = kind === "bird" ? GROUND - (Math.random() < .5 ? 82 : 122) : GROUND - h;
    obstacles.push({ x: 920 + i * 56, y, w, h, kind, alive: true, phase: Math.random() * Math.PI * 2 });
  }
}

function fireAbility(id) {
  const targets = visibleTargets();
  if (!targets.length) return false;
  const n = levels[id];
  const mouthX = dinosaur.x + 34;
  const mouthY = dinosaur.y - 36;
  if (id === "beam") {
    addEffect("beam", mouthX, mouthY, .2, { thickness: 8 + n * 4 });
  } else if (id === "meteor") {
    const target = targets.find((o) => o.x > dinosaur.x + 100) || targets[0];
    addEffect("meteor", center(target).x, GROUND - 18, .55, { radius: 72 + n * 12 });
  } else if (id === "pulse") {
    const x = dinosaur.x + 100;
    const radius = 100 + n * 20;
    obstacles.filter((o) => o.alive && o.kind !== "bird" && Math.abs(center(o).x - x) < radius + o.w / 2).forEach(breakObstacle);
    addEffect("pulse", x, GROUND, .45, { radius });
  } else if (id === "drone") {
    projectiles.push({ x: dinosaur.x + 48, y: dinosaur.y - 76, target: targets[0], radius: 3 + n, life: 3 });
  } else if (id === "lightning") {
    let from = { x: dinosaur.x + 28, y: dinosaur.y - 48 };
    targets.slice(0, n + 1).forEach((obstacle) => {
      const p = center(obstacle);
      addEffect("lightning", from.x, from.y, .24, { toX: p.x, toY: p.y });
      breakObstacle(obstacle);
      from = p;
    });
  }
  return true;
}

function updateAbilities(dt) {
  for (const id of ["beam", "meteor", "pulse", "drone", "lightning"]) {
    if (!levels[id]) continue;
    cooldowns[id] = Math.max(0, cooldowns[id] - dt);
    if (cooldowns[id] <= 0 && fireAbility(id)) cooldowns[id] = interval(id, levels[id]);
  }
  if (levels.shield && shieldCharges < levels.shield) {
    shieldTimer += dt;
    if (shieldTimer >= interval("shield", levels.shield)) {
      shieldCharges++;
      shieldTimer = 0;
    }
  }
}

function updateProjectiles(dt) {
  for (const shot of projectiles) {
    shot.life -= dt;
    if (!shot.target.alive || shot.target.x < -shot.target.w) shot.target = visibleTargets()[0];
    if (!shot.target) { shot.life = 0; continue; }
    const p = center(shot.target);
    const dx = p.x - shot.x;
    const dy = p.y - shot.y;
    const distance = Math.hypot(dx, dy);
    const travel = 620 * dt;
    if (distance <= travel + shot.radius + Math.min(shot.target.w, shot.target.h) / 2) {
      breakObstacle(shot.target);
      shot.life = 0;
    } else {
      shot.x += dx / distance * travel;
      shot.y += dy / distance * travel;
    }
  }
  projectiles = projectiles.filter((shot) => shot.life > 0);
}

function updateEffects(dt) {
  for (const effect of [...effects]) {
    effect.life -= dt;
    if (effect.type === "beam") {
      obstacles.filter((o) => o.alive && o.x + o.w > effect.x && o.x < 900 && o.y < effect.y + effect.thickness / 2 && o.y + o.h > effect.y - effect.thickness / 2).forEach(breakObstacle);
    } else if (effect.type === "meteor") {
      effect.x -= speed() * dt;
      if (effect.life <= 0) {
        obstacles.filter((o) => {
          const dx = Math.max(o.x - effect.x, 0, effect.x - o.x - o.w);
          const dy = Math.max(o.y - effect.y, 0, effect.y - o.y - o.h);
          return o.alive && Math.hypot(dx, dy) <= effect.radius;
        }).forEach(breakObstacle);
        addEffect("explosion", effect.x, effect.y, .5, { radius: effect.radius });
      }
    }
  }
  effects = effects.filter((effect) => effect.life > 0);
}

function collides(obstacle) {
  return dinosaur.x + 4 < obstacle.x + obstacle.w && dinosaur.x + 32 > obstacle.x &&
    dinosaur.y - 44 < obstacle.y + obstacle.h && dinosaur.y - 4 > obstacle.y;
}

function update(dt) {
  elapsed += dt;
  scoreValue += dt * 10;
  invulnerable = Math.max(0, invulnerable - dt);
  dinosaur.velocityY += 1900 * dt;
  dinosaur.y += dinosaur.velocityY * dt;
  if (dinosaur.y >= GROUND && dinosaur.velocityY >= 0) {
    dinosaur.y = GROUND;
    dinosaur.velocityY = 0;
    dinosaur.airJumps = 0;
  }
  // 추가 도약을 여러 번 획득해도 화면 위로 사라지지 않습니다.
  if (dinosaur.y < 56) { dinosaur.y = 56; dinosaur.velocityY = Math.max(0, dinosaur.velocityY); }

  spawnTimer -= dt;
  if (spawnTimer <= 0) {
    spawnWave();
    spawnTimer += spawnDelay() * (.88 + Math.random() * .24);
  }
  for (const obstacle of obstacles) {
    const p = center(obstacle);
    const inFrost = levels.frost && Math.hypot(p.x - dinosaur.x - 18, p.y - dinosaur.y + 24) < 140 + levels.frost * 10;
    obstacle.x -= speed() * (inFrost ? frostFactor(levels.frost) : 1) * dt;
  }

  updateAbilities(dt);
  updateProjectiles(dt);
  updateEffects(dt);
  const collision = obstacles.find((o) => o.alive && collides(o));
  if (collision && invulnerable <= 0) {
    if (shieldCharges > 0) {
      shieldCharges--;
      invulnerable = 1.1;
      breakObstacle(collision);
      addEffect("shield", dinosaur.x + 18, dinosaur.y - 24, .5);
    } else {
      state = "gameover";
      restartAllowedAt = performance.now() + 400;
      ui["start-button"].textContent = "다시 시작 ↗";
    }
  }
  obstacles = obstacles.filter((o) => o.alive && o.x + o.w > -10);
  if (state === "running" && scoreValue >= nextLevelScore) openUpgrade();
}

function shuffled(list) {
  const result = [...list];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function openUpgrade() {
  level++;
  levelStartScore = nextLevelScore;
  nextLevelScore += 80 + (level - 1) * 25;
  choices = level === 2 ? ["beam", "jump", "meteor"] : shuffled(abilities.map((a) => a.id)).slice(0, 3);
  // 아직 공격 능력이 없으면 자동 공격을 얻을 기회를 보장합니다.
  const attacks = ["beam", "meteor", "pulse", "drone", "lightning"];
  if (!attacks.some((id) => levels[id]) && !choices.some((id) => attacks.includes(id))) choices[0] = shuffled(attacks)[0];
  ui["upgrade-level"].textContent = `LEVEL ${String(level).padStart(2, "0")}`;
  ui["upgrade-choices"].replaceChildren();
  choices.forEach((id, index) => {
    const ability = abilities.find((a) => a.id === id);
    const card = document.createElement("button");
    card.type = "button";
    card.className = "upgrade-card";
    card.innerHTML = `<span class="card-tag">${levels[id] ? "강화" : "신규"} · LV.${levels[id] + 1}</span><span class="card-key">0${index + 1}</span><strong>${ability.name}</strong><span class="card-detail">${ability.detail(levels[id] + 1)}</span>`;
    card.addEventListener("click", () => chooseUpgrade(index));
    ui["upgrade-choices"].append(card);
  });
  ui["upgrade-overlay"].hidden = false;
  ui["start-button"].disabled = true;
  ui["upgrade-choices"].firstElementChild.focus({ preventScroll: true });
}

function chooseUpgrade(index) {
  const id = choices[index];
  if (!id) return;
  levels[id]++;
  cooldowns[id] = 0;
  if (id === "shield") { shieldCharges = Math.min(levels.shield, shieldCharges + 1); shieldTimer = 0; }
  choices = [];
  ui["upgrade-overlay"].hidden = true;
  ui["start-button"].disabled = false;
  ui["start-button"].focus({ preventScroll: true });
  lastTimestamp = null;
  renderBuild();
  updateHud();
}

function renderBuild() {
  ui["ability-grid"].replaceChildren();
  abilities.forEach((ability, index) => {
    const n = levels[ability.id];
    const slot = document.createElement("div");
    slot.className = `ability-slot${n ? " active" : ""}`;
    slot.innerHTML = `<div class="slot-top"><span class="slot-number">${String(index + 1).padStart(2, "0")}</span><strong>${ability.name}</strong><span class="slot-level">${n ? `LV.${n}` : "미획득"}</span></div><p>${n ? ability.detail(n) : ability.summary}</p>`;
    ui["ability-grid"].append(slot);
  });
}

function updateHud() {
  ui.level.textContent = String(level);
  ui.score.textContent = String(Math.floor(scoreValue));
  ui.time.textContent = `${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(Math.floor(elapsed % 60)).padStart(2, "0")}`;
  ui.kills.textContent = String(kills);
  ui["shield-status"].textContent = levels.shield ? `보호막 ${shieldCharges}/${levels.shield}${shieldCharges < levels.shield ? ` · ${Math.ceil(interval("shield", levels.shield) - shieldTimer)}초` : ""}` : "보호막 미장착";
  ui["progress-label"].textContent = `다음 진화까지 ${Math.max(0, Math.ceil(nextLevelScore - scoreValue))}점`;
  const progress = Math.min(100, Math.max(0, (scoreValue - levelStartScore) / (nextLevelScore - levelStartScore) * 100));
  ui["progress-fill"].style.width = `${progress}%`;
  ui.progress.setAttribute("aria-valuenow", String(Math.round(progress)));
}

function drawDinosaur() {
  const x = dinosaur.x;
  const y = Math.round(dinosaur.y) - 48;
  const stride = state === "running" && dinosaur.y === GROUND ? Math.floor(elapsed * 12) % 2 : -1;
  ctx.save();
  if (invulnerable > 0 && Math.floor(elapsed * 14) % 2) ctx.globalAlpha = .35;
  ctx.fillStyle = INK;
  for (const [dx, dy, w, h] of [[16,0,18,2],[14,2,22,12],[14,14,16,4],[14,18,10,10],[0,18,4,8],[4,22,4,10],[8,26,4,10],[12,24,14,12],[10,34,14,6],[24,24,6,3],[28,27,3,4]]) ctx.fillRect(x + dx, y + dy, w, h);
  if (stride === 1) { ctx.fillRect(x + 10, y + 38, 5, 5); ctx.fillRect(x + 7, y + 41, 8, 3); }
  else { ctx.fillRect(x + 10, y + 38, 5, 10); ctx.fillRect(x + 13, y + 45, 6, 3); }
  if (stride === 0) { ctx.fillRect(x + 21, y + 36, 5, 6); ctx.fillRect(x + 24, y + 40, 7, 4); }
  else { ctx.fillRect(x + 21, y + 36, 5, 12); ctx.fillRect(x + 24, y + 45, 6, 3); }
  ctx.fillStyle = PAPER;
  ctx.fillRect(x + 20, y + 4, 3, 3);
  ctx.fillRect(x + 26, y + 12, 10, 2);
  ctx.restore();
}

function ring(x, y, radius, color, fill = false) {
  ctx.beginPath(); ctx.arc(x, y, Math.max(1, radius), 0, Math.PI * 2);
  if (fill) { ctx.fillStyle = color; ctx.fill(); }
  else { ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.stroke(); }
}

function drawObstacle(o) {
  const x = Math.round(o.x);
  const y = Math.round(o.y);
  ctx.fillStyle = o.kind === "bird" ? "#747057" : INK;
  if (o.kind === "cactus") {
    for (const [dx, dy, w, h] of [[9,0,8,44],[0,12,6,19],[18,8,6,23],[0,25,24,6]]) ctx.fillRect(x + dx, y + dy, w, h);
  } else if (o.kind === "rock") {
    for (const [dx, dy, w, h] of [[7,0,19,5],[3,5,27,8],[0,13,34,19]]) ctx.fillRect(x + dx, y + dy, w, h);
    ctx.fillStyle = "#8a9381"; ctx.fillRect(x + 8, y + 6, 4, 9); ctx.fillRect(x + 12, y + 13, 7, 3);
  } else {
    const flap = Math.sin(elapsed * 15 + o.phase) > 0;
    ctx.fillRect(x + 10, y + 9, 18, 7); ctx.fillRect(x + 25, y + 5, 7, 7); ctx.fillRect(x + 31, y + 9, 3, 3);
    ctx.fillRect(x + 14, y + (flap ? 0 : 14), 6, 8); ctx.fillRect(x + 4, y + (flap ? 3 : 16), 12, 5); ctx.fillRect(x, y + 12, 10, 3);
    ctx.fillStyle = PAPER; ctx.fillRect(x + 28, y + 7, 2, 2);
  }
}

function drawEffect(e) {
  const t = 1 - e.life / e.duration;
  ctx.save();
  if (e.type === "beam") {
    ctx.globalAlpha = Math.min(1, e.life * 12); ctx.fillStyle = "#8cbf4b";
    ctx.fillRect(e.x, e.y - e.thickness / 2, 900 - e.x, e.thickness);
    ctx.fillStyle = "#edffd4"; ctx.fillRect(e.x, e.y - 2, 900 - e.x, 4);
  } else if (e.type === "meteor") {
    ring(e.x, GROUND - 3, e.radius * .45, "#d8a26b");
    const fall = e.y - (1 - t) * 380;
    ctx.fillStyle = "#edba78"; ctx.fillRect(e.x - 6, fall - 23, 14, 25);
    ctx.fillStyle = "#99754b"; ctx.fillRect(e.x - 10, fall - 8, 20, 18);
    ctx.fillStyle = "#e8cd9c"; ctx.fillRect(e.x - 4, fall - 4, 6, 6);
  } else if (e.type === "lightning") {
    ctx.strokeStyle = "#a18a3b"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(e.x, e.y);
    ctx.lineTo((e.x + e.toX) / 2 - 12, (e.y + e.toY) / 2 - 16);
    ctx.lineTo((e.x + e.toX) / 2 + 8, (e.y + e.toY) / 2 + 8); ctx.lineTo(e.toX, e.toY); ctx.stroke();
  } else if (e.type === "debris") {
    ctx.globalAlpha = 1 - t; ctx.fillStyle = e.color;
    for (let i = 0; i < 6; i++) {
      const angle = i * Math.PI / 3;
      ctx.fillRect(e.x + Math.cos(angle) * t * 30, e.y + Math.sin(angle) * t * 30 + t * t * 16, 4, 4);
    }
  } else {
    ctx.globalAlpha = 1 - t;
    const colors = { pulse: "#9abd57", explosion: "#dfb475", shield: "#8faec0", jump: "#a2ba7b" };
    ring(e.x, e.y, (e.radius || 50) * t, colors[e.type] || "#a2ba7b");
    if (e.type === "explosion") ring(e.x, e.y, e.radius * t * .7, "#f1dbb9", true);
  }
  ctx.restore();
}

function draw() {
  ctx.clearRect(0, 0, 900, 360);
  ctx.fillStyle = PAPER; ctx.fillRect(0, 0, 900, 360);
  ctx.fillStyle = "#edf0e5";
  for (let i = 0; i < 6; i++) {
    // 먼 배경과 지면 무늬를 고정해 반복 스크롤의 튐을 없앱니다.
    const x = i * 188 - 40;
    ctx.fillRect(x, 252 - (i % 3) * 16, 94, 48 + (i % 3) * 16);
    ctx.fillRect(x + 18, 238 - (i % 3) * 16, 58, 14);
  }
  ctx.fillStyle = "#b4bea7"; ctx.fillRect(0, GROUND, 900, 2);
  for (let x = -60; x < 960; x += 60) {
    ctx.fillRect(x, GROUND + 12, 5, 2);
    ctx.fillRect(x + 26, GROUND + 23, 3, 2);
  }
  if (levels.frost) {
    ring(dinosaur.x + 18, dinosaur.y - 24, 140 + levels.frost * 10, "#b1d3dc33", true);
    ring(dinosaur.x + 18, dinosaur.y - 24, 140 + levels.frost * 10, "#b5d0d8");
  }
  obstacles.filter((o) => o.alive).forEach(drawObstacle);
  drawDinosaur();
  if (shieldCharges) ring(dinosaur.x + 18, dinosaur.y - 25, 35, "#85a8b9");
  if (levels.drone) {
    const x = dinosaur.x + 48, y = dinosaur.y - 76 + Math.sin(elapsed * 4) * 4;
    ctx.fillStyle = "#657650"; ctx.fillRect(x - 9, y - 5, 18, 11);
    ctx.fillRect(x - 15, y - 9, 30, 3); ctx.fillStyle = "#c7f36b"; ctx.fillRect(x - 3, y - 1, 6, 3);
  }
  for (const shot of projectiles) ring(shot.x, shot.y, shot.radius, "#8fae58", true);
  effects.forEach(drawEffect);

  if (state !== "running") {
    ctx.textAlign = "center"; ctx.fillStyle = INK; ctx.font = "bold 27px Arial, sans-serif";
    ctx.fillText(state === "ready" ? "작은 공룡의 커다란 진화" : "이번 진화는 여기까지", 450, 111);
    ctx.font = "14px Arial, sans-serif"; ctx.fillStyle = "#7b876d";
    ctx.fillText(state === "ready" ? "Space 또는 클릭으로 시작 · 80점에서 첫 능력 선택" : `LV.${level} · ${Math.floor(scoreValue)}점 · ${kills}개 파괴`, 450, 141);
    if (state === "gameover") ctx.fillText("Space 또는 클릭으로 다시 시작", 450, 169);
  }
}

function frame(timestamp) {
  const dt = lastTimestamp === null ? 0 : Math.min(Math.max((timestamp - lastTimestamp) / 1000, 0), .033);
  lastTimestamp = timestamp;
  if (state === "running" && !choices.length && !document.hidden) update(dt);
  updateHud();
  draw();
  requestAnimationFrame(frame);
}

document.addEventListener("keydown", (event) => {
  if (choices.length) {
    if (event.code === "Tab") {
      const buttons = [...ui["upgrade-choices"].children];
      const index = buttons.indexOf(document.activeElement);
      event.preventDefault();
      buttons[(index + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length].focus();
    }
    const pick = { Digit1: 0, Digit2: 1, Digit3: 2, Numpad1: 0, Numpad2: 1, Numpad3: 2 }[event.code];
    if (pick !== undefined) { event.preventDefault(); if (!event.repeat) chooseUpgrade(pick); }
    if (event.code === "ArrowUp") event.preventDefault();
    if (event.code === "Space" && !ui["upgrade-choices"].contains(event.target)) event.preventDefault();
    return;
  }
  if (event.code !== "Space" && event.code !== "ArrowUp") return;
  event.preventDefault();
  if (!event.repeat) startOrJump();
});
canvas.addEventListener("pointerdown", (event) => {
  if (event.isPrimary && event.button === 0) { event.preventDefault(); startOrJump(); }
});
ui["start-button"].addEventListener("click", startOrJump);
document.addEventListener("visibilitychange", () => { lastTimestamp = null; });

resetGame();
requestAnimationFrame(frame);
