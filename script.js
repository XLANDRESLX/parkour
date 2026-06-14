// ==========================================
// CONFIGURACIÓN DE RED (PEERJS P2P DIRECTO)
// ==========================================
const myId = Math.random().toString(36).substring(2, 9); 
let remotePlayers = {}; 
let connections = [];
let myName = "Jugador";
let gameSeed = Math.floor(Math.random() * 2147483647);

const peer = new Peer(myId, {
    host: '0.peerjs.com',
    port: 443,
    secure: true
});

peer.on('connection', (conn) => {
    setupConnection(conn);
});

const urlParams = new URLSearchParams(window.location.search);
const connectToId = urlParams.get('join');
const isHost = !connectToId;
const seedFromUrl = urlParams.get('seed');
if (seedFromUrl) gameSeed = parseInt(seedFromUrl);

if (connectToId) {
    peer.on('open', () => {
        const conn = peer.connect(connectToId);
        setupConnection(conn);
    });
}

function setupConnection(conn) {
    conn.on('open', () => {
        connections.push(conn);
        conn.send({ type: "handshake", seed: gameSeed });
        document.getElementById("inviteBtn").textContent = "💚 ¡AMIGO CONECTADO EN TIEMPO REAL!";
        document.getElementById("inviteBtn").style.backgroundColor = "#10b981";
        document.getElementById("inviteBtn").style.color = "white";
    });

    conn.on('data', (data) => {
        if (data.type === "handshake") {
            if (!isHost) gameSeed = data.seed;
            return;
        }
        if (data.type === "pos") {
            if (remotePlayers[data.id]) {
                remotePlayers[data.id].targetX = data.x;
                remotePlayers[data.id].targetY = data.y;
                remotePlayers[data.id].f = data.f;
                remotePlayers[data.id].frame = data.frame;
                remotePlayers[data.id].name = data.name || remotePlayers[data.id].name;
            } else {
                remotePlayers[data.id] = {
                    name: data.name || "Anónimo",
                    targetX: data.x, targetY: data.y,
                    renderX: data.x, renderY: data.y,
                    f: data.f, frame: data.frame
                };
            }
        }
    });

    conn.on('close', () => {
        connections = connections.filter(c => c !== conn);
        document.getElementById("inviteBtn").textContent = "🔗 COPIAR LINK PARA JUGAR CON UN AMIGO";
        document.getElementById("inviteBtn").style.backgroundColor = "#00f2fe";
        document.getElementById("inviteBtn").style.color = "#04060c";
    });
}

function copyInviteLink() {
    const baseUrl = window.location.href.split('?')[0];
    const inviteUrl = `${baseUrl}?join=${myId}&seed=${gameSeed}`;
    
    navigator.clipboard.writeText(inviteUrl).then(() => {
        const btn = document.getElementById("inviteBtn");
        const originalText = btn.textContent;
        btn.textContent = "📋 ¡LINK COPIADO! PÁSASELO A TU AMIGO";
        setTimeout(() => {
            if(connections.length === 0) btn.textContent = originalText;
        }, 3000);
    });
}

let rng = {
    state: 0,
    next: function() {
        this.state = (this.state * 1664525 + 1013904223) & 0xFFFFFFFF;
        return (this.state >>> 0) / 4294967296;
    },
    reset: function(seed) {
        this.state = seed >>> 0;
    }
};

// ==========================================
// LÓGICA DEL MOTOR GRÁFICO Y JUEGO
// ==========================================
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const GAME_GROUND_Y = 600;
function resize(){
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
resize();
window.addEventListener("resize", resize);

const imgPlatform = new Image();
imgPlatform.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32"><defs><linearGradient id="g" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stop-color="%231e293b"/><stop offset="100%" stop-color="%230f172a"/></linearGradient></defs><rect x="0" y="0" width="32" height="32" fill="url(%23g)"/><rect x="0" y="0" width="32" height="4" fill="%2300f2fe"/><rect x="0" y="4" width="32" height="1" fill="%23006677"/></svg>';

const imgPlayer = new Image();
imgPlayer.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 32" width="128" height="32"><g fill="%2300f2fe"><rect x="6" y="2" width="20" height="24" rx="3"/><rect x="38" y="4" width="20" height="22" rx="3"/><rect x="70" y="2" width="20" height="24" rx="3"/><rect x="102" y="5" width="20" height="22" rx="3"/></g><g fill="%23ffffff"><circle cx="20" cy="8" r="2"/><circle cx="52" cy="10" r="2"/><circle cx="84" cy="8" r="2"/><circle cx="116" cy="11" r="2"/></g><g fill="%23764ba2"><rect x="4" y="24" width="24" height="4"/><rect x="36" y="24" width="24" height="4"/><rect x="68" y="24" width="24" height="4"/><rect x="100" y="24" width="24" height="4"/></g></svg>';

const spriteConfig = {
    frameWidth: 32,   
    frameHeight: 32,  
    totalFrames: 4,   
    animSpeed: 5      
};

const difficultySettings = {
    facil: { gapMin: 90, gapMax: 130, widthMin: 220, widthMax: 300, speedModifier: 1.0, label: "FÁCIL", color: "#10b981" },
    medio: { gapMin: 120, gapMax: 170, widthMin: 160, widthMax: 240, speedModifier: 1.2, label: "MEDIO", color: "#f59e0b" },
    dificil: { gapMin: 150, gapMax: 220, widthMin: 110, widthMax: 170, speedModifier: 1.5, label: "DIFÍCIL", color: "#ef4444" }
};
let currentDiff = "medio";

function getHighScore(diff) {
    return parseInt(localStorage.getItem("cyberrunner_highscore_" + diff)) || 0;
}

function updateHighScoreDisplay() {
    const record = getHighScore(currentDiff);
    document.getElementById("mainHighScore").textContent = `RÉCORD (${difficultySettings[currentDiff].label}): ${record}m`;
    document.getElementById("highScoreUI").textContent = record;
}

function setDifficulty(tier) {
    currentDiff = tier;
    document.querySelectorAll('.diff-btn').forEach(btn => {
        btn.classList.remove('selected');
        if(btn.getAttribute('data-diff') === tier) btn.classList.add('selected');
    });
    updateHighScoreDisplay();
}

const keys = {};
window.addEventListener("keydown", e => {
    const key = e.key.toLowerCase();
    keys[key] = true;
    if(e.code === "Space" || e.code === "ArrowUp" || key === "w") jump();
    if(e.key === "Shift") dash();
    if(key === "p" || e.key === "Escape") togglePause();
});
window.addEventListener("keyup", e => { keys[e.key.toLowerCase()] = false; });

const gravity = 0.65;
let cameraX = 0;
let cameraY = 0;
let score = 0;
let gameRunning = false;
let isPaused = false;
let initialized = false;
let player;
let platforms = [];
let particles = [];
let gameTicks = 0;

let stars = [];
for(let i=0; i<60; i++) {
    stars.push({x: Math.random(), y: Math.random(), r: Math.random() * 1.5 + 0.5, alpha: Math.random() * 0.7 + 0.3});
}

function resetPlayer(){
    player = {
        x: 200,
        y: GAME_GROUND_Y - 120,
        w: 42,
        h: 56,
        vx: 0,
        vy: 0,
        jumps: 2,
        facing: 1,
        dashCooldown: 0,
        dashActive: 0,
        currentFrame: 0
    };
}

function createWorld(){
    platforms = [];
    particles = [];
    platforms.push({ x: 0, y: GAME_GROUND_Y, w: 900, h: 600 });

    let lastX = 900;
    for(let i = 0; i < 15; i++){
        addPlatform(lastX);
        lastX = platforms[platforms.length - 1].x + platforms[platforms.length - 1].w;
    }
}

function addPlatform(startX){
    const diff = difficultySettings[currentDiff];
    const progression = Math.min(startX / 80000, 0.4); 
    
    const gap = (diff.gapMin + rng.next() * (diff.gapMax - diff.gapMin)) * (1 + progression);
    const width = (diff.widthMin + rng.next() * (diff.widthMax - diff.widthMin)) * (1 - progression * 0.5);
    
    const heightRange = currentDiff === 'facil' ? 80 : 160;
    const height = GAME_GROUND_Y - (rng.next() * heightRange - 40);

    platforms.push({ x: startX + gap, y: height, w: width, h: 600 });
}

function generateMore(){
    const last = platforms[platforms.length - 1];
    if(last.x < player.x + canvas.width + 1000){
        let lastX = last.x + last.w;
        for(let i = 0; i < 8; i++){
            addPlatform(lastX);
            lastX = platforms[platforms.length - 1].x + platforms[platforms.length - 1].w;
        }
    }
}

function createParticle(x, y, color) {
    particles.push({
        x: x, y: y,
        vx: (Math.random() - 0.5) * 3,
        vy: (Math.random() - 0.5) * 3,
        radius: Math.random() * 3 + 1,
        alpha: 1,
        color: color
    });
}

function jump(){
    if(!gameRunning || isPaused) return;
    if(player.jumps > 0){
        player.vy = -13.5;
        player.jumps--;
        for(let i=0; i<8; i++) createParticle(player.x + player.w/2, player.y + player.h, '#00f2fe');
    }
}

function dash(){
    if(!gameRunning || player.dashCooldown > 0 || isPaused) return;
    player.dashActive = 9;
    player.dashCooldown = 35;
    for(let i=0; i<12; i++) createParticle(player.x + player.w/2, player.y + player.h/2, '#764ba2');
}

function rects(a, b){
    return (a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y);
}

function togglePause() {
    if(!gameRunning) return;
    
    isPaused = !isPaused;
    const menu = document.getElementById("pauseMenu");
    
    if(isPaused) {
        menu.style.display = "flex";
        setTimeout(() => menu.classList.add("active"), 10);
        document.getElementById("pauseBtn").textContent = "REANUDAR (P)";
    } else {
        menu.classList.remove("active");
        setTimeout(() => menu.style.display = "none", 300);
        document.getElementById("pauseBtn").textContent = "PAUSA (P)";
    }
}

function returnToMenu() {
    gameRunning = false;
    isPaused = false;
    document.getElementById("pauseMenu").classList.remove("active");
    document.getElementById("gameOver").classList.remove("active");
    setTimeout(() => {
        document.getElementById("pauseMenu").style.display = "none";
        document.getElementById("gameOver").style.display = "none";
        document.getElementById("startMenu").style.display = "flex";
        document.getElementById("ui").style.display = "none";
        document.getElementById("pauseBtn").style.display = "none";
    }, 300);
    updateHighScoreDisplay();
}

function startGame() {
    const nameInput = document.getElementById("nameInput");
    const nameError = document.getElementById("nameError");
    myName = nameInput.value.trim();
    if (!myName) {
        nameInput.classList.add("error");
        nameError.style.display = "block";
        nameInput.focus();
        return;
    }
    nameInput.classList.remove("error");
    nameError.style.display = "none";
    
    document.getElementById("startMenu").style.display = "none";
    document.getElementById("ui").style.display = "block";
    document.getElementById("pauseBtn").style.display = "block";
    
    const badge = document.getElementById("diffBadge");
    badge.textContent = difficultySettings[currentDiff].label;
    badge.style.backgroundColor = difficultySettings[currentDiff].color;

    score = 0;
    gameTicks = 0;
    resetPlayer();
    rng.reset(gameSeed);
    createWorld();
    updateHighScoreDisplay();
    
    gameRunning = true;
    isPaused = false;
    
    if(!initialized) {
        initialized = true;
        loop();
    }
}

function restart() {
    gameSeed = Math.floor(Math.random() * 2147483647);
    connections.forEach(conn => {
        if (conn.open) conn.send({ type: "handshake", seed: gameSeed });
    });
    document.getElementById("gameOver").classList.remove("active");
    setTimeout(() => {
        document.getElementById("gameOver").style.display = "none";
        startGame();
    }, 300);
}

function triggerGameOver() {
    gameRunning = false;
    const currentHigh = getHighScore(currentDiff);
    const badgeContainer = document.getElementById("gameOverHighScore");
    
    document.getElementById("finalScore").textContent = `Distancia recorrida: ${score}m`;
    
    if(score > currentHigh) {
        localStorage.setItem("cyberrunner_highscore_" + currentDiff, score);
        badgeContainer.textContent = "¡NUEVO RÉCORD CONFIGURADO!";
        badgeContainer.style.color = "#10b981";
    } else {
        badgeContainer.textContent = `Récord actual: ${currentHigh}m`;
        badgeContainer.style.color = "#00f2fe";
    }
    
    const goMenu = document.getElementById("gameOver");
    goMenu.style.display = "flex";
    setTimeout(() => goMenu.classList.add("active"), 10);
}

// ==========================================
// BUCLE PRINCIPAL DE JUEGO (LOOP)
// ==========================================
function loop() {
    requestAnimationFrame(loop);
    
    if(!gameRunning || isPaused) {
        draw();
        return;
    }
    
    update();
    draw();
}

function update() {
    gameTicks++;
    const diff = difficultySettings[currentDiff];
    
    if(player.dashActive > 0) player.dashActive--;
    if(player.dashCooldown > 0) player.dashCooldown--;
    
    let moveSpeed = player.dashActive > 0 ? 14 : 5.5 * diff.speedModifier;
    
    if (keys['a'] || keys['arrowleft']) {
        player.vx = -moveSpeed;
        player.facing = -1;
    } else if (keys['d'] || keys['arrowright']) {
        player.vx = moveSpeed;
        player.facing = 1;
    } else {
        player.vx *= 0.8; 
    }
    
    if(player.dashActive === 0) {
        player.vy += gravity;
    } else {
        player.vy = 0; 
    }
    
    let prevX = player.x;
    let prevY = player.y;
    
    player.x += player.vx;
    player.y += player.vy;
    
    if(Math.abs(player.vx) > 0.5 && player.vy === 0) {
        if(gameTicks % spriteConfig.animSpeed === 0) {
            player.currentFrame = (player.currentFrame + 1) % spriteConfig.totalFrames;
        }
    } else if(player.vy !== 0) {
        player.currentFrame = 1; 
    } else {
        player.currentFrame = 0; 
    }
    
    let onGround = false;
    
    for(let plat of platforms) {
        if(rects(player, plat)) {
            if(prevY + player.h <= plat.y && player.vy > 0) {
                player.y = plat.y - player.h;
                player.vy = 0;
                player.jumps = 2;
                onGround = true;
            }
            else if(prevX + player.w <= plat.x && player.vx > 0) {
                player.x = plat.x - player.w;
                player.vx = 0;
            }
            else if(prevX >= plat.x + plat.w && player.vx < 0) {
                player.x = plat.x + plat.w;
                player.vx = 0;
            }
        }
    }
    
    if(!onGround && player.vy > 0 && player.jumps === 2) {
        player.jumps = 1;
    }
    
    let currentMeters = Math.floor(player.x / 40);
    if(currentMeters > score) {
        score = currentMeters;
        document.getElementById("score").textContent = score;
    }
    
    cameraX = player.x - 200;
    cameraY = player.y - canvas.height * 0.6;
    
    generateMore();
    
    for(let i = particles.length - 1; i >= 0; i--) {
        let p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.alpha -= 0.03;
        if(p.alpha <= 0) particles.splice(i, 1);
    }
    
    if(player.y > GAME_GROUND_Y + 400) {
        triggerGameOver();
    }
    
    if(gameTicks % 3 === 0 && connections.length > 0) {
        connections.forEach(conn => {
            if(conn.open) {
                conn.send({
                    type: "pos",
                    id: myId,
                    name: myName,
                    x: player.x, y: player.y,
                    f: player.facing,
                    frame: player.currentFrame
                });
            }
        });
    }
}

function draw() {
    ctx.fillStyle = "#0a0b10";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    ctx.fillStyle = "#ffffff";
    for(let star of stars) {
        let x = (star.x * canvas.width - cameraX * 0.15) % canvas.width;
        if(x < 0) x += canvas.width;
        let y = (star.y * canvas.height - cameraY * 0.1) % canvas.height;
        if(y < 0) y += canvas.height;
        ctx.globalAlpha = star.alpha;
        ctx.beginPath();
        ctx.arc(x, y, star.r, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.globalAlpha = 1.0;
    
    ctx.save();
    ctx.translate(-cameraX, -cameraY);
    
    for(let p of particles) {
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.globalAlpha = 1.0;
    
    for(let plat of platforms) {
        if(plat.x + plat.w > cameraX && plat.x < cameraX + canvas.width) {
            for(let sx = 0; sx < plat.w; sx += 32) {
                let blockW = Math.min(32, plat.w - sx);
                ctx.drawImage(imgPlatform, 0, 0, blockW, 32, plat.x + sx, plat.y, blockW, 32);
            }
            ctx.fillStyle = "#0f172a";
            ctx.fillRect(plat.x, plat.y + 32, plat.w, plat.h - 32);
        }
    }
    
    ctx.textAlign = "center";
    for(let id in remotePlayers) {
        let p = remotePlayers[id];
        p.renderX += (p.targetX - p.renderX) * 0.25;
        p.renderY += (p.targetY - p.renderY) * 0.25;
        
        ctx.save();
        ctx.translate(p.renderX + 21, p.renderY + 28);
        if(p.f === -1) ctx.scale(-1, 1);
        ctx.drawImage(
            imgPlayer,
            p.frame * spriteConfig.frameWidth, 0, spriteConfig.frameWidth, spriteConfig.frameHeight,
            -21, -28, 42, 56
        );
        ctx.restore();
        
        ctx.fillStyle = "#ef4444";
        ctx.font = "bold 11px monospace";
        ctx.fillText(p.name, p.renderX + 21, p.renderY - 10);
    }
    
    if(player) {
        ctx.save();
        ctx.translate(player.x + (player.w / 2), player.y + (player.h / 2));
        if(player.facing === -1) ctx.scale(-1, 1);
        
        ctx.drawImage(
            imgPlayer,
            player.currentFrame * spriteConfig.frameWidth, 0, spriteConfig.frameWidth, spriteConfig.frameHeight,
            -(player.w / 2), -(player.h / 2), player.w, player.h
        );
        ctx.restore();
        
        ctx.fillStyle = "#00f2fe";
        ctx.font = "bold 11px monospace";
        ctx.fillText(myName, player.x + player.w/2, player.y - 10);
    }
    
    ctx.restore();
}

// ==========================================
// EVENT LISTENERS (reemplazan onclick del HTML)
// ==========================================
document.getElementById("pauseBtn").addEventListener("click", togglePause);
document.getElementById("inviteBtn").addEventListener("click", copyInviteLink);
document.querySelectorAll(".diff-btn").forEach(btn => {
    btn.addEventListener("click", () => setDifficulty(btn.getAttribute("data-diff")));
});
document.getElementById("startBtn").addEventListener("click", startGame);
document.getElementById("resumeBtn").addEventListener("click", togglePause);
document.getElementById("returnBtn").addEventListener("click", returnToMenu);
document.getElementById("restartBtn").addEventListener("click", restart);
document.getElementById("menuBtn").addEventListener("click", returnToMenu);

updateHighScoreDisplay();
