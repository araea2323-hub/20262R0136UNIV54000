"use strict";

const canvas = document.getElementById("game");
const context = canvas.getContext("2d");
const scoreDisplay = document.getElementById("score");
const startButton = document.getElementById("start-button");

const GROUND_Y = 220;
const dinosaur = { x: 80, y: GROUND_Y, width: 36, height: 48, velocityY: 0 };
let state = "ready";
let obstacles = [];
let spawnTimer = 0;
let spawnInterval = 1.5;
let elapsed = 0;
let score = 0;
let groundOffset = 0;
let restartAllowedAt = 0;
let lastTimestamp = null;

function resetGame() {
  dinosaur.y = GROUND_Y;
  dinosaur.velocityY = 0;
  obstacles = [];
  spawnTimer = 0;
  spawnInterval = 1.5;
  elapsed = 0;
  score = 0;
  groundOffset = 0;
  restartAllowedAt = 0;
  lastTimestamp = null;
  scoreDisplay.textContent = "0";
}

function startOrJump() {
  if (state === "gameover" && performance.now() < restartAllowedAt) {
    return;
  }

  if (state === "ready" || state === "gameover") {
    resetGame();
    state = "running";
    startButton.textContent = "점프";
  }

  if (dinosaur.y === GROUND_Y) {
    dinosaur.velocityY = -650;
  }
}

function isColliding(obstacle) {
  const left = dinosaur.x + 4;
  const right = dinosaur.x + dinosaur.width - 4;
  const top = dinosaur.y - dinosaur.height + 4;
  const bottom = dinosaur.y - 4;

  return left < obstacle.x + obstacle.width &&
    right > obstacle.x &&
    top < GROUND_Y &&
    bottom > GROUND_Y - obstacle.height;
}

function update(deltaTime) {
  elapsed += deltaTime;
  score = Math.floor(elapsed * 10);
  scoreDisplay.textContent = String(score);
  const speed = Math.min(500, 320 + elapsed * 5);

  dinosaur.velocityY += 1900 * deltaTime;
  dinosaur.y += dinosaur.velocityY * deltaTime;
  if (dinosaur.y >= GROUND_Y && dinosaur.velocityY >= 0) {
    dinosaur.y = GROUND_Y;
    dinosaur.velocityY = 0;
  }

  spawnTimer += deltaTime;
  if (spawnTimer >= spawnInterval) {
    spawnTimer -= spawnInterval;
    obstacles.push({ x: 920, width: 24, height: 44 });
    spawnInterval = 1.3 + Math.random() * 0.6;
  }

  groundOffset = (groundOffset + speed * deltaTime) % 60;
  for (const obstacle of obstacles) {
    obstacle.x -= speed * deltaTime;
  }
  obstacles = obstacles.filter((obstacle) => obstacle.x + obstacle.width > 0);

  if (obstacles.some(isColliding)) {
    state = "gameover";
    restartAllowedAt = performance.now() + 400;
    startButton.textContent = "재시작";
  }
}

function drawDinosaur() {
  const x = dinosaur.x;
  const y = Math.round(dinosaur.y) - dinosaur.height;
  const stride = state === "running" && dinosaur.y === GROUND_Y
    ? Math.floor(elapsed * 12) % 2
    : -1;

  context.fillStyle = "#414141";
  // 오른쪽을 보는 큰 주둥이와 가는 목.
  context.fillRect(x + 16, y, 18, 2);
  context.fillRect(x + 14, y + 2, 22, 12);
  context.fillRect(x + 14, y + 14, 16, 4);
  context.fillRect(x + 14, y + 18, 10, 10);

  // 위로 올라간 꼬리에서 엉덩이까지 계단 모양으로 연결합니다.
  context.fillRect(x, y + 18, 4, 8);
  context.fillRect(x + 4, y + 22, 4, 10);
  context.fillRect(x + 8, y + 26, 4, 10);
  context.fillRect(x + 12, y + 24, 14, 12);
  context.fillRect(x + 10, y + 34, 14, 6);
  context.fillRect(x + 24, y + 24, 6, 3);
  context.fillRect(x + 28, y + 27, 3, 4);

  // 달릴 때만 두 다리를 번갈아 굽히고, 대기·점프 중에는 펴 둡니다.
  if (stride === 1) {
    context.fillRect(x + 10, y + 38, 5, 5);
    context.fillRect(x + 7, y + 41, 8, 3);
  } else {
    context.fillRect(x + 10, y + 38, 5, 10);
    context.fillRect(x + 13, y + 45, 6, 3);
  }
  if (stride === 0) {
    context.fillRect(x + 21, y + 36, 5, 6);
    context.fillRect(x + 24, y + 40, 7, 4);
  } else {
    context.fillRect(x + 21, y + 36, 5, 12);
    context.fillRect(x + 24, y + 45, 6, 3);
  }

  context.fillStyle = "#fafafa";
  context.fillRect(x + 20, y + 4, 3, 3);
  context.fillRect(x + 26, y + 12, 10, 2);
}

function drawCactus(obstacle) {
  const x = Math.round(obstacle.x);
  const y = GROUND_Y - obstacle.height;
  context.fillStyle = "#414141";
  context.fillRect(x + 9, y, 8, 44);
  context.fillRect(x, y + 12, 6, 19);
  context.fillRect(x + 18, y + 8, 6, 23);
  context.fillRect(x, y + 25, 24, 6);
}

function draw() {
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#777";
  context.fillRect(0, GROUND_Y, canvas.width, 2);
  for (let x = -60; x < canvas.width + 60; x += 60) {
    context.fillRect(Math.round(x - groundOffset), GROUND_Y + 11, 5, 2);
    context.fillRect(Math.round(x + 26 - groundOffset), GROUND_Y + 21, 3, 2);
  }

  drawDinosaur();
  obstacles.forEach(drawCactus);

  if (state !== "running") {
    context.textAlign = "center";
    context.fillStyle = "#414141";
    context.font = "bold 26px Arial, sans-serif";
    context.fillText(state === "ready" ? "Space 또는 클릭으로 시작" : "게임 오버", 450, 90);
    if (state === "gameover") {
      context.font = "18px Arial, sans-serif";
      context.fillText("Space / ↑ / 클릭으로 재시작", 450, 123);
    }
  }
}

function frame(timestamp) {
  const deltaTime = lastTimestamp === null
    ? 0
    : Math.min(Math.max((timestamp - lastTimestamp) / 1000, 0), 0.033);
  lastTimestamp = timestamp;

  if (state === "running" && !document.hidden) {
    update(deltaTime);
  }
  draw();
  requestAnimationFrame(frame);
}

document.addEventListener("keydown", (event) => {
  if (event.code !== "Space" && event.code !== "ArrowUp") {
    return;
  }
  // 버튼의 기본 Space 클릭도 막고 같은 입력 경로로 한 번만 처리합니다.
  event.preventDefault();
  if (!event.repeat) {
    startOrJump();
  }
});

canvas.addEventListener("pointerdown", (event) => {
  if (event.isPrimary && event.button === 0) {
    event.preventDefault();
    startOrJump();
  }
});
startButton.addEventListener("click", startOrJump);
document.addEventListener("visibilitychange", () => {
  lastTimestamp = null;
});

requestAnimationFrame(frame);
