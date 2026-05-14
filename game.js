const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

let highScore = 0;
let selectedPlayerColor = '#00f3ff'; // Default Cyan
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
let waveTransitionTimer = 0; // Controls the pause between waves
let cubeCount = 0;
let overdriveTimer = 0;
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
let superCharge = 0; 
const MAX_SUPER = 100;
let isUpgrading = false;

// ============================================================
// --- META-PROGRESSION SYSTEM ---
// Credits persist between runs via localStorage.
// ============================================================
let metaCredits = 0;
let metaLevels  = {}; // e.g. { extraAmmo: 2, hullPlating: 1 }
let debriefOpen = false;
let armoryCalledFromDebrief = false;


// Change this at the top of game.js
const isMobile = window.innerWidth < 900;
const gameScale = isMobile ? 0.6 : 1.0; // 0.6 will make them 40% smaller on phones!
const META_UPGRADE_DEFS = [
    // ── TIER 1 (always available) ──────────────────────────
    { id: 'extraAmmo',   tier: 1, col: 0, title: 'AMMO RESERVE',
      desc: 'Start every run with +3 bonus ammo.',
      color: '#00f3ff', cost: [50, 75, 100], maxLevel: 3, prereq: null },
    { id: 'hullPlating', tier: 1, col: 1, title: 'HULL PLATING',
      desc: 'Start every run with +1 max armor.',
      color: '#39ff14', cost: [75, 100, 125], maxLevel: 3, prereq: null },
    { id: 'turboJets',   tier: 1, col: 2, title: 'TURBO JETS',
      desc: 'Dash cooldown reduced by 25%.',
      color: '#ff00ea', cost: [100], maxLevel: 1, prereq: null },
    { id: 'salvageCore', tier: 1, col: 3, title: 'SALVAGE CORE',
      desc: 'Enemy kills always drop an ammo pickup.',
      color: '#ffd700', cost: [125], maxLevel: 1, prereq: null },
    // ── TIER 2 (requires tier-1 prereq) ───────────────────
    { id: 'resupply',     tier: 2, col: 0, title: 'RESUPPLY',
      desc: 'Gain +3 ammo at the start of each new wave.',
      color: '#00f3ff', cost: [175], maxLevel: 1, prereq: 'extraAmmo' },
    { id: 'nanoRepair',   tier: 2, col: 1, title: 'NANO REPAIR',
      desc: 'Restore 1 armor every 5 waves cleared.',
      color: '#39ff14', cost: [200], maxLevel: 1, prereq: 'hullPlating' },
    { id: 'fieldIntel',   tier: 2, col: 2, title: 'FIELD INTEL',
      desc: 'Begin each run with 1 random upgrade already applied.',
      color: '#ff00ea', cost: [300], maxLevel: 1, prereq: 'turboJets' },
    { id: 'overdriveSeed',tier: 2, col: 3, title: 'OVERDRIVE SEED',
      desc: 'Start each run with 5 data cubes already collected.',
      color: '#ffd700', cost: [250], maxLevel: 1, prereq: 'salvageCore' },
];

function getMetaLevel(id) { return metaLevels[id] || 0; }

function loadMetaProgress() {
    try {
        metaCredits = parseInt(localStorage.getItem('neonArena_credits') || '0');
        metaLevels  = JSON.parse(localStorage.getItem('neonArena_levels')  || '{}');
    } catch(e) { metaCredits = 0; metaLevels = {}; }
    refreshCreditsDisplays();
}

function saveMetaProgress() {
    localStorage.setItem('neonArena_credits', metaCredits.toString());
    localStorage.setItem('neonArena_levels',  JSON.stringify(metaLevels));
}

function refreshCreditsDisplays() {
    document.querySelectorAll('.cr-live').forEach(el => el.textContent = metaCredits);
}

// Silent upgrade applicator — used by fieldIntel at run-start
function applyUpgradeSilent(id) {
    if (id === 'twinLink')       { player.upgrades.twinLink = true; player.twinLinkTimer = 1800; }
    if (id === 'magneticHull')   player.upgrades.magneticHull = true;
    if (id === 'vampiricDash')   player.upgrades.vampiricDash = true;
    if (id === 'ricochet')       player.upgrades.ricochet = true;
    if (id === 'heavyCaliber')   player.upgrades.heavyCaliber = true;
    if (id === 'deepPockets')    player.upgrades.deepPockets = true;
    if (id === 'hyperThrusters') { player.baseSpeed *= 1.2; player.speed = player.baseSpeed; }
    if (id === 'maxArmor')       { health = 5 + getMetaLevel('hullPlating') + 5; }
    updateUI();
}

// ── DEBRIEF ──────────────────────────────────────────────────
function calcCreditsEarned() {
    const scoreBonus = Math.floor(score / 10);
    const waveBonus  = currentWave * 5;
    return { scoreBonus, waveBonus, total: scoreBonus + waveBonus };
}

function showDebrief() {
    if (debriefOpen) return;
    debriefOpen = true;

    const earned = calcCreditsEarned();
    metaCredits += earned.total;
    saveMetaProgress();
    refreshCreditsDisplays();

    document.getElementById('db-score').textContent = score;
    document.getElementById('db-wave').textContent  = currentWave;
    document.getElementById('db-breakdown').innerHTML =
        `<span>SCORE BONUS <b>+${earned.scoreBonus}</b></span>` +
        `<span>WAVE BONUS <b>+${earned.waveBonus}</b></span>`;
    document.getElementById('db-total').textContent = metaCredits;

    // Animate the credit counter ticking up
    const counter = document.getElementById('db-earned-counter');
    counter.textContent = '+0';
    let displayed = 0;
    const step = Math.max(1, Math.ceil(earned.total / 40));
    const iv = setInterval(() => {
        displayed = Math.min(displayed + step, earned.total);
        counter.textContent = '+' + displayed;
        if (displayed >= earned.total) clearInterval(iv);
    }, 25);

    document.getElementById('debriefScreen').style.display = 'flex';
}

function returnToBase() {
    debriefOpen = false;
    document.getElementById('debriefScreen').style.display = 'none';
    resetGame();
}

// ── ARMORY ───────────────────────────────────────────────────
function openArmory(fromDebrief) {
    armoryCalledFromDebrief = !!fromDebrief;
    if (fromDebrief) document.getElementById('debriefScreen').style.display = 'none';
    renderArmory();
    document.getElementById('armoryScreen').style.display = 'flex';
}

function closeArmory() {
    document.getElementById('armoryScreen').style.display = 'none';
    if (armoryCalledFromDebrief) document.getElementById('debriefScreen').style.display = 'flex';
}

function renderArmory() {
    refreshCreditsDisplays();
    document.getElementById('armory-cr').textContent = metaCredits;
    const tree = document.getElementById('techTree');
    tree.innerHTML = '';

    [1, 2].forEach(tier => {
        const row = document.createElement('div');
        row.className = 'tech-row';

        META_UPGRADE_DEFS.filter(u => u.tier === tier).sort((a,b) => a.col - b.col).forEach(upg => {
            const level      = getMetaLevel(upg.id);
            const prereqMet  = !upg.prereq || getMetaLevel(upg.prereq) > 0;
            const maxed      = level >= upg.maxLevel;
            const cost       = maxed ? 0 : (upg.cost[level] ?? upg.cost[upg.cost.length - 1]);
            const canAfford  = metaCredits >= cost;
            const buyable    = !maxed && prereqMet && canAfford;

            const node = document.createElement('div');
            node.className = [
                'tech-node',
                !prereqMet ? 'node-locked'   : '',
                maxed       ? 'node-maxed'    : '',
                buyable     ? 'node-buyable'  : '',
            ].join(' ').trim();
            node.style.setProperty('--nc', upg.color);

            const pips = upg.maxLevel > 1
                ? `<div class="node-pips">${'◆'.repeat(level)}${'◇'.repeat(upg.maxLevel - level)}</div>`
                : '';
            const costEl = maxed
                ? `<div class="node-tag installed">INSTALLED</div>`
                : !prereqMet
                    ? `<div class="node-tag locked">LOCKED</div>`
                    : `<div class="node-tag ${canAfford ? 'cost-ok' : 'cost-no'}">${cost} CR</div>`;

            node.innerHTML = `
                <div class="node-title">${upg.title}</div>
                ${pips}
                <div class="node-desc">${upg.desc}</div>
                ${costEl}`;

            if (buyable) node.onclick = () => buyMetaUpgrade(upg.id);
            row.appendChild(node);
        });

        tree.appendChild(row);

        // Draw connector row between tier 1 and tier 2
        if (tier === 1) {
            const connRow = document.createElement('div');
            connRow.className = 'tech-connectors';
            for (let i = 0; i < 4; i++) {
                const line = document.createElement('div');
                line.className = 'tech-line';
                connRow.appendChild(line);
            }
            tree.appendChild(connRow);
        }
    });
}

function buyMetaUpgrade(id) {
    const def   = META_UPGRADE_DEFS.find(u => u.id === id);
    if (!def) return;
    const level = getMetaLevel(id);
    if (level >= def.maxLevel) return;
    const cost  = def.cost[level] ?? def.cost[def.cost.length - 1];
    if (metaCredits < cost) return;

    metaCredits      -= cost;
    metaLevels[id]    = level + 1;
    saveMetaProgress();
    renderArmory();
}
// ── END META-PROGRESSION ──────────────────────────────────────
const joysticks = {
    left: { active: false, id: null, startX: 0, startY: 0, vX: 0, vY: 0 },
    right: { active: false, id: null, startX: 0, startY: 0, vX: 0, vY: 0 }
};

// Spaceship Background Stars
let stars = Array.from({ length: 150 }, () => ({
    x: Math.random() * canvas.width,
    y: Math.random() * canvas.height,
    speed: Math.random() * 4 + 1, 
    size: Math.random() * 2
}));

// Entities
const player = { 
    upgrades: { twinLink: false, magneticHull: false, vampiricDash: false, ricochet: false, heavyCaliber: false, deepPockets: false },
    x: canvas.width / 2, 
    y: canvas.height / 2, 
  radius: 20 * gameScale,
    speed: 6, 
    baseSpeed: 6, 
    color: selectedPlayerColor, 
    dashCooldown: 0, 
    isDashing: false, 
    dashTimer: 0,
    lastShieldActivation: 0, 
    angle: 0, 
    trail: [],
    overclockTimer: 0, 
    pierceTimer: 0,
    
    twinLinkTimer: 0 // <--- NEW: Timer for the 30-second twin link!
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
      let w = (Math.random() * 100 + 50) * gameScale; 
let h = (Math.random() * 100 + 50) * gameScale;
        
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
// --- PREVENT SPAWN CAMPING ---
function getSafeSpawn(enemyRadius) {
    let spawnX, spawnY;
    let dist = 0;
    let safeDistance = 300; // Enemies MUST spawn at least 300 pixels away from you
    let attempts = 0; // Prevent infinite loops just in case the screen is tiny
    
    // Keep generating new coordinates until they are far enough away from the player
    while (dist < safeDistance && attempts < 50) {
        spawnX = enemyRadius + Math.random() * (canvas.width - enemyRadius * 2);
        spawnY = enemyRadius + Math.random() * (canvas.height - enemyRadius * 2);
        
        // Calculate distance from this random spot to the player
        dist = Math.hypot(spawnX - player.x, spawnY - player.y);
        attempts++;
    }
    
    return { x: spawnX, y: spawnY };
}
// --- ENEMY FACTORY & WAVES ---
function createEnemy(type, x, y) {
    let diffMultiplier = selectedDifficulty === 'hard' ? 1.5 : (selectedDifficulty === 'easy' ? 0.7 : 1);
    
    if (type === 'standard') return { x, y, radius: 25* gameScale, speed: 2.5 * diffMultiplier, color: '#ff003c', health: 5, maxHealth: 5, cooldown: 0, fireRate: 100 / diffMultiplier, ammo: 3, maxAmmo: 3, type: 'standard', flashTimer: 0, overclockTimer: 0, pierceTimer: 0 };
    if (type === 'sniper') return { x, y, radius: 20* gameScale, speed: 1.2 * diffMultiplier, color: '#aa00ff', health: 3, maxHealth: 3, cooldown: 0, fireRate: 150 / diffMultiplier, ammo: 2, maxAmmo: 2, type: 'sniper', flashTimer: 0, overclockTimer: 0, pierceTimer: 0 };
    if (type === 'brute') return { x, y, radius: 35* gameScale, speed: 3.5 * diffMultiplier, color: '#ff8800', health: 12, maxHealth: 12, cooldown: 0, fireRate: 9999, ammo: 0, maxAmmo: 0, type: 'brute', flashTimer: 0, overclockTimer: 0, pierceTimer: 0 };
    
    // THE BOSS
    if (type === 'boss') return { x, y, radius: 50* gameScale, speed: 2.0, color: '#ff003c', health: 50 * diffMultiplier, maxHealth: 50 * diffMultiplier, cooldown: 0, type: 'boss', state: 'entering', stateTimer: 100, angle: 0, targetX: 0, targetY: 0, flashTimer: 0};
    
    // --- NEW: THE LOOT PINATA ---
    // It is very fast, has 10 health, doesn't shoot, and escapes after 10 seconds (600 frames)
 // --- NEW: THE LOOT PINATA (Bigger & Slower) ---
    // Radius increased from 15 to 22. Speed reduced from 5.5 to 4.0.
    if (type === 'pinata') return { x, y, radius: 22* gameScale, speed: 4.0 * diffMultiplier, color: '#ffd700', health: 10, maxHealth: 10, cooldown: 0, fireRate: 9999, ammo: 0, maxAmmo: 0, type: 'pinata', flashTimer: 0, overclockTimer: 0, pierceTimer: 0, escapeTimer: 600, angle: 0 };
}
function startWave() {
    // Check if it's a Boss Wave (Wave 5, 10, 15...)
    if (currentWave % 5 === 0) {
        blocks = []; // Retract all blocks for an open arena!
        enemies = [{
            type: 'boss', 
            x: canvas.width / 2, 
            y: -100, // Spawns off-screen and moves down
            radius: 50, 
            speed: 1.5, 
            color: '#ff003c', 
            health: 70 + (currentWave * 10), // Scales with wave
            maxHealth: 100 + (currentWave * 10), 
            cooldown: 0, 
            state: 'entering', // States: entering, bullet_hell, dashing
            stateTimer: 120, 
            angle: 0,
            flashTimer: 0
        }];
        spawnFloatingText(canvas.width / 2, canvas.height / 2, "WARNING: DREADNOUGHT", "#ff003c", 40);
        triggerShake(30);
        return; // Skip standard enemy spawning
    }
    generateBlocks(); 
    enemies = [];
    let numEnemies = Math.min(1 + Math.floor(currentWave / 2), 6); 
    
   // Inside startWave()...
    for(let i = 0; i < numEnemies; i++) {
        let type = 'standard';
        if (currentWave >= 2 && Math.random() < 0.3) type = 'sniper';
        if (currentWave >= 3 && Math.random() < 0.2) type = 'brute';
        
        // USE THE SAFE SPAWN LOGIC HERE:
        let safePos = getSafeSpawn(35); 
        enemies.push(createEnemy(type, safePos.x, safePos.y)); 
    }
    
    playerAmmo += 2;
    // resupply meta bonus
    if (getMetaLevel('resupply') > 0) playerAmmo += 3;
    updateUI();
        let type = 'standard';
        if (currentWave >= 2 && Math.random() < 0.3) type = 'sniper';
        if (currentWave >= 3 && Math.random() < 0.2) type = 'brute';
        let safePos = getSafeSpawn(35); 
        enemies.push(createEnemy(type, safePos.x, safePos.y)); 
    }

    // --- NEW: 15% CHANCE TO SPAWN A LOOT PINATA ---
    if (Math.random() < 0.15) {
        let safePos = getSafeSpawn(20);
        enemies.push(createEnemy('pinata', safePos.x, safePos.y));
        spawnFloatingText(canvas.width / 2, 100, "LOOT PINATA DETECTED!", "#ffd700", 30);
    }

    playerAmmo += 2; updateUI();


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

// Updated Color Swatch Logic
const swatches = document.querySelectorAll('.swatch');
swatches.forEach(s => {
    s.addEventListener('click', (e) => {
        swatches.forEach(sw => sw.classList.remove('active'));
        e.target.classList.add('active');
        selectedPlayerColor = e.target.getAttribute('data-color');
    });
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

        // fieldIntel: start with a free random in-run upgrade
        if (getMetaLevel('fieldIntel') > 0) {
            const randomUpg = upgradePool[Math.floor(Math.random() * upgradePool.length)];
            applyUpgradeSilent(randomUpg.id);
            spawnFloatingText(canvas.width / 2, canvas.height / 2 - 60,
                `FIELD INTEL: ${randomUpg.title}`, '#ff00ea', 22);
        }
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
        player.dashCooldown = getMetaLevel('turboJets') > 0 ? 68 : 90; // turboJets: -25%
    }

    if (key === '1') { mode = 1; updateUI(); }
    if (key === '2' && mode !== 2) { 
        mode = 2; 
        player.lastShieldActivation = frameCount; 
        updateUI(); 
    }
});

// Dynamic Joystick Touch Logic
// --- FIXED MULTI-TOUCH JOYSTICK LOGIC ---
function handleTouch(e) {
    e.preventDefault(); 
    for (let touch of e.changedTouches) {
        const tx = touch.clientX;
        const ty = touch.clientY;

        if (tx < window.innerWidth / 2) {
            joysticks.left.active = true;
            joysticks.left.id = touch.identifier; 
            joysticks.left.startX = tx;
            joysticks.left.startY = ty;
            document.getElementById('left-joystick').style.opacity = '1';
            document.getElementById('left-joystick').style.left = tx + 'px';
            document.getElementById('left-joystick').style.top = ty + 'px';
        } else {
            joysticks.right.active = true;
            joysticks.right.id = touch.identifier; 
            joysticks.right.startX = tx;
            joysticks.right.startY = ty;
            isMouseDown = true; 
            document.getElementById('right-joystick').style.opacity = '1';
            document.getElementById('right-joystick').style.left = tx + 'px';
            document.getElementById('right-joystick').style.top = ty + 'px';
        }
    }
}

function handleTouchMove(e) {
    e.preventDefault();
    for (let touch of e.touches) {
        const tx = touch.clientX;
        const ty = touch.clientY;

        if (touch.identifier === joysticks.left.id) {
            let dx = tx - joysticks.left.startX;
            let dy = ty - joysticks.left.startY;
            let dist = Math.min(Math.hypot(dx, dy), 50);
            let angle = Math.atan2(dy, dx);
            joysticks.left.vX = Math.cos(angle) * (dist / 50);
            joysticks.left.vY = Math.sin(angle) * (dist / 50);
            
            const nub = document.querySelector('#left-joystick .joystick-nub');
            nub.style.transform = `translate(calc(-50% + ${Math.cos(angle)*dist}px), calc(-50% + ${Math.sin(angle)*dist}px))`;
        }

      if (touch.identifier === joysticks.right.id) {
            let dx = tx - joysticks.right.startX;
            let dy = ty - joysticks.right.startY;
            let angle = Math.atan2(dy, dx);
            
            player.angle = angle; 
            
            // --- ADD THIS: FAKE THE MOUSE POSITION FOR SHOOTING ---
            mouse.x = player.x + Math.cos(angle) * 100;
            mouse.y = player.y + Math.sin(angle) * 100;
            
            // Visual Update
            const nub = document.querySelector('#right-joystick .joystick-nub');
            let dist = Math.min(Math.hypot(dx, dy), 50);
            nub.style.transform = `translate(calc(-50% + ${Math.cos(angle)*dist}px), calc(-50% + ${Math.sin(angle)*dist}px))`;
        }
    }
}

function handleTouchEnd(e) {
    for (let touch of e.changedTouches) {
        if (touch.identifier === joysticks.left.id) {
            joysticks.left.active = false;
            joysticks.left.id = null;
            joysticks.left.vX = 0;
            joysticks.left.vY = 0;
            document.querySelector('#left-joystick .joystick-nub').style.transform = 'translate(-50%, -50%)';
            document.getElementById('left-joystick').style.opacity = '0';
        }
        if (touch.identifier === joysticks.right.id) {
            joysticks.right.active = false;
            joysticks.right.id = null;
            isMouseDown = false; 
            document.querySelector('#right-joystick .joystick-nub').style.transform = 'translate(-50%, -50%)';
            document.getElementById('right-joystick').style.opacity = '0';
        }
    }
}

canvas.addEventListener('touchstart', handleTouch, { passive: false });
canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
canvas.addEventListener('touchend', handleTouchEnd, { passive: false });

window.addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });
window.addEventListener('mousemove', (e) => { mouse.x = e.clientX; mouse.y = e.clientY; });
window.addEventListener('mousedown', () => {
    // Game over: show debrief (credits payout) on first click
    if (gameOver) {
        if (!debriefOpen) showDebrief();
        return; 
    }

    if (!gameStarted) return; 
    
    isMouseDown = true;
    if (mode === 1 && playerAmmo > 0 && !gameOver && player.overclockTimer <= 0) {
        
        // --- TWIN LINK LOGIC (Standard Fire) ---
        if (player.upgrades && player.upgrades.twinLink) {
            let angle = Math.atan2(mouse.y - player.y, mouse.x - player.x);
            let pAngle = angle + Math.PI/2;
            let ox = Math.cos(pAngle) * 8; let oy = Math.sin(pAngle) * 8;
            shootBullet(player.x + ox, player.y + oy, mouse.x + ox, mouse.y + oy, true, 'standard');
            shootBullet(player.x - ox, player.y - oy, mouse.x - ox, mouse.y - oy, true, 'standard');
        } else {
            shootBullet(player.x, player.y, mouse.x, mouse.y, true, 'standard');
        }
        
        playerAmmo--; updateUI();
    }
});
window.addEventListener('mouseup', () => { isMouseDown = false; });

function updateUI() {
    const ammoDisplay = document.getElementById('ammoDisplay');
    
    // Check if Overclock is active
    if (player.overclockTimer > 0) {
        ammoDisplay.innerText = "OVERCLOCKED [∞]"; 
        ammoDisplay.className = "neon-text-red";
    } 
    // NEW: Check if Twin-Link is active!
    else if (player.upgrades && player.upgrades.twinLink) {
        ammoDisplay.innerText = `TWIN-LINK [${playerAmmo}]`; 
        ammoDisplay.className = "neon-text-green"; // Make it green so they know they are buffed!
    } 
    // Normal Ammo
    else if (playerAmmo > 0) {
        ammoDisplay.innerText = `READY [${playerAmmo}]`; 
        ammoDisplay.className = "neon-text-blue";
    } 
    // Empty Ammo
    else {
        ammoDisplay.innerText = "EMPTY - FIND AMMO"; 
        ammoDisplay.className = "neon-text-red";
    }

    const modeDisplay = document.getElementById('modeDisplay');
    modeDisplay.innerText = mode === 1 ? "ATTACK (1)" : "DEFLECT (2)";
    modeDisplay.className = mode === 1 ? "neon-text-blue" : "neon-text-green";
    
    document.getElementById('healthDisplay').innerText = health;
    const scoreDisplay = document.getElementById('scoreDisplay');
    if (scoreDisplay) scoreDisplay.innerText = score;
}

// --- GAME LOGIC ---
// --- GAME LOGIC ---
function shootBullet(startX, startY, targetX, targetY, isPlayer, shooterType) {
    const angle = Math.atan2(targetY - startY, targetX - startX);
    const speed = shooterType === 'sniper' ? 18 : 12;
    const spawnX = startX + Math.cos(angle) * 25;
    const spawnY = startY + Math.sin(angle) * 25;
    
    let isPiercing = isPlayer && player.pierceTimer > 0;
    let startBounces = 0;
    let bulletDamage = 1;

    // Apply upgrades if it's a player bullet
    if (isPlayer && player.upgrades) {
        if (player.upgrades.ricochet) startBounces = -2; 
        if (player.upgrades.heavyCaliber) bulletDamage = 2; 
    }

    // Fix: determine bullet color based on who is shooting
    let bulletColor = isPlayer ? player.color : (shooterType === 'sniper' ? '#aa00ff' : '#ff003c');

    // Fix: Replaced sx, sy, spd, and c with the correct variables!
   bullets.push({
        x: spawnX, 
        y: spawnY, 
        vx: Math.cos(angle) * speed, 
        vy: Math.sin(angle) * speed,
        radius: isPlayer ? 10 : 12, 
        color: bulletColor, 
        isPlayer: isPlayer, 
        bounces: startBounces, 
        life: 0, 
        maxLife: 150, 
        damage: bulletDamage,
        piercing: isPiercing, // <--- WE ADDED THIS BACK!
        hitEntities: []       // <--- AND THIS!
    });
}

// --- HYPER-JUICE STATE ---
let hitStopFrames = 0;
let floatingTexts = [];

function triggerHitStop(frames) {
    hitStopFrames = frames;
}

function spawnFloatingText(x, y, text, color, size) {
    floatingTexts.push({
        x: x + (Math.random() - 0.5) * 30, // Slight random horizontal offset
        y: y,
        text: text,
        color: color,
        size: size,
        life: 1.0,
        vy: -1.5 - Math.random() // Float upwards speed
    });
}

function spawnDrop(x, y, type) {
    let color = '#ffcc00'; 
    if (type === 'overclock') color = '#ff003c'; 
    if (type === 'pierce') color = '#aa00ff';
    if (type === 'heal') color = '#00ff66'; // NEW: Green for healing
    
    drops.push({ x, y, radius: 15* gameScale, angle: 0, type: type, color: color });
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
function resetGame() {
    player.color = selectedPlayerColor; // Apply the chosen color!
    document.getElementById('bestScoreDisplay').innerText = highScore; // Update menu text
    
    // 1. Reset Stats (meta bonuses applied below)
    gameStarted = false;
    gameOver = false;
    health = 5 + getMetaLevel('hullPlating');          // hullPlating bonus
    playerAmmo = 3 + getMetaLevel('extraAmmo') * 3;    // extraAmmo bonus
    cubeCount = getMetaLevel('overdriveSeed') > 0 ? 5 : 0; // overdriveSeed bonus
    score = 0;
    combo = 1;
    comboTimer = 0;
    currentWave = 1;
    frameCount = 0;
    waveTransitionTimer = 0;

    // --- MOBILE FIX: Reset touch/mouse inputs so the ship doesn't get stuck! ---
    isMouseDown = false;
    if (typeof joysticks !== 'undefined') {
        joysticks.left.active = false;
        joysticks.right.active = false;
        joysticks.left.vX = 0;
        joysticks.left.vY = 0;
    }
    
    // 2. Reset Player
    player.x = canvas.width / 2;
    player.y = canvas.height / 2;
    player.isDashing = false;
    player.dashCooldown = 0;
    player.overclockTimer = 0;
    player.pierceTimer = 0;
    player.trail = [];
    
    // --- WIPE ALL UPGRADES AND TIMERS ON DEATH ---
    player.twinLinkTimer = 0;
    player.upgrades = { 
        twinLink: false, 
        magneticHull: false, 
        vampiricDash: false, 
        ricochet: false, 
        heavyCaliber: false, 
        deepPockets: false,
        quantumCascade: false // <-- INTEGRATED NEW UPGRADE WIPE
    };
    
    // 3. Clear the screen
    enemies = [];
    bullets = [];
    drops = [];
    particles = [];
    floatingTexts = [];
    if (typeof shockwaves !== 'undefined') shockwaves = []; // <-- INTEGRATED SHOCKWAVE WIPE
    
    // 4. Bring the Menu Back
    const startScreen = document.getElementById('startScreen');
    startScreen.style.display = 'flex'; // Use flex to keep the UI centered
    startScreen.style.opacity = '1';
    document.getElementById('ui').style.display = 'none';
    
    // Generate a new background layout for the menu
    generateBlocks(); 
    updateUI();
}

function update() {
    // 1. HIT-STOP FREEZE LOGIC
    if (hitStopFrames > 0) {
        hitStopFrames--;
        return; // Skip the entire update loop to freeze the game!
    }

    // 2. UPDATE FLOATING TEXT
    for (let i = floatingTexts.length - 1; i >= 0; i--) {
        let ft = floatingTexts[i];
        ft.y += ft.vy;
        ft.life -= 0.02; // Fade out
        if (ft.life <= 0) floatingTexts.splice(i, 1);
    }

    player.angle = Math.atan2(mouse.y - player.y, mouse.x - player.x);

    // Stop updating game logic if paused, dead, or in a menu
    if (!gameStarted || gameOver || isUpgrading) return;

    if (shakeTime > 0) shakeTime--;
    if (comboTimer > 0) { comboTimer--; if (comboTimer <= 0) { combo = 1; updateUI(); } }
    if (autoFireTimer > 0) autoFireTimer--;

    // ============================================
    // --- POWER-UP TIMERS & AUTO-FIRE ---
    // ============================================

    // 1. TWIN-LINK COUNTDOWN TIMER (NEW!)
    if (player.upgrades && player.upgrades.twinLink && player.twinLinkTimer > 0) {
        player.twinLinkTimer--; // Counts down exactly 1 frame at a time
        
        if (player.twinLinkTimer <= 0) {
            player.upgrades.twinLink = false; // Turns off the gun!
            updateUI(); // Refreshes UI to remove the text
            spawnFloatingText(player.x, player.y - 40, "TWIN-LINK DEPLETED!", "#ff003c", 20);
            triggerShake(5); 
        }
    }

    // 2. PIERCE TIMER
    if (player.pierceTimer > 0) { 
        player.pierceTimer--; 
        if (player.pierceTimer === 0) updateUI(); 
    }

    // 3. OVERCLOCK TIMER
   // 3. OVERCLOCK TIMER (Countdown only)
    if (player.overclockTimer > 0) {
        player.overclockTimer--;
        if (player.overclockTimer === 0) updateUI();
    }

    // ============================================
    // --- UNIVERSAL SHOOTING LOGIC (MOBILE & PC) ---
    // ============================================
    if (isMouseDown && mode === 1 && autoFireTimer <= 0) {
        
        // Check if player has Overclock OR has normal ammo left
        if (player.overclockTimer > 0 || playerAmmo > 0) {
            
            // If NOT overclocked, consume 1 ammo
            if (player.overclockTimer <= 0) {
                playerAmmo--;
            }

            // --- SHOOTING LOGIC (Twin-Link Check) ---
            if (player.upgrades && player.upgrades.twinLink) {
                let angle = Math.atan2(mouse.y - player.y, mouse.x - player.x);
                let pAngle = angle + Math.PI/2;
                let ox = Math.cos(pAngle) * 8; let oy = Math.sin(pAngle) * 8;
                shootBullet(player.x + ox, player.y + oy, mouse.x + ox, mouse.y + oy, true, 'standard');
                shootBullet(player.x - ox, player.y - oy, mouse.x - ox, mouse.y - oy, true, 'standard');
            } else {
                shootBullet(player.x, player.y, mouse.x, mouse.y, true, 'standard');
            }
            
            // Fire Rate: Overclock is fast (8 frames), Normal is slower (15 frames)
            autoFireTimer = (player.overclockTimer > 0) ? 8 : 15; 
            updateUI(); 
        }
    }
    // ============================================

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

    // --- ADD THIS: VIRTUAL JOYSTICK MOVEMENT ---
    if (joysticks.left.active) {
        dx += joysticks.left.vX;
        dy += joysticks.left.vY;
    }
    if (dx !== 0 || dy !== 0) {
        const length = Math.hypot(dx, dy); player.x += (dx / length) * player.speed; player.y += (dy / length) * player.speed;
    }
    
    player.x = clamp(player.x, player.radius + 20, canvas.width - player.radius - 20);
    player.y = clamp(player.y, player.radius + 20, canvas.height - player.radius - 20);
    resolveBlockCollisions(player);

    // --- DATA CUBE VACUUM & OVERDRIVE LOOP ---
    for (let i = drops.length - 1; i >= 0; i--) {
        let d = drops[i];
        if (d.type !== 'cube') continue; // Only vacuum data cubes!
        d.life--;
        
        let dx = player.x - d.x; let dy = player.y - d.y;
        let dist = Math.hypot(dx, dy);
        
        // Magnetic Vacuum Effect (Pulls towards player)
       // Magnetic Vacuum Effect
        let vacRadius = player.upgrades.magneticHull ? 450 : 150;
        if (dist < vacRadius) { d.x += (dx / dist) * 12; d.y += (dy / dist) * 12; }

        // Collect the Cube
        if (dist < player.radius + 10) {
            cubeCount++; score += 10;
            spawnFloatingText(d.x, d.y, "+1", "#00f3ff", 15);
            drops.splice(i, 1);

            if (player.upgrades && player.upgrades.deepPockets) {
        playerAmmo += 5; updateUI();
    }
            
            // TRIGGER OVERDRIVE!
            if (cubeCount >= 10 && overdriveTimer <= 0) {
                overdriveTimer = 300; // 5 seconds of God Mode
                cubeCount = 0; triggerShake(30);
                spawnFloatingText(player.x, player.y - 50, "OVERDRIVE!", "#ffd700", 40);
            }
            continue;
        }
        if (d.life <= 0) drops.splice(i, 1);
    }

// --- OVERDRIVE GOD-MODE SHOOTING ---
    if (overdriveTimer > 0) {
        overdriveTimer--;
        playerAmmo = 3; // Keep ammo full
        
        // Check if the player is actually trying to shoot
        let isTryingToShoot = isMouseDown || joysticks.right.active;

        if (isTryingToShoot && frameCount % 10 === 0) { 
            let tx = joysticks.right.active ? player.x + joysticks.right.vX * 100 : mouse.x;
            let ty = joysticks.right.active ? player.y + joysticks.right.vY * 100 : mouse.y;
            let angle = Math.atan2(ty - player.y, tx - player.x);
            
            for(let i = -1; i <= 1; i++) { // 3-Way Spread
                let a = angle + (i * 0.25);
                
                bullets.push({
                    x: player.x, y: player.y, vx: Math.cos(a)*18, vy: Math.sin(a)*18,
                    radius: 12* gameScale, color: '#ffd700', isPlayer: true, 
                    // TRICK: Start at 2. Since max is 3, it bounces exactly ONCE!
                    bounces: 2, 
                    life: 0, maxLife: 100, damage: 3
                });
            }
        }
    }
   // --- WAVE TRANSITION LOGIC ---
    // Start the countdown when all enemies are cleared.
    // NOTE: currentWave is NOT incremented here — applyUpgrade() owns that step.
    if (enemies.length === 0 && waveTransitionTimer <= 0 && gameStarted && !gameOver) {
        waveTransitionTimer = 180;
    }

    // If the timer is ticking down, wait!
// --- WAVE TRANSITION & UPGRADE LOGIC ---
    if (enemies.length === 0 && gameStarted && !gameOver && !isUpgrading) {
        
        // Check if we are at the very beginning of the game (Wave 1 hasn't properly spawned yet)
        // If currentWave is 1 and score is 0, we shouldn't show an upgrade screen!
        if (currentWave === 1 && score === 0) {
            // Do nothing, let the game spawn the first wave normally!
        } else {
            // The wave is officially cleared! Start a 1-second pause before the upgrade menu pops up
            if (waveTransitionTimer <= 0) waveTransitionTimer = 60; 
            
            waveTransitionTimer--;
            
            if (waveTransitionTimer <= 0) {
                showUpgradeScreen(); 
            }
        }
    } else {
        // If enemies are alive, ensure the timer doesn't accidentally trigger the menu!
        waveTransitionTimer = 0; 
    }

// Enemy Logic
    for (let e = enemies.length - 1; e >= 0; e--) {
        let en = enemies[e]; // We define 'en' here so the boss code can see it
        
        // Calculate distance to player for all enemy types
        const exDx = player.x - en.x; 
        const exDy = player.y - en.y; 
        const dist = Math.hypot(exDx, exDy);

if (en.type === 'boss') {
            // Keep your cool rotating attack!
            en.angle = (en.angle || 0) + 0.04; 

            // PHASE 0: ENTERING THE ARENA
            if (en.state === 'entering') {
                en.y += 2;
                if (en.y > 150) { 
                    en.state = 'bullet_hell'; 
                    en.stateTimer = 180; 
                    en.cooldown = 0;
                }
            } 
            // PHASE 1: BULLET HELL
            else if (en.state === 'bullet_hell') {
                en.stateTimer--; // Timer ONLY ticks down while in this phase
                en.cooldown--;
                
                // Drift towards player
                if (dist > 5) { 
                    en.x += (exDx / dist) * (en.speed * 0.8); 
                    en.y += (exDy / dist) * (en.speed * 0.8); 
                }
                
                // Shoot rotating cross pattern
                if (en.cooldown <= 0) {
                    for(let i=0; i<4; i++) {
                        let offset = (Math.PI / 2) * i;
                        shootBullet(en.x, en.y, en.x + Math.cos(en.angle + offset)*100, en.y + Math.sin(en.angle + offset)*100, false, 'standard');
                    }
                    en.cooldown = 18; // Slower fire rate
                }
                
                // Time's up! Switch to Charge
                if (en.stateTimer <= 0) { 
                    en.state = 'dashing'; 
                    en.targetX = player.x; 
                    en.targetY = player.y; 
                    spawnFloatingText(en.x, en.y - 60, "CHARGE!", "#ffcc00", 25);
                }
            } 
            // PHASE 2: DASHING
            else if (en.state === 'dashing') {
                let chargeDx = en.targetX - en.x; 
                let chargeDy = en.targetY - en.y; 
                let chargeDist = Math.hypot(chargeDx, chargeDy);
                
                if (chargeDist > 15) { 
                    en.x += (chargeDx / chargeDist) * 9; 
                    en.y += (chargeDy / chargeDist) * 9; 
                } else {
                    // Dash finished, enter Vulnerable phase
                    en.state = 'vulnerable'; 
                    en.stateTimer = 120; // Sit still for 2 seconds
                    spawnFloatingText(en.x, en.y - 60, "VULNERABLE!", "#00f3ff", 25);
                }
            }
            // PHASE 3: VULNERABLE
            else if (en.state === 'vulnerable') {
                en.stateTimer--; // Timer ONLY ticks down while resting
                
                // Flash to show it's taking double damage
                if (frameCount % 10 === 0) spawnParticles(en.x, en.y, '#00f3ff', 2);
                
                // Rest is over, go back to Bullet Hell
                if (en.stateTimer <= 0) { 
                    en.state = 'bullet_hell'; 
                    en.stateTimer = 180; 
                    en.cooldown = 0;
                }
            }
        }
        else if (en.type === 'brute') {
            en.x += (exDx / dist) * en.speed; en.y += (exDy / dist) * en.speed;
            if (dist < en.radius + player.radius && !player.isDashing) {
                health--; updateUI(); triggerShake(15); triggerHitStop(4);
                spawnFloatingText(player.x, player.y - 30, "-1 ARMOR", "#ff003c", 20);
                en.x -= (exDx / dist) * 100; en.y -= (exDy / dist) * 100;
                if (health <= 0) gameOver = true;
            }
        }
      else if (en.type === 'pinata') {
            en.angle += 0.2; 
            en.escapeTimer--;
            
            // --- NEW: VISUAL TRAIL ---
            // Spawns a gold spark behind it constantly so you can easily track it!
            if (frameCount % 2 === 0) spawnParticles(en.x, en.y, '#ffffff', 1, 2); 

            // Run AWAY from the player
            en.x -= (exDx / dist) * en.speed; 
            en.y -= (exDy / dist) * en.speed;

            // If the timer runs out, it escapes!
            if (en.escapeTimer <= 0) {
                spawnFloatingText(en.x, en.y, "ESCAPED!", "#ffffff", 20);
                spawnParticles(en.x, en.y, '#ffd700', 15, 2);
                enemies.splice(e, 1);
                continue; 
            }
        }
        else if (en.ammo <= 0 && drops.some(d => d.type === 'ammo')) {
            let ammoList = drops.filter(d => d.type === 'ammo');
            let closest = ammoList[0]; let minDist = Math.hypot(en.x - closest.x, en.y - closest.y);
            for (let i = 1; i < ammoList.length; i++) {
                let d = Math.hypot(en.x - ammoList[i].x, en.y - ammoList[i].y);
                if (d < minDist) { minDist = d; closest = ammoList[i]; }
            }
            const dropDx = closest.x - en.x; const dropDy = closest.y - en.y; const dropDist = Math.hypot(dropDx, dropDy);
            if (dropDist > 0) { en.x += (dropDx / dropDist) * en.speed; en.y += (dropDy / dropDist) * en.speed; }
        } 
        else {
            let desiredDist = en.type === 'sniper' ? 350 : 150;
            if (dist > desiredDist) { en.x += (exDx / dist) * en.speed; en.y += (exDy / dist) * en.speed; } 
            else if (dist < desiredDist - 50 && en.type === 'sniper') { en.x -= (exDx / dist) * en.speed; en.y -= (exDy / dist) * en.speed; }
            
            en.cooldown--;
            if (en.overclockTimer > 0) { en.overclockTimer--; en.cooldown--; }
            if (en.pierceTimer > 0) en.pierceTimer--;

           // --- ENEMY TIMERS ---
            en.cooldown--;
            if (en.overclockTimer > 0) { en.overclockTimer--; en.cooldown--; }
            if (en.pierceTimer > 0) en.pierceTimer--;
            
            // --- NEW: ENEMY RELOAD SYSTEM ---
            // If the enemy runs out of ammo, they must reload!
            if (en.ammo <= 0) {
                // Create a reload timer if they don't have one yet
                if (typeof en.reloadTimer === 'undefined') en.reloadTimer = 90; // 1.5 seconds to reload
                
                en.reloadTimer--;
                
                if (en.reloadTimer <= 0) {
                    // Reload complete! Give them more ammo based on the wave level
                    en.ammo = 5 + Math.floor(currentWave / 2); 
                    en.reloadTimer = 90; // Reset timer for next time
                }
            }
            
            // --- ESCALATING BULLET HELL SHOOTING ---
            if (en.cooldown <= 0 && en.ammo > 0 && en.type !== 'pinata') {
                let angleToPlayer = Math.atan2(player.y - en.y, player.x - en.x);
                
                if (en.type === 'brute') {
                    // Brutes fire a 3-way SHOTGUN blast!
                    shootBullet(en.x, en.y, en.x + Math.cos(angleToPlayer)*100, en.y + Math.sin(angleToPlayer)*100, false, 'brute');
                    shootBullet(en.x, en.y, en.x + Math.cos(angleToPlayer - 0.4)*100, en.y + Math.sin(angleToPlayer - 0.4)*100, false, 'brute');
                    shootBullet(en.x, en.y, en.x + Math.cos(angleToPlayer + 0.4)*100, en.y + Math.sin(angleToPlayer + 0.4)*100, false, 'brute');
                } 
                else if (en.type === 'boss') {
                    // Bosses fire an 8-way RING OF DEATH!
                    for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) {
                        shootBullet(en.x, en.y, en.x + Math.cos(a)*100, en.y + Math.sin(a)*100, false, 'boss');
                    }
                    shootBullet(en.x, en.y, en.x + Math.cos(angleToPlayer)*100, en.y + Math.sin(angleToPlayer)*100, false, 'boss');
                } 
                else {
                    // Normal enemies
                    shootBullet(en.x, en.y, en.x + Math.cos(angleToPlayer)*100, en.y + Math.sin(angleToPlayer)*100, false, en.type);
                }

                if (en.pierceTimer > 0) { let b = bullets[bullets.length - 1]; b.piercing = true; b.maxBounces = 3; }
                
                en.ammo--;
                
                // Cooldown gets faster as the waves get higher!
                en.cooldown = Math.max(10, en.fireRate - (currentWave * 2)); 
            }
        }
        
        // Final screen clamping for all enemy types
        en.x = clamp(en.x, en.radius + 20, canvas.width - en.radius - 20);
        en.y = clamp(en.y, en.radius + 20, canvas.height - en.radius - 20);
        resolveBlockCollisions(en);
        
        if (en.flashTimer > 0) en.flashTimer--; // Added this to make flash work
    }

// Bullet Logic 
    for (let i = bullets.length - 1; i >= 0; i--) {
        let b = bullets[i]; b.x += b.vx; b.y += b.vy; b.angle += 0.2; 
        
        // --- FIX: ENEMY VS PLAYER BOUNCE LIMITS ---
        // Player default is 3 (can be overridden by parry to 6). Enemy default is 1.
        let limitBounces = b.maxBounces !== undefined ? b.maxBounces : (b.isPlayer ? 3 : 1);

        // --- NEW: WALL / BLOCK COLLISION FOR BULLETS ---
       if (typeof blocks !== 'undefined' && !b.piercing){
            for (let blk of blocks) {
                if (b.x + b.radius > blk.x && b.x - b.radius < blk.x + blk.width &&
                    b.y + b.radius > blk.y && b.y - b.radius < blk.y + blk.height) {
                    
                    b.bounces++; // Count it as a bounce!
                    
                    if (b.bounces > limitBounces) {
                        b.bounces = 9999; // Mark for instant deletion
                    } else {
                        // Bounce off the wall
                        b.vx *= -1; 
                        b.vy *= -1;
                    }
                }
            }
        }
        
        // Catch bullets that hit their bounce limit on the first block check
        if (b.bounces > limitBounces && !b.piercing) { bullets.splice(i, 1); continue; }

        // Clean up out-of-bounds bullets
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

        // Final bounce limit check after all collisions
        if (b.bounces > limitBounces && !b.piercing) { bullets.splice(i, 1); continue; }

        if (b.isPlayer) {
            let hitEnemy = false;
            for (let e = enemies.length - 1; e >= 0; e--) {
                let en = enemies[e];
                if (Math.hypot(b.x - en.x, b.y - en.y) < b.radius + en.radius) {
                    if (b.piercing && b.hitEntities.includes(en)) continue; 

               // --- 15% RANDOM CRITICAL HIT CHANCE ---
                    let isCrit = Math.random() < 0.15;
                    let damageDealt = isCrit ? b.damage * 3 : b.damage; // Crits do 3x damage!
                    
                    en.health -= damageDealt; 
                    en.flashTimer = isCrit ? 6 : 3; // Longer flash for crits
                    hitEnemy = true;
                    
                    if (isCrit) {
                        spawnFloatingText(en.x, en.y - 35, `CRIT! -${damageDealt}`, '#ff003c', 30);
                        triggerShake(8); // Mini-shake on crit
                        triggerHitStop(2); // Mini-freeze on crit
                        spawnParticles(en.x, en.y, '#ff003c', 15, 3);
                    } else {
                        spawnFloatingText(en.x, en.y - 25, `-${damageDealt}`, '#ffff00', 22);
                    }

                    if (b.piercing) b.hitEntities.push(en);

              if (en.health <= 0) {
                        let pointsGained = 100 * combo;
                        
                        // NEW: BOSS DEATH LOGIC
                        if (en.type === 'boss') {
                            pointsGained = 5000;
                            triggerHitStop(30); 
                            triggerShake(50); 
                            spawnFloatingText(en.x, en.y, "BOSS DEFEATED", "#ffcc00", 40);
                            spawnParticles(en.x, en.y, '#ff003c', 100, 4); 
                            spawnDrop(en.x - 40, en.y, 'overclock');
                            spawnDrop(en.x + 40, en.y, 'heal');
                            spawnDrop(en.x, en.y - 40, 'pierce');
                            spawnDrop(en.x, en.y + 40, 'ammo');
                        } 
                        else if (en.type === 'pinata') {
                            // THE JACKPOT!
                            pointsGained = 5000;
                            triggerHitStop(20); // Massive freeze
                            triggerShake(20); // Massive shake
                            spawnFloatingText(en.x, en.y, "JACKPOT!", "#ffd700", 40);
                            spawnParticles(en.x, en.y, '#ffd700', 80, 4); // Giant gold explosion
                            
                            // Drops 3 random powerups in a triangle
                            let pUps = ['overclock', 'pierce', 'heal'];
                            spawnDrop(en.x - 25, en.y - 15, pUps[Math.floor(Math.random() * pUps.length)]);
                            spawnDrop(en.x + 25, en.y - 15, pUps[Math.floor(Math.random() * pUps.length)]);
                            spawnDrop(en.x, en.y + 25, pUps[Math.floor(Math.random() * pUps.length)]);
                        } else {
                            // Normal enemy death stuff
                            spawnParticles(en.x, en.y, en.color, 25, 1.5); 
                            // ... [Your existing drop logic rand < 0.20 etc] ...
                        }

                        // salvageCore: guaranteed ammo drop on every kill
                        if (getMetaLevel('salvageCore') > 0 && en.type !== 'boss' && en.type !== 'pinata') {
                            spawnDrop(en.x, en.y, 'ammo');
                        }

                        score += pointsGained; combo++; comboTimer = 180; updateUI(); 
                        spawnFloatingText(en.x, en.y - 30, `+${pointsGained}`, '#ffcc00', 20 + Math.min(combo * 2, 20));
                        if (en.type === 'brute') triggerHitStop(5);
                        
                        // --- NEW: STEP 2 - DROP THE OVERDRIVE DATA CUBE ---
                        // This makes EVERY enemy drop a cube when they die
                        drops.push({ x: en.x, y: en.y, life: 600, type: 'cube' });
                        
                        enemies.splice(e, 1);
                    }
                    if (!b.piercing) break; 
                }
            }
            if (hitEnemy && !b.piercing) { bullets.splice(i, 1); continue; }
        }

      if (!b.isPlayer && !player.isDashing) {
            let distToPlayer = Math.hypot(b.x - player.x, b.y - player.y);
            
            // --- NEW: THE GRAZE SYSTEM ---
            if (distToPlayer > player.radius && distToPlayer < player.radius + 25 && !b.grazed) {
                b.grazed = true; // Mark bullet so it only grazes once
                score += 50 * combo;
                comboTimer = 180; // Grazing keeps your combo alive!
                spawnFloatingText(player.x, player.y - 20, "GRAZE +50", "#00f3ff", 14);
                spawnParticles(player.x, player.y, '#00f3ff', 5, 2);
                updateUI();
            }

            // ACTUAL COLLISION
            if (distToPlayer < b.radius + player.radius + (mode === 2 ? 10 : 0)) {
                if (mode === 2) {
                    const angle = Math.atan2(b.y - player.y, b.x - player.x); const speed = Math.hypot(b.vx, b.vy);
                    if (frameCount - player.lastShieldActivation <= 15) {
                        b.color = '#ffd700'; b.vx = Math.cos(angle) * (speed * 1.5); b.vy = Math.sin(angle) * (speed * 1.5); b.damage = 3; b.maxBounces = 6;
                        spawnFloatingText(player.x, player.y - 30, "PERFECT PARRY!", "#ffd700", 25);
                        triggerShake(5);
                    } else { b.vx = Math.cos(angle) * speed; b.vy = Math.sin(angle) * speed; b.color = player.color; }
                    b.isPlayer = true; b.bounces = 0; b.x = player.x + Math.cos(angle) * (player.radius + b.radius + 15); b.y = player.y + Math.sin(angle) * (player.radius + b.radius + 15);
                } else {
                    health--; updateUI(); bullets.splice(i, 1); triggerShake(15);
                    triggerHitStop(4); 
                    spawnFloatingText(player.x, player.y - 30, "-1 ARMOR", "#ff003c", 20); 
                    if (health <= 0) gameOver = true;
                    document.getElementById('joystick-container').style.display = 'none';
                }
            }
        }
    }

// Drops Ticking & Collision
    dropSpawnTimer--;
    if (dropSpawnTimer <= 0 && drops.length < 5) {
        let safePos = getSafeSpawn(15); 
        let rand = Math.random();
        let type = 'ammo';
        if (rand < 0.15) type = 'overclock';
        else if (rand < 0.30) type = 'pierce';
        else if (rand < 0.45) type = 'heal';
        
        spawnDrop(safePos.x, safePos.y, type); 
        dropSpawnTimer = 60; // Spawns twice as fast now!
    }

    for (let i = drops.length - 1; i >= 0; i--) {
        let drop = drops[i]; drop.angle += 0.05; 
        
        // PLAYER PICKING UP DROPS
        if (Math.hypot(player.x - drop.x, player.y - drop.y) < player.radius + drop.radius) {
            if (drop.type === 'ammo') { 
                playerAmmo += 2; 
            } else if (drop.type === 'overclock') { 
                player.overclockTimer = 300; spawnParticles(player.x, player.y, '#ff003c', 30, 2); 
            } else if (drop.type === 'pierce') { 
                player.pierceTimer = 300; spawnParticles(player.x, player.y, '#aa00ff', 30, 2); 
            } else if (drop.type === 'heal') { 
                health = Math.min(health + 1, 5); spawnParticles(player.x, player.y, '#00ff66', 30, 2); // NEW: Heal Logic!
            }
            updateUI(); drops.splice(i, 1); continue;
        }
        
     // ENEMY PICKING UP DROPS (Stealing!)
        let enemyPickedUp = false;
        for (let e = 0; e < enemies.length; e++) {
            if (Math.hypot(enemies[e].x - drop.x, enemies[e].y - drop.y) < enemies[e].radius + drop.radius) {
                if (drop.type === 'ammo') { 
                    enemies[e].ammo = enemies[e].maxAmmo; 
                } else if (drop.type === 'overclock') { 
                    enemies[e].overclockTimer = 300; spawnParticles(enemies[e].x, enemies[e].y, '#ff003c', 30, 2); 
                } else if (drop.type === 'pierce') { 
                    enemies[e].pierceTimer = 300; spawnParticles(enemies[e].x, enemies[e].y, '#aa00ff', 30, 2); 
                } else if (drop.type === 'heal') { 
                    enemies[e].health = Math.min(enemies[e].health + 2, enemies[e].maxHealth); spawnParticles(enemies[e].x, enemies[e].y, '#00ff66', 30, 2); 
                }
                enemyPickedUp = true;
                break;
            }
        }
        if (enemyPickedUp) { drops.splice(i, 1); continue; }
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
// --- DRAW POWERUPS ---
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
        } else if (drop.type === 'heal') { // NEW: Healing Drop Visual (A Plus Sign)
            ctx.moveTo(-drop.radius + 5, 0); ctx.lineTo(drop.radius - 5, 0);
            ctx.moveTo(0, -drop.radius + 5); ctx.lineTo(0, drop.radius - 5);
            ctx.stroke();
            ctx.beginPath(); ctx.rect(-drop.radius, -drop.radius, drop.radius * 2, drop.radius * 2); ctx.stroke();
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

    // Draw Data Cubes
    drops.forEach(d => {
        if (d.type === 'cube') {
            // Flash between Cyan and White
            ctx.fillStyle = (frameCount % 10 < 5) ? '#00f3ff' : '#fff'; 
            ctx.shadowBlur = 15; ctx.shadowColor = '#00f3ff';
            ctx.beginPath();
            ctx.arc(d.x, d.y, 6, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0; // Reset
        }
    });

  enemies.forEach(en => {
        // --- 1. DRAW ENEMY BODY ---
        if (en.type === 'boss') {
            let distToPlayer = Math.hypot(player.x - en.x, player.y - en.y);
        if (distToPlayer < player.radius + en.radius) {
            if (player.isDashing && player.upgrades.vampiricDash && !en.drained) {
                en.drained = true; // Can only steal from each enemy once per dash
                health++; updateUI();
                spawnFloatingText(player.x, player.y, "+1 HP", "#ff003c", 20);
                triggerShake(5);
            }
        }
            // Draw a spinning spiked hexagon
            ctx.save(); ctx.translate(en.x, en.y); ctx.rotate(en.angle);
            
            // Make the boss flash white when hit!
            let drawColor = en.flashTimer > 0 ? '#ffffff' : en.color;
            ctx.strokeStyle = drawColor; ctx.lineWidth = 4; ctx.shadowBlur = 20; ctx.shadowColor = drawColor;
            
            ctx.beginPath();
            for (let i = 0; i < 6; i++) {
                ctx.lineTo(en.radius * Math.cos(i * Math.PI / 3), en.radius * Math.sin(i * Math.PI / 3));
            }
            ctx.closePath(); ctx.stroke();
            
            // Inner core
            ctx.beginPath(); ctx.arc(0, 0, en.radius / 2, 0, Math.PI * 2); ctx.stroke();
            ctx.restore();
        } 
    else if (en.type === 'pinata') {
            // Draw a spinning gold diamond
            ctx.save(); ctx.translate(en.x, en.y); ctx.rotate(en.angle);
            let drawColor = en.flashTimer > 0 ? '#ffffff' : '#ffd700';
            ctx.fillStyle = drawColor;
            ctx.shadowBlur = 25; ctx.shadowColor = drawColor;
            
            ctx.beginPath();
            ctx.moveTo(0, -en.radius); ctx.lineTo(en.radius, 0); ctx.lineTo(0, en.radius); ctx.lineTo(-en.radius, 0);
            ctx.closePath(); ctx.fill();
            ctx.restore();
            
            // Draw Escape Timer above its head
            ctx.fillStyle = '#ffd700'; ctx.font = 'bold 12px Orbitron'; ctx.textAlign = 'center';
            ctx.fillText("ESCAPING...", en.x, en.y - 55);
            drawSlickHealthBar(ctx, en.x, en.y - 45, Math.ceil((en.escapeTimer / 600) * 5), 5, '#ffd700');
        }
        else {
            // Draw all normal enemies (standard, sniper, brute)
            if (en.flashTimer > 0) {
                drawGlowCircle(en.x, en.y, en.radius, '#ffffff'); 
            } else {
                drawGlowCircle(en.x, en.y, en.radius, en.color);
            }
        }

        // --- 2. DRAW SMALL HEALTH BARS & AMMO TEXT ---
        // (We skip this for the boss so it doesn't have two health bars)
        if (en.type !== 'boss') {
            drawSlickHealthBar(ctx, en.x, en.y - 45, Math.max(0, en.health), en.maxHealth, en.color);
            if (en.ammo <= 0 && en.type !== 'brute') {
                ctx.fillStyle = '#ffcc00'; ctx.font = '12px Orbitron, sans-serif'; ctx.textAlign = 'center';
                ctx.fillText("SEEKING AMMO", en.x, en.y - 50);
            }
        }

        // Prevent enemies from getting stuck on walls!
        if (typeof resolveBlockCollisions === 'function') resolveBlockCollisions(en);
    });

    // --- RESTORE FROM SHAKE BEFORE DRAWING UI ---
    ctx.restore();

// --- DRAW FLOATING COMBAT TEXT ---
    floatingTexts.forEach(ft => {
        ctx.save();
        ctx.globalAlpha = Math.max(0, ft.life);
        
        ctx.font = `bold ${ft.size}px Orbitron, sans-serif`;
        ctx.textAlign = 'center';
        
        // 1. Draw a thick black outline first so it separates from the glowing background
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#000000';
        ctx.strokeText(ft.text, ft.x, ft.y);

        // 2. Draw the bright neon text on top
        ctx.fillStyle = ft.color;
        ctx.shadowBlur = 10;
        ctx.shadowColor = ft.color;
        ctx.fillText(ft.text, ft.x, ft.y);
        
        ctx.restore();
    });
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

    // --- WAVE TRANSITION TEXT ---
    if (waveTransitionTimer > 0 && !gameOver) {
        // Math.sin creates a smooth pulsating/flashing effect
        ctx.globalAlpha = Math.abs(Math.sin(frameCount / 10)); 
        
        ctx.fillStyle = '#00f3ff'; 
        ctx.font = 'bold 60px Orbitron, sans-serif'; 
        ctx.textAlign = 'center';
        ctx.shadowBlur = 20; 
        ctx.shadowColor = '#00f3ff';
        
        ctx.fillText(`WAVE ${currentWave} INBOUND`, canvas.width / 2, canvas.height / 2);
        
        // Subtext timer
        ctx.font = '20px Orbitron, sans-serif';
        ctx.fillText(`PREPARE YOURSELF: ${Math.ceil(waveTransitionTimer / 60)}`, canvas.width / 2, canvas.height / 2 + 50);
        
        ctx.globalAlpha = 1.0; 
        ctx.shadowBlur = 0; // Reset
    }

   if (gameOver) {

    // 1. SAVE HIGH SCORE (Logic)
        if (score > highScore) {
            highScore = score;
            // Update the display on the main menu immediately for next time
            document.getElementById('bestScoreDisplay').innerText = highScore;
        }
        ctx.fillStyle = 'rgba(0,0,0,0.8)'; ctx.fillRect(0,0, canvas.width, canvas.height);
        
        ctx.fillStyle = '#ff003c'; ctx.font = '50px Orbitron, sans-serif'; ctx.textAlign = 'center';
        ctx.fillText("SYSTEM FAILURE. GAME OVER.", canvas.width / 2, canvas.height / 2);
        
        ctx.fillStyle = '#fff'; ctx.font = '25px Orbitron, sans-serif';
        ctx.fillText(`SURVIVED TO WAVE: ${currentWave} | FINAL SCORE: ${score}`, canvas.width / 2, canvas.height / 2 + 50);

        // NEW: Blinking restart text
        ctx.globalAlpha = Math.abs(Math.sin(Date.now() / 300)); // Makes the text blink
        ctx.fillStyle = '#00f3ff'; ctx.font = '20px Orbitron, sans-serif';
        ctx.fillText("> CLICK ANYWHERE TO REBOOT <", canvas.width / 2, canvas.height / 2 + 100);
        ctx.globalAlpha = 1.0; // Reset alpha
    }
    // --- BOSS HEALTH BAR UI ---
    let boss = enemies.find(e => e.type === 'boss');
    if (boss && !gameOver) {
        let barWidth = 600;
        let barX = (canvas.width / 2) - (barWidth / 2);
        
        // Background Bar
        ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.fillRect(barX, 20, barWidth, 20);
        
        // Red Health Fill
        ctx.fillStyle = '#ff003c';
        ctx.shadowBlur = 15; ctx.shadowColor = '#ff003c';
        ctx.fillRect(barX, 20, barWidth * (Math.max(boss.health, 0) / boss.maxHealth), 20);
        ctx.shadowBlur = 0; // Reset shadow
        
        // White Outline
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
        ctx.strokeRect(barX, 20, barWidth, 20);
        
        // Boss Name
        ctx.fillStyle = '#fff'; ctx.font = 'bold 20px Orbitron'; ctx.textAlign = 'center';
        ctx.fillText("DREADNOUGHT", canvas.width / 2, 15);
    }
}
function gameLoop() {
    update(); draw(); requestAnimationFrame(gameLoop);
}

window.addEventListener('resize', () => {
    canvas.width = window.innerWidth; canvas.height = window.innerHeight;
    stars = Array.from({ length: 150 }, () => ({ x: Math.random() * canvas.width, y: Math.random() * canvas.height, speed: Math.random() * 4 + 1, size: Math.random() * 2 }));
});

// --- ROGUELITE UPGRADE SYSTEM ---
const upgradePool = [
    { id: 'twinLink', title: 'TWIN LINK', desc: 'Permanently fire two parallel shots.', color: '#00f3ff' },
    { id: 'magneticHull', title: 'MAGNETIC HULL', desc: 'Data Cube vacuum radius increased by 300%.', color: '#ff00ea' },
    { id: 'vampiricDash', title: 'VAMPIRIC DASH', desc: 'Dashing through enemies steals 1 HP.', color: '#ff003c' },
    { id: 'hyperThrusters', title: 'HYPER THRUSTERS', desc: 'Base movement speed increased by 20%.', color: '#39ff14' },
    { id: 'maxArmor', title: 'TITANIUM PLATING', desc: 'Max armor increased. Heals you to full.', color: '#ffd700' },
    { id: 'ricochet', title: 'RICOCHET ROUNDS', desc: 'Bullets bounce off walls 2 extra times.', color: '#00ff66' },
    { id: 'heavyCaliber', title: 'HEAVY CALIBER', desc: 'Bullets deal double damage.', color: '#ff003c' },
    { id: 'deepPockets', title: 'DEEP POCKETS', desc: 'You gain +5 ammo every time you grab a cube.', color: '#ffcc00' }
];

function showUpgradeScreen() {
    isUpgrading = true;
    const container = document.getElementById('upgradeContainer');
    container.innerHTML = '';
    
    // Pick 3 random unique upgrades
    let shuffled = upgradePool.sort(() => 0.5 - Math.random());
    let choices = shuffled.slice(0, 3);
    
    choices.forEach(upg => {
        let card = document.createElement('div');
        card.className = 'upgrade-card';
        card.style.borderColor = upg.color;
        card.innerHTML = `<div class="upgrade-title" style="color: ${upg.color}">${upg.title}</div><div class="upgrade-desc">${upg.desc}</div>`;
        card.onclick = () => applyUpgrade(upg.id);
        container.appendChild(card);
    });
    
    document.getElementById('upgradeScreen').style.display = 'flex';
}

function applyUpgrade(id) {
 if (id === 'twinLink') { 
        player.upgrades.twinLink = true; 
        
        // If they already have it, ADD 30 seconds. Otherwise, start at 30 seconds.
        if (player.twinLinkTimer > 0) {
            player.twinLinkTimer += 1800; // Adds another 30s!
            spawnFloatingText(player.x, player.y - 40, "+30s TWIN-LINK!", "#00f3ff", 20);
        } else {
            player.twinLinkTimer = 1800; 
        }
    }
    if (id === 'magneticHull') player.upgrades.magneticHull = true;
    if (id === 'vampiricDash') player.upgrades.vampiricDash = true;
    if (id === 'ricochet') player.upgrades.ricochet = true;
    if (id === 'heavyCaliber') player.upgrades.heavyCaliber = true;
    if (id === 'deepPockets') player.upgrades.deepPockets = true;
    if (id === 'hyperThrusters') player.speed *= 1.2;
    if (id === 'maxArmor') { health = 10; updateUI(); } // Assuming max health is roughly 10
    
    triggerShake(20);
    document.getElementById('upgradeScreen').style.display = 'none';
    isUpgrading = false;
    
    // Proceed to next wave!
    currentWave++;

    // nanoRepair: restore 1 HP every 5 waves
    if (getMetaLevel('nanoRepair') > 0 && currentWave % 5 === 0) {
        const maxHP = 5 + getMetaLevel('hullPlating');
        if (health < maxHP) {
            health = Math.min(health + 1, maxHP);
            updateUI();
            spawnFloatingText(player.x, player.y - 50, 'NANO REPAIR +1 HP', '#39ff14', 18);
        }
    }

    startWave();
}

generateBlocks();
loadMetaProgress(); // Load persistent credits & upgrades
gameLoop();
