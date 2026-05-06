const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

// Game System State
let gameStarted = false;
let selectedDifficulty = 'normal';
let keys = {};
let mouse = { x: 0, y: 0 };
let mode = 1; 
let playerAmmo = 3; 
let health = 5; 
let gameOver = false;
let currentWave = 1;
let frameCount = 0; 
// --- NEW COMBOS, SCORING & POWER-UPS ---
let score = 0;
let combo = 1;
let comboTimer = 0;
let autoFireTimer = 0;
let isMouseDown = false;
let drops = []; // This will replace ammoDrops
// --- NEW JUICE VARIABLES ---
let particles = [];
let shakeTime = 0;

// Spaceship Background Stars
let stars = Array.from({ length: 150 }, () => ({
    x: Math.random() * canvas.width,
    y: Math.random() * canvas.height,
    speed: Math.random() * 4 + 1, 
    size: Math.random() * 2
}));

// Entities
const player = { 
    x: canvas.width / 2, y: canvas.height / 2, radius: 20, speed: 6, baseSpeed: 6, color: '#00f3ff',
    dashCooldown: 0, isDashing: false, dashTimer: 0,
    lastShieldActivation: 0, 
    angle: 0, trail: [],
    overclockTimer: 0, pierceTimer: 0 // NEW
};

let enemies = []; 
let bullets = [];
let ammoDrops = []; 
let dropSpawnTimer = 100;
let blocks = []; 

function clamp(val, min, max) { return Math.max(min, Math.min(max, val)); }

// --- JUICE HELPER FUNCTIONS ---
function triggerShake(frames) {
    shakeTime = frames;
}

function spawnParticles(x, y, color, count, speedMultiplier) {
    for (let i = 0; i < count; i++) {
        particles.push({
            x: x, y: y,
            vx: (Math.random() - 0.5) * 10 * speedMultiplier,
            vy: (Math.random() - 0.5) * 10 * speedMultiplier,
            size: Math.random() * 4 + 2,
            color: color,
            life: 1.0, // Fades from 1.0 to 0
            decay: Math.random() * 0.05 + 0.02
        });
    }
}

// --- MAP GENERATION & SAFE SPAWNING ---
function generateBlocks() {
    blocks = [];
    let numBlocks = Math.floor(Math.random() * 4) + 4; 
    let attempts = 0; 
    
    for (let i = 0; i < numBlocks && attempts < 50; i++) {
        let isHorizontal = Math.random() > 0.5;
        let w = isHorizontal ? (Math.random() * 200 + 150) : 50;
        let h = isHorizontal ? 50 : (Math.random() * 200 + 150);
        
        let x = Math.random() * (canvas.width - w - 80) + 40;
        let y = Math.random() * (canvas.height - h - 80) + 40;
        
        if (Math.hypot((x + w/2) - player.x, (y + h/2) - player.y) < 200) {
            i--; attempts++; continue;
        }
        
        let isOverlapping = false;
        for (let b of blocks) {
            if (x < b.x + b.w + 20 && x + w + 20 > b.x && 
                y < b.y + b.h + 20 && y + h + 20 > b.y) {
                isOverlapping = true; break;
            }
        }
        
        if (isOverlapping) { i--; attempts++; continue; }
        
        blocks.push({ x, y, w, h });
        attempts = 0; 
    }
}

function isSpaceClear(x, y, radius) {
    if (x - radius < 20 || x + radius > canvas.width - 20) return false;
    if (y - radius < 20 || y + radius > canvas.height - 20) return false;
    for (let b of blocks) {
        let cx = clamp(x, b.x, b.x + b.w);
        let cy = clamp(y, b.y, b.y + b.h);
        if (Math.hypot(x - cx, y - cy) < radius + 15) return false;
    }
    return true;
}

function getSafeSpawn(radius) {
    let x, y, attempts = 0;
    do {
        x = Math.random() * (canvas.width - 100) + 50;
        y = Math.random() * (canvas.height - 100) + 50;
        attempts++;
    } while (!isSpaceClear(x, y, radius) && attempts < 100);
    return { x, y };
}

// --- ENEMY FACTORY & WAVES ---
function createEnemy(type, x, y) {
    let diffMultiplier = selectedDifficulty === 'hard' ? 1.5 : (selectedDifficulty === 'easy' ? 0.7 : 1);
    // Notice: Added flashTimer: 0 to each enemy type!
    if (type === 'standard') return { x, y, radius: 25, speed: 2.5 * diffMultiplier, color: '#ff003c', health: 5, maxHealth: 5, cooldown: 0, fireRate: 100 / diffMultiplier, ammo: 3, maxAmmo: 3, type: 'standard', flashTimer: 0 };
    if (type === 'sniper') return { x, y, radius: 20, speed: 1.2 * diffMultiplier, color: '#aa00ff', health: 3, maxHealth: 3, cooldown: 0, fireRate: 150 / diffMultiplier, ammo: 2, maxAmmo: 2, type: 'sniper', flashTimer: 0 };
    if (type === 'brute') return { x, y, radius: 35, speed: 3.5 * diffMultiplier, color: '#ff8800', health: 12, maxHealth: 12, cooldown: 0, fireRate: 9999, ammo: 0, maxAmmo: 0, type: 'brute', flashTimer: 0 };
}

function startWave() {
    generateBlocks(); 
    enemies = [];
    let numEnemies = Math.min(1 + Math.floor(currentWave / 2), 6); 
    
    for(let i = 0; i < numEnemies; i++) {
        let type = 'standard';
        if (currentWave >= 2 && Math.random() < 0.3) type = 'sniper';
        if (currentWave >= 3 && Math.random() < 0.2) type = 'brute';

        let safePos = getSafeSpawn(35); 
        enemies.push(createEnemy(type, safePos.x, safePos.y)); 
    }
    
    playerAmmo += 2;
    updateUI();
}

// --- MENU LOGIC & AUDIO ---
function playBootSound() {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(100, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(800, audioCtx.currentTime + 0.5);
    
    gainNode.gain.setValueAtTime(0.2, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);
    
    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.5);
}

const usernameInput = document.getElementById('username');
const startBtn = document.getElementById('startBtn');

usernameInput.addEventListener('input', () => {
    if (usernameInput.value.trim().length > 0) {
        startBtn.disabled = false;
        startBtn.style.opacity = "1";
        startBtn.style.boxShadow = "0 0 20px #00f3ff"; 
    } else {
        startBtn.disabled = true;
        startBtn.style.opacity = "0.5";
        startBtn.style.boxShadow = "none";
    }
});

document.querySelectorAll('.diff-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('.diff-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        selectedDifficulty = e.target.getAttribute('data-diff');
    });
});

startBtn.addEventListener('click', () => {
    const username = usernameInput.value.trim().toUpperCase();
    document.getElementById('operatorDisplay').innerText = username;
    
    playBootSound(); 

    const startScreen = document.getElementById('startScreen');
    startScreen.style.opacity = '0';
    startScreen.style.transition = 'opacity 1s'; 
    
    setTimeout(() => {
        startScreen.style.display = 'none';
        document.getElementById('ui').style.display = 'block';
        gameStarted = true;
        startWave();
    }, 1000);
});

// --- INPUT LISTENERS ---
window.addEventListener('keydown', (e) => { 
    let key = e.key.toLowerCase();
    keys[key] = true; 
    
    if (!gameStarted || gameOver) return;
    
    if (key === ' ' && player.dashCooldown <= 0) {
        player.isDashing = true;
        player.dashTimer = 12; 
        player.dashCooldown = 90; 
    }

    if (key === '1') { mode = 1; updateUI(); }
    if (key === '2' && mode !== 2) { 
        mode = 2; 
        player.lastShieldActivation = frameCount; 
        updateUI(); 
    }
});

window.addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });
window.addEventListener('mousemove', (e) => { mouse.x = e.clientX; mouse.y = e.clientY; });
window.addEventListener('mousedown', () => {
    if (!gameStarted) return; 
    isMouseDown = true;
    if (mode === 1 && playerAmmo > 0 && !gameOver && player.overclockTimer <= 0) {
        shootBullet(player.x, player.y, mouse.x, mouse.y, true, 'standard');
        playerAmmo--; updateUI();
    }
});
window.addEventListener('mouseup', () => { isMouseDown = false; });

function updateUI() {
    const ammoDisplay = document.getElementById('ammoDisplay');
    if (player.overclockTimer > 0) {
        ammoDisplay.innerText = "OVERCLOCKED [∞]"; ammoDisplay.className = "neon-text-red";
    } else if (playerAmmo > 0) {
        ammoDisplay.innerText = `READY [${playerAmmo}]`; ammoDisplay.className = "neon-text-blue";
    } else {
        ammoDisplay.innerText = "EMPTY - FIND AMMO"; ammoDisplay.className = "neon-text-red";
    }
    const modeDisplay = document.getElementById('modeDisplay');
    modeDisplay.innerText = mode === 1 ? "ATTACK (1)" : "DEFLECT (2)";
    modeDisplay.className = mode === 1 ? "neon-text-blue" : "neon-text-green";
    document.getElementById('healthDisplay').innerText = health;
    const scoreDisplay = document.getElementById('scoreDisplay');
    if (scoreDisplay) scoreDisplay.innerText = score;
}

// --- GAME LOGIC ---
function shootBullet(startX, startY, targetX, targetY, isPlayer, shooterType) {
    const angle = Math.atan2(targetY - startY, targetX - startX);
    const speed = shooterType === 'sniper' ? 18 : 12; 
    const spawnX = startX + Math.cos(angle) * 25; 
    const spawnY = startY + Math.sin(angle) * 25;
    let isPiercing = isPlayer && player.pierceTimer > 0;

    bullets.push({
        x: spawnX, y: spawnY, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        radius: shooterType === 'sniper' ? 8 : 12,
        color: isPlayer ? player.color : (shooterType === 'sniper' ? '#aa00ff' : '#ff003c'),
        isPlayer: isPlayer, bounces: 0, 
        maxBounces: isPiercing ? 0 : (shooterType === 'sniper' ? 0 : 4), 
        angle: 0, damage: 1, piercing: isPiercing, hitEntities: []
    });
}

function spawnDrop(x, y, type) {
    let color = '#ffcc00'; 
    if (type === 'overclock') color = '#ff003c'; 
    if (type === 'pierce') color = '#aa00ff';
    drops.push({ x, y, radius: 15, angle: 0, type: type, color: color });
}

function resolveBlockCollisions(entity) {
    blocks.forEach(block => {
        let cx = clamp(entity.x, block.x, block.x + block.w);
        let cy = clamp(entity.y, block.y, block.y + block.h);
        let dx = entity.x - cx;
        let dy = entity.y - cy;
        let dist = Math.hypot(dx, dy);
        
        if (dist < entity.radius && dist > 0) {
            let overlap = entity.radius - dist;
            entity.x += (dx / dist) * overlap;
            entity.y += (dy / dist) * overlap;
        }
    });
}

function update() {
    player.angle = Math.atan2(mouse.y - player.y, mouse.x - player.x);

    if (!gameStarted || gameOver) return;
    frameCount++;

    if (shakeTime > 0) shakeTime--;
    if (comboTimer > 0) { comboTimer--; if (comboTimer <= 0) { combo = 1; updateUI(); } }
    if (autoFireTimer > 0) autoFireTimer--;

    // POWER-UP TIMERS & AUTO-FIRE
    if (player.overclockTimer > 0) {
        player.overclockTimer--;
        if (player.overclockTimer === 0) updateUI();
        if (isMouseDown && mode === 1 && autoFireTimer <= 0) {
            shootBullet(player.x, player.y, mouse.x, mouse.y, true, 'standard');
            autoFireTimer = 8; updateUI(); 
        }
    }
    if (player.pierceTimer > 0) { player.pierceTimer--; if (player.pierceTimer === 0) updateUI(); }

    for (let i = particles.length - 1; i >= 0; i--) {
        let p = particles[i]; p.x += p.vx; p.y += p.vy; p.life -= p.decay;
        if (p.life <= 0) particles.splice(i, 1);
    }

    player.trail.push({x: player.x, y: player.y}); if (player.trail.length > 8) player.trail.shift();
    if (player.dashCooldown > 0) player.dashCooldown--;
    if (player.isDashing) {
        player.dashTimer--; player.speed = player.baseSpeed * 2.5; 
        if (player.dashTimer <= 0) { player.isDashing = false; player.speed = player.baseSpeed; }
    }

    let dx = 0; let dy = 0;
    if (keys['w']) dy -= 1; if (keys['s']) dy += 1;
    if (keys['a']) dx -= 1; if (keys['d']) dx += 1;
    if (dx !== 0 || dy !== 0) {
        const length = Math.hypot(dx, dy); player.x += (dx / length) * player.speed; player.y += (dy / length) * player.speed;
    }
    
    player.x = clamp(player.x, player.radius + 20, canvas.width - player.radius - 20);
    player.y = clamp(player.y, player.radius + 20, canvas.height - player.radius - 20);
    resolveBlockCollisions(player);

    if (enemies.length === 0) { currentWave++; startWave(); }

    // Enemy Logic
    for (let e = enemies.length - 1; e >= 0; e--) {
        let en = enemies[e];
        if (en.flashTimer > 0) en.flashTimer--;
        const exDx = player.x - en.x; const exDy = player.y - en.y; const dist = Math.hypot(exDx, exDy);

        if (en.type === 'brute') {
            en.x += (exDx / dist) * en.speed; en.y += (exDy / dist) * en.speed;
            if (dist < en.radius + player.radius && !player.isDashing) {
                health--; updateUI(); triggerShake(15); en.x -= (exDx / dist) * 100; en.y -= (exDy / dist) * 100;
                if (health <= 0) gameOver = true;
            }
        } else if (en.ammo <= 0 && drops.some(d => d.type === 'ammo')) {
            let ammoList = drops.filter(d => d.type === 'ammo');
            let closest = ammoList[0]; let minDist = Math.hypot(en.x - closest.x, en.y - closest.y);
            for (let i = 1; i < ammoList.length; i++) {
                let d = Math.hypot(en.x - ammoList[i].x, en.y - ammoList[i].y);
                if (d < minDist) { minDist = d; closest = ammoList[i]; }
            }
            const dropDx = closest.x - en.x; const dropDy = closest.y - en.y; const dropDist = Math.hypot(dropDx, dropDy);
            if (dropDist > 0) { en.x += (dropDx / dropDist) * en.speed; en.y += (dropDy / dropDist) * en.speed; }
        } else {
            let desiredDist = en.type === 'sniper' ? 350 : 150;
            if (dist > desiredDist) { en.x += (exDx / dist) * en.speed; en.y += (exDy / dist) * en.speed; } 
            else if (dist < desiredDist - 50 && en.type === 'sniper') { en.x -= (exDx / dist) * en.speed; en.y -= (exDy / dist) * en.speed; }
            en.cooldown--;
            if (en.cooldown <= 0 && en.ammo > 0) {
                shootBullet(en.x, en.y, player.x, player.y, false, en.type); en.ammo--; en.cooldown = en.fireRate; 
            }
        }
        en.x = clamp(en.x, en.radius + 20, canvas.width - en.radius - 20);
        en.y = clamp(en.y, en.radius + 20, canvas.height - en.radius - 20);
        resolveBlockCollisions(en);
    }

    // Bullet Logic 
    for (let i = bullets.length - 1; i >= 0; i--) {
        let b = bullets[i]; b.x += b.vx; b.y += b.vy; b.angle += 0.2; 

        if (b.x < -50 || b.x > canvas.width + 50 || b.y < -50 || b.y > canvas.height + 50) { bullets.splice(i, 1); continue; }

        if (!b.piercing) {
            if (b.x - b.radius < 20 || b.x + b.radius > canvas.width - 20) {
                b.vx *= -1; b.bounces++; b.x = clamp(b.x, b.radius + 20, canvas.width - b.radius - 20); spawnParticles(b.x, b.y, b.color, 5, 0.5); 
            }
            if (b.y - b.radius < 20 || b.y + b.radius > canvas.height - 20) {
                b.vy *= -1; b.bounces++; b.y = clamp(b.y, b.radius + 20, canvas.height - b.radius - 20); spawnParticles(b.x, b.y, b.color, 5, 0.5); 
            }
        }

        blocks.forEach(block => {
            if (b.piercing) return; 
            let cx = clamp(b.x, block.x, block.x + block.w); let cy = clamp(b.y, block.y, block.y + block.h);
            let dx = b.x - cx; let dy = b.y - cy; let dist = Math.hypot(dx, dy);
            if (dist < b.radius && dist > 0) {
                if (Math.abs(dx) > Math.abs(dy)) b.vx *= -1; else b.vy *= -1; b.bounces++;
                spawnParticles(b.x, b.y, b.color, 5, 0.5); 
                let overlap = b.radius - dist; b.x += (dx / dist) * overlap; b.y += (dy / dist) * overlap;
            }
        });

        if (b.bounces > b.maxBounces && !b.piercing) { bullets.splice(i, 1); continue; }

        if (b.isPlayer) {
            let hitEnemy = false;
            for (let e = enemies.length - 1; e >= 0; e--) {
                let en = enemies[e];
                if (Math.hypot(b.x - en.x, b.y - en.y) < b.radius + en.radius) {
                    if (b.piercing && b.hitEntities.includes(en)) continue; 

                    en.health -= b.damage; en.flashTimer = 3; hitEnemy = true;
                    if (b.piercing) b.hitEntities.push(en);

                    if (en.health <= 0) {
                        score += 100 * combo; combo++; comboTimer = 180; updateUI(); // COMBO LOGIC
                        triggerShake(8); spawnParticles(en.x, en.y, en.color, 25, 1.5); 
                        
                        let rand = Math.random();
                        if (rand < 0.10) spawnDrop(en.x, en.y, 'overclock');
                        else if (rand < 0.20) spawnDrop(en.x, en.y, 'pierce');
                        else spawnDrop(en.x, en.y, 'ammo');
                        
                        if(en.type === 'brute') spawnDrop(en.x + 15, en.y + 15, 'ammo');
                        enemies.splice(e, 1);
                    }
                    if (!b.piercing) break; 
                }
            }
            if (hitEnemy && !b.piercing) { bullets.splice(i, 1); continue; }
        }

        if (!b.isPlayer && !player.isDashing) {
            if (Math.hypot(b.x - player.x, b.y - player.y) < b.radius + player.radius + (mode === 2 ? 10 : 0)) {
                if (mode === 2) {
                    const angle = Math.atan2(b.y - player.y, b.x - player.x); const speed = Math.hypot(b.vx, b.vy);
                    if (frameCount - player.lastShieldActivation <= 15) {
                        b.color = '#ffd700'; b.vx = Math.cos(angle) * (speed * 1.5); b.vy = Math.sin(angle) * (speed * 1.5); b.damage = 3; b.maxBounces = 6;
                    } else { b.vx = Math.cos(angle) * speed; b.vy = Math.sin(angle) * speed; b.color = player.color; }
                    b.isPlayer = true; b.bounces = 0; b.x = player.x + Math.cos(angle) * (player.radius + b.radius + 15); b.y = player.y + Math.sin(angle) * (player.radius + b.radius + 15);
                } else {
                    health--; updateUI(); bullets.splice(i, 1); triggerShake(15);
                    if (health <= 0) gameOver = true;
                }
            }
        }
    }

    // Drops Ticking & Collision
    dropSpawnTimer--;
    if (dropSpawnTimer <= 0 && drops.length < 5) {
        let safePos = getSafeSpawn(15); spawnDrop(safePos.x, safePos.y, 'ammo'); dropSpawnTimer = 120;
    }

    for (let i = drops.length - 1; i >= 0; i--) {
        let drop = drops[i]; drop.angle += 0.05; 
        if (Math.hypot(player.x - drop.x, player.y - drop.y) < player.radius + drop.radius) {
            if (drop.type === 'ammo') { playerAmmo += 2; }
            else if (drop.type === 'overclock') { player.overclockTimer = 300; spawnParticles(player.x, player.y, '#ff003c', 30, 2); }
            else if (drop.type === 'pierce') { player.pierceTimer = 300; spawnParticles(player.x, player.y, '#aa00ff', 30, 2); }
            updateUI(); drops.splice(i, 1); continue;
        }
        if (drop.type === 'ammo') {
            for (let e = 0; e < enemies.length; e++) {
                if (Math.hypot(enemies[e].x - drop.x, enemies[e].y - drop.y) < enemies[e].radius + drop.radius) {
                    enemies[e].ammo = enemies[e].maxAmmo; drops.splice(i, 1); break;
                }
            }
        }
    }
}

function drawGlowCircle(x, y, radius, color) {
    ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = color; ctx.shadowBlur = 20; ctx.shadowColor = color;
    ctx.fill(); ctx.closePath(); ctx.shadowBlur = 0; 
}

function drawSlickHealthBar(ctx, x, y, current, max, color) {
    const segWidth = 8; const gap = 3; const height = 5;
    const totalWidth = (max * segWidth) + ((max - 1) * gap);
    const startX = x - totalWidth / 2;

    ctx.save();
    for (let i = 0; i < max; i++) {
        let segX = startX + i * (segWidth + gap);
        ctx.beginPath();
        ctx.moveTo(segX + 3, y); ctx.lineTo(segX + segWidth + 3, y);
        ctx.lineTo(segX + segWidth - 3, y + height); ctx.lineTo(segX - 3, y + height);
        ctx.closePath();

        if (i < current) {
            ctx.fillStyle = color; ctx.shadowBlur = 10; ctx.shadowColor = color; ctx.fill();
        } else {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.1)'; ctx.shadowBlur = 0; ctx.fill();
        }
    }
    ctx.restore();
}

function draw() {
    ctx.fillStyle = 'rgba(5, 5, 16, 0.4)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // --- APPLY SCREEN SHAKE ---
    ctx.save();
    if (shakeTime > 0) {
        let dx = (Math.random() - 0.5) * 10;
        let dy = (Math.random() - 0.5) * 10;
        ctx.translate(dx, dy);
    }

    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    stars.forEach(s => {
        s.y += s.speed;
        if (s.y > canvas.height) { s.y = 0; s.x = Math.random() * canvas.width; }
        ctx.beginPath(); ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2); ctx.fill();
    });

    ctx.strokeStyle = 'rgba(0, 243, 255, 0.05)'; ctx.lineWidth = 1; ctx.beginPath();
    const gridSize = 60;
    for(let i = 0; i < canvas.width; i += gridSize) { ctx.moveTo(i, 0); ctx.lineTo(i, canvas.height); }
    for(let i = 0; i < canvas.height; i += gridSize) { ctx.moveTo(0, i); ctx.lineTo(canvas.width, i); }
    ctx.stroke();

    ctx.fillStyle = '#050510'; 
    ctx.fillRect(0, 0, canvas.width, 20); ctx.fillRect(0, canvas.height - 20, canvas.width, 20); 
    ctx.fillRect(0, 0, 20, canvas.height); ctx.fillRect(canvas.width - 20, 0, 20, canvas.height); 

    ctx.strokeStyle = 'rgba(0, 243, 255, 0.4)'; ctx.lineWidth = 2;
    ctx.strokeRect(20, 20, canvas.width - 40, canvas.height - 40); 

    ctx.fillStyle = 'rgba(0, 243, 255, 0.2)'; const cornerSize = 80;
    ctx.beginPath(); ctx.moveTo(20, 20); ctx.lineTo(20 + cornerSize, 20); ctx.lineTo(20, 20 + cornerSize); ctx.fill();
    ctx.beginPath(); ctx.moveTo(canvas.width - 20, 20); ctx.lineTo(canvas.width - 20 - cornerSize, 20); ctx.lineTo(canvas.width - 20, 20 + cornerSize); ctx.fill();
    ctx.beginPath(); ctx.moveTo(20, canvas.height - 20); ctx.lineTo(20 + cornerSize, canvas.height - 20); ctx.lineTo(20, canvas.height - 20 - cornerSize); ctx.fill();
    ctx.beginPath(); ctx.moveTo(canvas.width - 20, canvas.height - 20); ctx.lineTo(canvas.width - 20 - cornerSize, canvas.height - 20); ctx.lineTo(canvas.width - 20, canvas.height - 20 - cornerSize); ctx.fill();

    blocks.forEach(block => {
        ctx.fillStyle = 'rgba(10, 15, 25, 0.9)'; ctx.fillRect(block.x, block.y, block.w, block.h);
        ctx.save(); ctx.beginPath(); ctx.rect(block.x, block.y, block.w, block.h); ctx.clip(); 
        ctx.strokeStyle = 'rgba(0, 243, 255, 0.15)'; ctx.lineWidth = 3;
        for(let i = -block.h; i < block.w; i += 20) {
            ctx.beginPath(); ctx.moveTo(block.x + i, block.y); ctx.lineTo(block.x + i + block.h, block.y + block.h); ctx.stroke();
        }
        ctx.restore();
        ctx.strokeStyle = '#00f3ff'; ctx.lineWidth = 2; ctx.shadowBlur = 10; ctx.shadowColor = '#00f3ff';
        ctx.strokeRect(block.x, block.y, block.w, block.h); ctx.shadowBlur = 0;
        ctx.fillStyle = '#00f3ff'; let acc = 6; 
        ctx.fillRect(block.x, block.y, acc, acc); ctx.fillRect(block.x + block.w - acc, block.y, acc, acc);
        ctx.fillRect(block.x, block.y + block.h - acc, acc, acc); ctx.fillRect(block.x + block.w - acc, block.y + block.h - acc, acc, acc);
    });

    // --- DRAW POWERUPS (Replaced ammoDrops) ---
    drops.forEach(drop => {
        ctx.save(); ctx.translate(drop.x, drop.y); ctx.rotate(drop.angle);
        ctx.strokeStyle = drop.color; ctx.lineWidth = 3; ctx.shadowBlur = 15; ctx.shadowColor = drop.color;
        ctx.beginPath();
        if (drop.type === 'ammo') {
            ctx.rect(-drop.radius, -drop.radius, drop.radius * 2, drop.radius * 2); ctx.stroke(); 
            ctx.rotate(-drop.angle * 2); ctx.beginPath(); ctx.rect(-drop.radius / 2, -drop.radius / 2, drop.radius, drop.radius); ctx.stroke();
        } else if (drop.type === 'overclock') {
            ctx.moveTo(-drop.radius, 0); ctx.lineTo(drop.radius, 0); ctx.moveTo(0, -drop.radius); ctx.lineTo(0, drop.radius); ctx.stroke();
            ctx.beginPath(); ctx.rect(-drop.radius, -drop.radius, drop.radius * 2, drop.radius * 2); ctx.stroke();
        } else if (drop.type === 'pierce') {
            ctx.moveTo(drop.radius, 0); ctx.lineTo(-drop.radius, drop.radius); ctx.lineTo(-drop.radius, -drop.radius); ctx.closePath(); ctx.stroke();
        }
        ctx.restore();
    });

    // --- DRAW BULLETS (Updated with Piercing graphics) ---
    bullets.forEach(b => {
        ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.angle);
        ctx.strokeStyle = b.color; ctx.lineWidth = 3; ctx.shadowBlur = 10; ctx.shadowColor = b.color;
        if (b.piercing) {
            ctx.beginPath(); ctx.moveTo(b.radius * 1.5, 0); ctx.lineTo(-b.radius, b.radius * 0.8); ctx.lineTo(-b.radius, -b.radius * 0.8); ctx.closePath();
            ctx.stroke(); ctx.fillStyle = b.color; ctx.fill();
        } else {
            ctx.beginPath(); ctx.arc(0, 0, b.radius, 0, Math.PI * 2); ctx.stroke();
            ctx.fillStyle = b.color;
            for(let i=0; i<3; i++) { let tAngle = (i * Math.PI * 2) / 3; ctx.beginPath(); ctx.arc(Math.cos(tAngle)*(b.radius*0.5), Math.sin(tAngle)*(b.radius*0.5), b.radius*0.3, 0, Math.PI*2); ctx.fill(); }
        }
        ctx.restore();
    });

    // --- DRAW PARTICLES ---
    particles.forEach(p => {
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.fillStyle = p.color;
        ctx.shadowBlur = 10; ctx.shadowColor = p.color;
        ctx.fillRect(p.x, p.y, p.size, p.size);
    });
    ctx.globalAlpha = 1.0; ctx.shadowBlur = 0;

    if (!gameOver) {
        if(player.trail.length > 0 && !player.isDashing) {
            ctx.beginPath(); ctx.moveTo(player.trail[0].x, player.trail[0].y);
            for(let i=1; i<player.trail.length; i++) ctx.lineTo(player.trail[i].x, player.trail[i].y);
            ctx.strokeStyle = `rgba(0, 243, 255, 0.2)`; ctx.lineWidth = player.radius * 0.8; ctx.lineCap = 'round'; ctx.stroke();
        }

        ctx.save(); ctx.translate(player.x, player.y); ctx.rotate(player.angle); 
        ctx.beginPath(); ctx.moveTo(player.radius, 0); ctx.lineTo(-player.radius, player.radius * 0.8); 
        ctx.lineTo(-player.radius * 0.5, 0); ctx.lineTo(-player.radius, -player.radius * 0.8); ctx.closePath();
        ctx.fillStyle = player.color; ctx.shadowBlur = player.isDashing ? 30 : 15; ctx.shadowColor = player.isDashing ? 'white' : player.color;
        if(player.isDashing) { ctx.strokeStyle = 'white'; ctx.lineWidth = 3; ctx.stroke(); } else { ctx.fill(); }
        ctx.restore();

        if (mode === 2) {
            let isPerfectWindow = (frameCount - player.lastShieldActivation) <= 15;
            ctx.beginPath(); ctx.arc(player.x, player.y, player.radius + 15, 0, Math.PI * 2);
            ctx.strokeStyle = isPerfectWindow ? '#ffd700' : '#00ff66'; ctx.lineWidth = 4;
            ctx.shadowBlur = 15; ctx.shadowColor = isPerfectWindow ? '#ffd700' : '#00ff66'; ctx.stroke(); ctx.closePath(); ctx.shadowBlur = 0;
        }
        drawSlickHealthBar(ctx, player.x, player.y - 40, health, 5, '#00ff66');

        // DRAW ACTIVE POWER-UP TEXT
        if (player.overclockTimer > 0) {
            ctx.fillStyle = '#ff003c'; ctx.font = 'bold 16px Orbitron'; ctx.textAlign = 'center'; ctx.fillText(`OVERCLOCK`, player.x, player.y - 65);
        }
        if (player.pierceTimer > 0) {
            ctx.fillStyle = '#aa00ff'; ctx.font = 'bold 16px Orbitron'; ctx.textAlign = 'center'; ctx.fillText(`PIERCING`, player.x, player.y - (player.overclockTimer > 0 ? 80 : 65));
        }
    }

    enemies.forEach(en => {
        // --- DRAW ENEMY FLASH ---
        if (en.flashTimer > 0) {
            drawGlowCircle(en.x, en.y, en.radius, '#ffffff'); 
        } else {
            drawGlowCircle(en.x, en.y, en.radius, en.color);
        }

        drawSlickHealthBar(ctx, en.x, en.y - 45, Math.max(0, en.health), en.maxHealth, en.color);
        if (en.ammo <= 0 && en.type !== 'brute') {
            ctx.fillStyle = '#ffcc00'; ctx.font = '12px Orbitron, sans-serif'; ctx.textAlign = 'center';
            ctx.fillText("SEEKING AMMO", en.x, en.y - 50);
        }
    });

    // --- RESTORE FROM SHAKE BEFORE DRAWING UI ---
    ctx.restore();

    if (gameStarted && !gameOver) {
        ctx.fillStyle = '#fff'; ctx.font = '24px Orbitron, sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(`WAVE: ${currentWave}`, canvas.width / 2, 40);
        if (player.dashCooldown > 0) {
            ctx.fillStyle = 'white'; ctx.fillRect(player.x - 15, player.y + 30, 30, 4);
            ctx.fillStyle = '#00f3ff'; ctx.fillRect(player.x - 15, player.y + 30, (1 - (player.dashCooldown / 90)) * 30, 4);
        }

        // DRAW COMBO METER
        if (combo > 1 && comboTimer > 0) {
            ctx.fillStyle = '#ffcc00'; ctx.font = 'bold 36px Orbitron, sans-serif'; ctx.textAlign = 'center';
            let scale = 1 + (comboTimer / 180) * 0.2; 
            ctx.save(); ctx.translate(canvas.width / 2, 90); ctx.scale(scale, scale);
            ctx.shadowBlur = 15; ctx.shadowColor = '#ffcc00'; ctx.fillText(`COMBO x${combo}`, 0, 0); ctx.restore();
            ctx.fillStyle = 'rgba(255, 204, 0, 0.3)'; ctx.fillRect(canvas.width / 2 - 60, 105, 120, 6);
            ctx.fillStyle = '#ffcc00'; ctx.fillRect(canvas.width / 2 - 60, 105, (comboTimer / 180) * 120, 6);
        }
    }

    if (gameOver) {
        ctx.fillStyle = 'rgba(0,0,0,0.8)'; ctx.fillRect(0,0, canvas.width, canvas.height);
        ctx.fillStyle = '#ff003c'; ctx.font = '50px Orbitron, sans-serif'; ctx.textAlign = 'center';
        ctx.fillText("SYSTEM FAILURE. GAME OVER.", canvas.width / 2, canvas.height / 2);
        ctx.fillStyle = '#fff'; ctx.font = '25px Orbitron, sans-serif';
        // ADDED FINAL SCORE TO GAME OVER SCREEN
        ctx.fillText(`SURVIVED TO WAVE: ${currentWave} | FINAL SCORE: ${score}`, canvas.width / 2, canvas.height / 2 + 50);
    }
}
function gameLoop() {
    update(); draw(); requestAnimationFrame(gameLoop);
}

window.addEventListener('resize', () => {
    canvas.width = window.innerWidth; canvas.height = window.innerHeight;
    stars = Array.from({ length: 150 }, () => ({ x: Math.random() * canvas.width, y: Math.random() * canvas.height, speed: Math.random() * 4 + 1, size: Math.random() * 2 }));
});

generateBlocks();
gameLoop();