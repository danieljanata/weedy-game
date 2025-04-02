//-----------------------------------------------------
// 1) Načtení obrázků
//-----------------------------------------------------
const images = {
  background: new Image(),
  sakl: new Image(),
  leafGreen: new Image(),
  leafWhite: new Image(),
  bombRed: new Image(),
  bombOrange: new Image(),
  heart: new Image(),
  weedyGame: new Image(), // 221×221
  shield: new Image()      // Nový shield
};

images.background.src = "images/pozadi_1.png";   
images.sakl.src       = "images/sakl.png";      
images.leafGreen.src  = "images/leaf_green_1.png";      
images.leafWhite.src  = "images/leaf_white_1.png"; 
images.bombRed.src    = "images/bomb_red.png";
images.bombOrange.src = "images/bomb_orange.png";
images.heart.src      = "images/heart_red_1.png";
images.weedyGame.src  = "images/weedy_game.png"; 
images.shield.src     = "images/shield.png";

//-----------------------------------------------------
// 2) Canvas a proměnné
//-----------------------------------------------------
const canvas = document.getElementById("gameCanvas");
const ctx    = canvas.getContext("2d");

const gameWidth  = canvas.width;   // 400
const gameHeight = canvas.height;  // 500

// Objekt hráče – pytel (sakl)
let sakl = {
  x: gameWidth/2 - 32,
  y: gameHeight - 70,
  width: 64,
  height: 64,
  speed: 6,
  dx: 0
};

let items = [];         // Padající předměty
let particles = [];     // Částice

let score = 0;
let lives = 3;
let gameOver = false;
let gameOverStartTime = null;
let gameOverTimestamp = 0; // Čas, kdy hra skončila (pro restart delay)
const GAME_OVER_DELAY = 1500;

let gameSpeed = 1;
let speedTimeout = null;

let lastGreenItemTime = 0;
let minGreenItemInterval = 1000;
let spawnedFastItems = 0;

let windActive = false;
let windTimer  = 0;
let windDirection = 1;

let reboundThreshold = gameHeight * 0.4;
let removeMargin = 50;

//-----------------------------------------------------
// Nové proměnné pro stamina
//-----------------------------------------------------
let stamina = 100;
const maxStamina = 100;
const STAMINA_COST = 30;  // Pro rebound se stamina sníží o 30; rebound se provede jen, pokud je stamina >= 30

//-----------------------------------------------------
// Nové proměnné pro shield
//-----------------------------------------------------
let shieldActive = false;
let shieldEndTime = 0;  // Čas, kdy efekt shieldu vyprší

//-----------------------------------------------------
// Stav pauzy
//-----------------------------------------------------
let paused = false;

//-----------------------------------------------------
// Ochranné období po startu (grace period)
//-----------------------------------------------------
let gameStartTime = 0;
const GRACE_PERIOD = 2000; // 2 sekundy

//-----------------------------------------------------
// Animace weedy_game.png
//-----------------------------------------------------
let showWeedy = true;
let weedyX    = (gameWidth/2) - 110; // střed pro 221 px
let weedyY    = 140;
let weedyStay = 120;       // cca 2 sekundy
let weedySpeed= 1;         // 1 px/frame

//-----------------------------------------------------
// 3) Overlay prvky (Game Over / Pauza)
//-----------------------------------------------------
const gameOverOverlay = document.getElementById("gameOverOverlay");
const darken          = document.getElementById("darken");
const gameOverImage   = document.getElementById("gameOverImage");
const thanksText      = document.getElementById("thanksText");
const scoreText       = document.getElementById("scoreText");
const startButton     = document.getElementById("startButton");

window.addEventListener("load", () => {
  gameOverOverlay.style.display = "none";
  gameStartTime = performance.now();
});

//-----------------------------------------------------
// 4) Hlavní smyčka (loop)
//-----------------------------------------------------
requestAnimationFrame(loop);

function loop(timestamp){
  if (!paused) {
    update(timestamp);
  }
  draw();
  
  // Zobraz pauzovací overlay, pokud je hra pauznutá (ale není game over)
  if (paused && !gameOver) {
    gameOverOverlay.style.display = "flex";
    gameOverImage.style.display = "none";
    thanksText.style.display = "none";
    scoreText.style.display = "none";
    startButton.style.display = "none";
  } else if (!gameOver) {
    gameOverOverlay.style.display = "none";
    gameOverImage.style.display = "block";
    thanksText.style.display = "block";
    scoreText.style.display = "block";
    startButton.style.display = "block";
  }
  
  // Reset efekt shieldu po jeho vypršení
  if (shieldActive && timestamp > shieldEndTime) {
    shieldActive = false;
  }
  
  requestAnimationFrame(loop);
}

//-----------------------------------------------------
// 5) update (aktualizace herního stavu)
//-----------------------------------------------------
function update(timestamp){
  if (gameOver) {
    if (!gameOverStartTime) {
      gameOverStartTime = timestamp;
      gameOverTimestamp = timestamp;
    }
    let dt = timestamp - gameOverStartTime;
    if (dt < GAME_OVER_DELAY) {
      moveItems();
      updateParticles();
    } else {
      showGameOverOverlay();
    }
    return;
  }
  
  // Dobíjení stamina
  if (stamina < maxStamina) {
    stamina += 0.05;
    if (stamina > maxStamina) stamina = maxStamina;
  }
  updateStaminaBar();
  
  // Pohyb pytle (sakl) se "wrap-around"
  sakl.x += sakl.dx;
  if (sakl.x > gameWidth) sakl.x = -sakl.width;
  if (sakl.x + sakl.width < 0) sakl.x = gameWidth;
  
  // Vítr
  windTimer++;
  if (windTimer % 600 === 0) {
    windActive = !windActive;
    windDirection *= -1;
  }
  
  moveItems();
  detectCollisions();
  updateParticles();
  
  // Spawn stamina (pravděpodobnost 0.1 %)
  if (!items.some(it => it.type === "stamina") && Math.random() < 0.001) {
    createStaminaItem();
    return;
  }
  
  // Spawn shield (pravděpodobnost 0.1 %)
  if (!items.some(it => it.type === "shield") && Math.random() < 0.001) {
    createShieldItem();
    return;
  }
  
  // Spawn ostatních předmětů (3 %)
  if (Math.random() < 0.03) {
    createItem();
  }
  
  if (showWeedy) {
    if (weedyStay > 0) {
      weedyStay--;
    } else {
      weedyY -= weedySpeed;
      if (weedyY < -221) showWeedy = false;
    }
  }
}

function updateStaminaBar(){
  let fill = document.getElementById("staminaFill");
  let percent = stamina / maxStamina;
  fill.style.height = (percent * 100) + "%";
  if (stamina < STAMINA_COST) {
    fill.style.backgroundColor = "orangered";
  } else {
    fill.style.backgroundColor = "yellow";
  }
}

//-----------------------------------------------------
// 6) Pohyb předmětů a jejich kolize
//-----------------------------------------------------
function moveItems(){
  const minFallSpeed = Math.min(...items.map(i => i.baseVy || 1), 1.2);
  
  items.forEach(item => {
    if (item.type === "shield") {
      // Shield padá přímo dolů, bez vlivu větru
      item.y += 2;
    } else if (item.type === "stamina") {
      item.zigzagTimer = (item.zigzagTimer || 0) + 1;
      if (item.zigzagTimer > item.zigzagInterval) {
         item.vx = (Math.random() < 0.5 ? -1 : 1) * (4 + Math.random() * 2);
         item.vy = 3 + Math.random() * 1.0;
         item.zigzagInterval = 10 + Math.floor(Math.random() * 10);
         item.zigzagTimer = 0;
      }
      item.y += item.vy * gameSpeed;
      item.x += item.vx;
    } else if (item.type === "heart") {
      // Srdíčka padnou přímo dolů, bez horizontálního pohybu a bez vlivu větru
      item.y += item.vy;
    } else {
      if (!item.flying) {
        item.y += item.vy * gameSpeed;
      } else {
        item.vy += 0.05 * gameSpeed;
        item.vy = Math.min(item.vy, minFallSpeed);
        item.y += item.vy;
        item.x += item.vx;
      }
      if (windActive) {
        item.x += 0.3 * windDirection;
      }
    }
    if (item.type !== "shield" && item.x < -16) item.x = gameWidth + 16;
    if (item.type !== "shield" && item.x > gameWidth + 16) item.x = -16;
  });
  
  // Kolize mezi předměty – shield se neúčastní kolizí
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      let a = items[i], b = items[j];
      if (!a || !b) continue;
      // Přeskočíme kolizi, pokud jeden je srdíčko a druhý bomba, aby srdíčko bylo neovlivněné
      if ((a.type === "heart" && (b.type === "bomb-red" || b.type === "bomb-orange")) ||
          ((a.type === "bomb-red" || a.type === "bomb-orange") && b.type === "heart")) {
        continue;
      }
      if (a.type === "shield" || b.type === "shield") continue;
      let dx = b.x - a.x, dy = b.y - a.y;
      let dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 20) {
        if (a.type.startsWith("bomb-") || b.type.startsWith("bomb-")) {
          handleBombCollision(a, b);
        } else {
          let angle = Math.atan2(dy, dx);
          let force = 0.4;
          a.vx = -Math.cos(angle) * force;
          a.vy = -Math.sin(angle) * force;
          b.vx = Math.cos(angle) * force;
          b.vy = -Math.sin(angle) * force;
          a.flying = true;
          b.flying = true;
        }
      }
    }
  }
  
  if (stamina >= STAMINA_COST) {
    handleRebound();
  }
  
  items = items.filter(it => {
    if (it.y > gameHeight + removeMargin) {
      if (it.type === "leaf-green" && (performance.now() - gameStartTime >= GRACE_PERIOD)) {
        loseLife();
      }
      return false;
    }
    return true;
  });
}

function handleBombCollision(a, b) {
  spawnBombExplosion(a.x, a.y);
  items.splice(items.indexOf(a), 1);
  items.splice(items.indexOf(b), 1);
}

//-----------------------------------------------------
// 7) Rebound zelených listů (stamina)
//-----------------------------------------------------
function handleRebound() {
  if (stamina < STAMINA_COST) return;
  
  const greens = items.filter(i =>
    i.type === "leaf-green" &&
    i.y >= gameHeight - reboundThreshold
  );
  const caughtOne = items.find(i =>
    i.type === "leaf-green" &&
    i.x + 16 > sakl.x && i.x < sakl.x + sakl.width &&
    i.y + 16 > sakl.y && i.y < sakl.y + sakl.height
  );
  if (caughtOne) {
    let reboundZone = { x: sakl.x - 30, y: sakl.y - 300, width: sakl.width + 180, height: 300 };
    let anyRebounded = false;
    greens.forEach(g => {
      if (g === caughtOne) return;
      let inZone = (
        g.x > reboundZone.x && g.x < reboundZone.x + reboundZone.width &&
        g.y > reboundZone.y && g.y < reboundZone.y + reboundZone.height
      );
      if (!inZone) {
        g.vx = (Math.random() - 0.5) * 2;
        g.vy = -2.5 - Math.random();
        g.flying = true;
        anyRebounded = true;
      }
    });
    if (anyRebounded) {
      spawnLeafParticles(caughtOne.x, caughtOne.y);
      stamina -= STAMINA_COST;
      if (stamina < 0) stamina = 0;
    }
  }
}

//-----------------------------------------------------
// 8) Kolize předmětů s pytlem
//-----------------------------------------------------
function detectCollisions(){
  if (performance.now() - gameStartTime < GRACE_PERIOD) {
    return;
  }
  
  items = items.filter(it => {
    if (
      it.x + 16 > sakl.x &&
      it.x < sakl.x + sakl.width &&
      it.y + 16 > sakl.y &&
      it.y < sakl.y + sakl.height
    ) {
      handleItem(it);
      return false;
    }
    return true;
  });
}

function handleItem(it){
  switch(it.type){
    case "leaf-green":
      score++;
      break;
    case "bomb-red":
      if (shieldActive) {
        spawnBombExplosion(it.x, it.y); // animace výbuchu, ale hra pokračuje
      } else {
        spawnBombExplosion(it.x, it.y);
        endGame();
      }
      break;
    case "leaf-white":
      if (!shieldActive) adjustSpeed(0.5);
      break;
    case "bomb-orange":
      if (!shieldActive) adjustSpeed(2);
      break;
    case "heart":
      // Srdíčka se nyní objevují od levelu 10
      if (score >= 10 && lives < 3) lives++;
      break;
    case "stamina":
      stamina = maxStamina;
      break;
    case "shield":
      shieldActive = true;
      shieldEndTime = performance.now() + 10000; // Shield trvá 10 sekund
      break;
  }
}

//-----------------------------------------------------
// 9) Particles
//-----------------------------------------------------
function updateParticles(){
  particles = particles.filter(p => {
    p.life--;
    p.x += p.vx;
    p.y += p.vy;
    if (windActive) p.x += 0.3 * windDirection;
    return p.life > 0;
  });
}

function drawParticles(){
  particles.forEach(p => {
    ctx.beginPath();
    let r = p.big ? 3 : 2;
    ctx.arc(p.x, p.y, r, 0, 2 * Math.PI);
    ctx.fillStyle = p.color || "rgba(0,0,0,0.3)";
    ctx.fill();
  });
}

function spawnBombExplosion(x, y){
  for (let i = 0; i < 10; i++){
    let angle = Math.random() * 2 * Math.PI;
    let speed = 1.5 + Math.random() * 2;
    particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 30 + Math.floor(Math.random() * 20),
      color: (Math.random() < 0.5) ? "orange" : "red",
      big: true
    });
  }
  for (let i = 0; i < 15; i++){
    let angle = Math.random() * 2 * Math.PI;
    let speed = 1 + Math.random() * 1.5;
    particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 40 + Math.floor(Math.random() * 20),
      color: "rgba(60,60,60,0.5)",
      big: false
    });
  }
}

function spawnLeafParticles(x, y){
  for (let i = 0; i < 4; i++){
    let angle = Math.random() * 2 * Math.PI;
    let speed = 2 + Math.random() * 2;
    particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 25 + Math.floor(Math.random() * 15),
      color: "rgba(0,120,0,0.4)",
      big: true
    });
  }
  for (let i = 0; i < 8; i++){
    let angle = Math.random() * 2 * Math.PI;
    let speed = 1 + Math.random() * 1.5;
    particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 30 + Math.floor(Math.random() * 20),
      color: "rgba(0,255,0,0.3)",
      big: false
    });
  }
}

//-----------------------------------------------------
// 10) Zrychlení / zpomalení
//-----------------------------------------------------
function adjustSpeed(multiplier){
  clearTimeout(speedTimeout);
  gameSpeed = multiplier;
  speedTimeout = setTimeout(() => {
    gameSpeed = 1;
  }, 5000);
}

//-----------------------------------------------------
// 11) loseLife + endGame
//-----------------------------------------------------
function loseLife(){
  lives--;
  if (lives <= 0){
    endGame();
  }
}

function endGame(){
  if (!gameOver){
    gameOver = true;
    gameOverStartTime = null;
    gameOverTimestamp = performance.now();
    spawnDeathExplosion();
  }
}

// Nová funkce: death explosion – 100 částic vystřikujících nahoru z dolní části saklu
function spawnDeathExplosion() {
  let originX = sakl.x + sakl.width / 2;
  let originY = sakl.y + sakl.height;
  for (let i = 0; i < 100; i++) {
    let angle = Math.random() * Math.PI; // pouze horní polovina (0 až π)
    let speed = 2 + Math.random() * 3;
    particles.push({
      x: originX,
      y: originY,
      vx: Math.cos(angle) * speed,
      vy: -Math.abs(Math.sin(angle) * speed),
      life: 50 + Math.floor(Math.random() * 50),
      color: "orange",
      big: true
    });
  }
}

//-----------------------------------------------------
// 12) Zobrazení overlay a restart
//-----------------------------------------------------
function showGameOverOverlay(){
  scoreText.innerText = score;
  gameOverOverlay.style.display = "flex";
  // Po 3000 ms se zobrazí tlačítko Start a restart se povolí
  setTimeout(() => {
    startButton.style.display = "block";
    startButton.addEventListener("click", restartGame);
  }, 3000);
}

function restartGame(){
  gameOverOverlay.style.display = "none";
  startButton.removeEventListener("click", restartGame);
  
  items = [];
  particles = [];
  score = 0;
  lives = 3;
  stamina = maxStamina;
  gameSpeed = 1;
  gameOver = false;
  gameOverStartTime = null;
  spawnedFastItems = 0;
  windTimer = 0;
  windActive = false;
  shieldActive = false;
  
  showWeedy = true;
  weedyY = 140;
  weedyStay = 120;
  
  gameStartTime = performance.now();
  paused = false;
  gameOverOverlay.style.display = "none";
  gameOverImage.style.display = "block";
  thanksText.style.display = "block";
  scoreText.style.display = "block";
  startButton.style.display = "block";
}

//-----------------------------------------------------
// 13) Vykreslování (draw)
//-----------------------------------------------------
function draw(){
  ctx.clearRect(0, 0, gameWidth, gameHeight);
  
  drawBackground();
  drawWeedyGame(); 
  drawItems();
  drawParticles();
  drawSakl();
  drawScore();
  drawLives();
}

function drawBackground(){
  if (images.background.complete){
    ctx.drawImage(images.background, 0, 0, gameWidth, gameHeight);
  } else {
    ctx.fillStyle = "#eee";
    ctx.fillRect(0, 0, gameWidth, gameHeight);
  }
}

function drawWeedyGame(){
  if (!showWeedy) return;
  if (images.weedyGame.complete){
    ctx.drawImage(images.weedyGame, weedyX, weedyY, 221, 221);
  }
}

function drawItems(){
  items.forEach(it => {
    const { x, y, type } = it;
    let img;
    switch(type){
      case "leaf-green":   img = images.leafGreen;   break;
      case "leaf-white":   img = images.leafWhite;   break;
      case "bomb-red":     img = images.bombRed;     break;
      case "bomb-orange":  img = images.bombOrange;  break;
      case "heart":        img = images.heart;       break;
      case "stamina":
        drawStaminaAtom(x, y);
        return;
      case "shield":
        img = images.shield;
        break;
    }
    if (img && img.complete){
      ctx.drawImage(img, x - 16, y - 16, 32, 32);
    } else {
      ctx.beginPath();
      ctx.arc(x, y, 8, 0, 2 * Math.PI);
      ctx.fillStyle = "#f00";
      ctx.fill();
    }
  });
}

function drawStaminaAtom(x, y){
  ctx.beginPath();
  ctx.arc(x, y, 4, 0, 2 * Math.PI);
  ctx.fillStyle = "yellow";
  ctx.fill();
  for (let i = 0; i < 3; i++){
    let angle = Math.random() * 2 * Math.PI;
    let dist = 6;
    ctx.beginPath();
    ctx.arc(x + Math.cos(angle) * dist, y + Math.sin(angle) * dist, 2, 0, 2 * Math.PI);
    ctx.fillStyle = "yellow";
    ctx.fill();
  }
  for (let i = 0; i < 8; i++){
    let angle = Math.random() * 2 * Math.PI;
    let dist = 9;
    ctx.beginPath();
    ctx.arc(x + Math.cos(angle) * dist, y + Math.sin(angle) * dist, 2, 0, 2 * Math.PI);
    ctx.fillStyle = "blue";
    ctx.fill();
  }
}

function drawSakl(){
  if (images.sakl.complete){
    ctx.drawImage(images.sakl, sakl.x, sakl.y, sakl.width, sakl.height);
  } else {
    ctx.fillStyle = "#4e2a00";
    ctx.fillRect(sakl.x, sakl.y, sakl.width, sakl.height);
  }
  // Pokud je shield aktivní, vykreslíme menší shield přes pytel a dynamické zelené tečky
  if (shieldActive && images.shield.complete) {
    let shieldWidth = sakl.width * 0.8;
    let shieldHeight = sakl.height * 0.8;
    let shieldX = sakl.x + (sakl.width - shieldWidth) / 2;
    let shieldY = sakl.y + (sakl.height - shieldHeight) / 2;
    ctx.drawImage(images.shield, shieldX, shieldY, shieldWidth, shieldHeight);
    // Zvýšený orbitální poloměr a vyšší rychlost teček pro efekt shieldu
    let orbitRadius = 50;
    let t = performance.now() / 1000;
    for (let i = 0; i < 20; i++){
      let angle = (i / 20) * 2 * Math.PI;
      let speedFactor = 30.0 + (i % 3) * 10.2;
      let offsetX = orbitRadius * Math.cos(angle + t * speedFactor);
      let offsetY = orbitRadius * Math.sin(angle + t * speedFactor);
      let dotX = sakl.x + sakl.width / 2 + offsetX;
      let dotY = sakl.y + sakl.height / 2 + offsetY;
      ctx.beginPath();
      ctx.arc(dotX, dotY, 2, 0, 2 * Math.PI);
      ctx.fillStyle = "green";
      ctx.fill();
    }
  }
}

function drawScore(){
  ctx.fillStyle = "black";
  ctx.font = "18px Arial";
  ctx.fillText(score, 20, 40);
}

function drawLives(){
  const centerX = gameWidth / 2 - 30;
  for (let i = 0; i < 3; i++){
    if (i < lives){
      if (images.heart.complete){
        ctx.drawImage(images.heart, centerX + i * 25, 8, 20, 20);
      } else {
        ctx.beginPath();
        ctx.arc(centerX + i * 25 + 10, 18, 6, 0, 2 * Math.PI);
        ctx.fillStyle = "#b30000";
        ctx.fill();
      }
    } else {
      ctx.save();
      ctx.globalAlpha = 0.3;
      if (images.heart.complete){
        ctx.drawImage(images.heart, centerX + i * 25, 8, 20, 20);
      } else {
        ctx.beginPath();
        ctx.arc(centerX + i * 25 + 10, 18, 6, 0, 2 * Math.PI);
        ctx.fillStyle = "#b30000";
        ctx.fill();
      }
      ctx.restore();
    }
  }
}

//-----------------------------------------------------
// 14) Ovládání kláves a dotyk
//-----------------------------------------------------
// Stav kláves
const keys = {};

document.addEventListener("keydown", (e) => {
  // Pokud je hra ukončena, povol restart jen po 3 sekundách od game over
  if (gameOver) {
    if (performance.now() - gameOverTimestamp >= 3000) {
      restartGame();
    }
    return;
  }
  // Mezerník přepíná pauzu
  if (e.key === " ") {
    paused = !paused;
    return;
  }
  keys[e.key] = true;
  if (keys["ArrowRight"] && !keys["ArrowLeft"]) {
    sakl.dx = sakl.speed;
  } else if (keys["ArrowLeft"] && !keys["ArrowRight"]) {
    sakl.dx = -sakl.speed;
  }
});

document.addEventListener("keyup", (e) => {
  delete keys[e.key];
  if (keys["ArrowRight"] && !keys["ArrowLeft"]) {
    sakl.dx = sakl.speed;
  } else if (keys["ArrowLeft"] && !keys["ArrowRight"]) {
    sakl.dx = -sakl.speed;
  } else {
    sakl.dx = 0;
  }
});

document.addEventListener("touchstart", e => {
  const touchX = e.touches[0].clientX;
  const screenMid = window.innerWidth / 2;
  sakl.dx = (touchX < screenMid) ? -sakl.speed : sakl.speed;
});

document.addEventListener("touchend", () => {
  sakl.dx = 0;
});

//-----------------------------------------------------
// 15) Generování předmětů
//-----------------------------------------------------
function createItem(){
  const types = ["leaf-green", "leaf-white", "bomb-red", "bomb-orange"];
  let type;
  // Srdíčka se nyní objevují již od levelu 10
  if (score >= 10 && Math.random() < 0.03 && lives < 3){
    type = "heart";
  } else {
    const r = Math.random();
    if (r < 0.5)       type = "leaf-green";
    else if (r < 0.7)  type = "leaf-white";
    else if (r < 0.85) type = "bomb-orange";
    else               type = "bomb-red";
  }
  items.push({
    type: type,
    x: Math.random() * (gameWidth - 32) + 16,
    y: -20,
    vx: 0,
    vy: 1 + Math.random() * 1.5,
    baseVy: 1 + Math.random() * 1.5,
    flying: false
  });
}

function createStaminaItem(){
  items.push({
    type: "stamina",
    x: Math.random() * (gameWidth - 16) + 8,
    y: -20,
    vx: 0,
    vy: 1 + Math.random() * 1.0,
    zigzagTimer: 0,
    zigzagInterval: 20 + Math.floor(Math.random() * 20),
    flying: false
  });
}

function createShieldItem(){
  items.push({
    type: "shield",
    x: Math.random() * (gameWidth - 32) + 16,
    y: -20,
    vx: 0,
    vy: 2,  // konstantní rychlost
    baseVy: 2,
    flying: false
  });
}