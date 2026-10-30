const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const os = require('os');
const fs = require('fs');
const logger = require('./game-logger').createGameLogger(process.env.KR_LOG_FILE || path.join(__dirname, 'logs', 'game.log'));
logger.captureConsole();
logger.captureProcess();
logger.write('info', 'server.start', 'Starting server', { node: process.version, cwd: process.cwd() });
let diagnosticCommand = null;
let connectionSequence = 0;
let commandSequence = 0;

// ПОДКЛЮЧАЕМ НАШУ ЕДИНУЮ БАЗУ ДАННЫХ GAME_DATA
const GAME_DATA = require('./public/gamedata.js');
const TOWER_RULES = require('./public/tower-rules.js');
const BATTLE_ABILITY_RULES = require('./public/battle-ability-rules.js');
const MASTER_CONTROLS = require('./master-controls');
const ACTIVATED_EVENT_RULES = require('./public/activated-event-rules');
Object.assign(MASTER_CONTROLS.labels, { MASTER_ACTIVATE_EVENT: 'Activate event', MASTER_FINISH_EVENT: 'Finish event' });
const TOWER_CATALOG_DATA = require('./public/tower-catalog-data.js');
const BALANCE = require('./balance');
if (!process.env.NODE_TEST_CONTEXT) {
    Object.assign(GAME_DATA.towers, TOWER_CATALOG_DATA.TOWERS);
}

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const DEFAULT_GRID_W = 16;
const DEFAULT_GRID_H = 16;
const SAVE_FILE = process.env.KR_SAVE_FILE || path.join(__dirname, 'gamestate_save.json');
const PORT = process.env.PORT === undefined ? 3000 : Number(process.env.PORT);
const CATALOG_FILE = process.env.KR_CATALOG_FILE || path.join(path.dirname(SAVE_FILE), 'gamecatalog.json');
const catalogStore = require('./game-catalog').createCatalogStore(GAME_DATA, CATALOG_FILE);
const SCENES_FILE = process.env.KR_SCENES_FILE || path.join(path.dirname(SAVE_FILE), 'scenes.json');
const SCENES = require('./scene-library');
const sceneStore = SCENES.createSceneStore(GAME_DATA, SCENES_FILE);
const sceneEditors = new Set();
function sendSceneLibrary(ws, reason = 'loaded') {
    if (ws?.readyState !== WebSocket.OPEN) return;
    const library = sceneStore.read();
    if (!sceneEditors.has(ws)) library.scenes = library.scenes.map(({id,title,kind,gridWidth,gridHeight}) => ({id,title,kind,gridWidth,gridHeight}));
    ws.send(JSON.stringify({type:'SCENE_LIBRARY',reason,...library}));
}
function broadcastSceneLibrary(sender) {
    for (const ws of new Set([clients.master,...sceneEditors])) sendSceneLibrary(ws,ws === sender ? 'saved' : 'updated');
}
const catalogEditors = new Set();
function sendCatalog(ws, reason = 'loaded') {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({type:'CATALOG_STATE',reason,...catalogStore.read()}));
}
function broadcastCatalog() {
    const update = JSON.stringify({type:'CATALOG_UPDATE',...catalogStore.read()});
    const recipients = new Set([clients.master,...Object.values(clients.players),...sceneEditors]);
    for (const ws of recipients) if (ws?.readyState === WebSocket.OPEN) ws.send(update);
}

let gameState = {
    gold: 300,
    wave: 1,
    phase: 'player', // 'player' (фаза игроков) или 'wave' (фаза волны)
    gamePeriod: 'preparation', // Период партии; переключается только мастером.
    availableTowerTypes: TOWER_RULES.getBaseTypes(GAME_DATA.towers).slice(0, TOWER_RULES.maxTypes),
    baseHp: 20, 
    gridWidth: DEFAULT_GRID_W,
    gridHeight: DEFAULT_GRID_H,
    grid: Array.from({ length: DEFAULT_GRID_H }, (_, y) => 
        Array.from({ length: DEFAULT_GRID_W }, (_, x) => ({ x, y, type: 'empty' }))
    ),
    players: {},
    enemies: [],
    pendingSpawns: [],
    activeEvents: [],
    mines: [],
    napalmPuddles: [],
    poisonPuddles: [],
    soldiers: [],
    demolishVote: null,
    rosterVote: null,
    actionLogs: [],
    debugLogs: []
};

function loadGameState() {
    try {
        if (fs.existsSync(SAVE_FILE)) {
            const raw = fs.readFileSync(SAVE_FILE, 'utf8');
            const loaded = JSON.parse(raw);
            if (loaded && loaded.grid && loaded.players) {
                gameState = { ...gameState, ...loaded };
                // В старых сохранениях уже шла обычная игра.
                gameState.gamePeriod = loaded.gamePeriod === 'preparation' ? 'preparation' : 'game';
                gameState.availableTowerTypes = TOWER_RULES.getSelectedTypes(loaded, GAME_DATA.towers);
                for (const row of gameState.grid) for (const cell of row) {
                    if (GAME_DATA.towers[cell.type]) cell.investedGold = getTowerInvestment(cell);
                }
                if (!gameState.soldiers) gameState.soldiers = [];
                if (!gameState.debugLogs) gameState.debugLogs = [];
                gameState.demolishVote = null;
                gameState.rosterVote = null;
                gameState.gridHeight = gameState.grid.length;
                gameState.gridWidth = gameState.grid[0] ? gameState.grid[0].length : DEFAULT_GRID_W;
                Object.values(gameState.players).forEach(p => {
                    if (p.isReady === undefined) p.isReady = false;
                    if (p.hp <= 0 && !(p.deathTimer > 0)) p.deathTimer = 2;
                    refreshHeroBlocks(p);
                });
                console.log(`💾 World save loaded successfully (${gameState.gridWidth}x${gameState.gridHeight})`);
            }
        }
    } catch (err) {
        console.error('Error loading save ' + SAVE_FILE + ':', err);
    }
}
loadGameState();
// Отмена вмешательства действует только в текущем запуске сервера.
delete gameState.masterUndo;

const combatEvents = require('./combat-events')(() => gameState);
let combatResetPending = false;
function setCombatHp(unit, hp) { combatEvents.setHp(unit, hp); }

const mobTraits = require('./enemy-traits-engine')({
    getState: () => gameState, getData: () => GAME_DATA, createEnemy,
    setHp: setCombatHp,
    damageDefender: applyIncomingDamage, deathDefender: applyDeathOrSurvival,
    log: message => logAction(Date.now(),message)
});
gameState.enemies.forEach(enemy => mobTraits.ensure(enemy));

let saveDebounceTimer = null;
function saveGameState() {
    clearTimeout(saveDebounceTimer);
    saveDebounceTimer = setTimeout(() => {
        try {
            fs.writeFileSync(SAVE_FILE, JSON.stringify(gameState, null, 2), 'utf8');
        } catch (e) {
            console.error('Error saving game ' + SAVE_FILE + ':', e);
        }
    }, 500);
}

let clients = { master: null, players: {} };
let processingCommand = false;
let pendingStateBroadcast = false;

// Снимки хранятся только в памяти. После изменения мира мастером начинается новая история.
let playerHistory = [];
let historySequence = 0;
const PLAYER_COMMANDS = new Set(['MOVE_HERO', 'PLAYER_ACTION', 'BUILD_TOWER',
    'UPGRADE_TOWER', 'BUY_TOWER_UPGRADE', 'SET_RALLY_POINT', 'REQUEST_DEMOLISH',
    'VOTE_DEMOLISH', 'CANCEL_DEMOLISH', 'TOGGLE_READY', 'END_TURN', 'SET_TOWER_TYPE']);
const ACTION_NAMES = { MOVE_HERO: 'Movement', PLAYER_ACTION: 'Ability / attack',
    BUILD_TOWER: 'Construction', UPGRADE_TOWER: 'Upgrade tower', BUY_TOWER_UPGRADE: 'Purchase upgrade',
    SET_RALLY_POINT: 'Rally point', REQUEST_DEMOLISH: 'Demolition request', VOTE_DEMOLISH: 'Vote',
    CANCEL_DEMOLISH: 'Cancel demolition', TOGGLE_READY: 'Ready', END_TURN: 'Ready', SET_TOWER_TYPE: 'Team tower roster' };
function worldSignature(state) {
    const { actionLogs, debugLogs, masterUndo, ...world } = state;
    return JSON.stringify(world);
}
function diagnosticLog(level, source, message, data = null) {
    logger.write(level, source, message, { command: diagnosticCommand, state: {
        wave: gameState.wave, round: gameState.roundCounter || 0, phase: gameState.phase,
        gamePeriod: gameState.gamePeriod, gold: gameState.gold, baseHp: gameState.baseHp,
        players: Object.keys(gameState.players).length, enemies: gameState.enemies.length
    }, details: data });
}
function sendError(ws, message, error = null) {
    if (diagnosticCommand && diagnosticCommand.status !== 'error') diagnosticCommand.status = 'rejected';
    diagnosticLog('warn', 'command.rejected', message, { client: ws.diagnostics, error });
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'COMMAND_ERROR', message }));
}

function logAction(id, text, undoData = null) {
    diagnosticLog('info', 'game.action', text, { actionId: id });
    gameState.actionLogs.unshift({ id, text, undoData });
    if (gameState.actionLogs.length > 40) gameState.actionLogs.pop();
}

function logDebug(category, message, dataObj = null) {
    diagnosticLog('debug', 'game.' + category, message, dataObj);
    if (!gameState.debugLogs) gameState.debugLogs = [];
    let timeStr = new Date().toLocaleTimeString();
    let text = `[${timeStr}] [${category}] ${message}`;
    if (dataObj) {
        try {
            text += ` | ` + (typeof dataObj === 'string' ? dataObj : JSON.stringify(dataObj));
        } catch (e) {
            text += ` | [Data serialization error]`;
        }
    }
    gameState.debugLogs.push(text);
    if (gameState.debugLogs.length > 200) {
        gameState.debugLogs.shift();
    }
}

function broadcastState() {
    // Обработчик команды синхронный: отправляем только окончательное состояние с актуальной историей.
    if (processingCommand) { pendingStateBroadcast = true; return; }
    const events = combatEvents.drain();
    const combatReset = combatResetPending;
    combatResetPending = false;
    saveGameState();
    const { sceneMaster, adventureMaster, actionLogs, masterUndo, ...publicState } = gameState;
    const publicLog = actionLogs.map(({id,text}) => ({id,text}));
    const data = JSON.stringify({ type: 'STATE_UPDATE', combatEvents: events, combatReset, state: { ...publicState, actionLogs:publicLog,
        sceneTitle:sceneMaster?.title || '', revealedNotes:SCENES.publicSceneNotes(sceneMaster), sceneProgress:sceneDirector.publicView(), log:publicLog } });
    if (clients.master && clients.master.readyState === WebSocket.OPEN) {
        clients.master.send(JSON.stringify({ type: 'STATE_UPDATE', combatEvents: events, combatReset,
            state: { ...gameState, masterUndo: masterUndo ? { id: masterUndo.id, label: masterUndo.label } : null, log: gameState.actionLogs.map(l => ({ id: l.id, text: l.text,
                canUndo: !!l.undoData })),
                playerHistory: playerHistory.map(({ snapshot, bytes, ...entry }) => entry) } }));
    }
    Object.values(clients.players).forEach(ws => {
        if (ws.readyState === WebSocket.OPEN) ws.send(data);
    });
}

function getModifier(score) {
    return Math.floor((score - 10) / 2);
}

// Все атаки по защитникам используют один порядок: иммунитет, броня, барьер, ХП.
function applyIncomingDamage(target, rawDamage, { attacker = null, melee = false, damageType = null } = {}) {
    if (target.invulnerableRounds > 0 || target.hp <= 0) return 0;
    if (melee && target.parryRounds > 0 && attacker) {
        target.parryRounds = 0;
        const counter = Math.max(1, Math.round((target.parryDamage || 1) * (100 - Math.min(100, (attacker.armor || 0) + ACTIVATED_EVENT_RULES.auraBonus(gameState, attacker, 'armor'))) / 100));
        mobTraits.damage(attacker,counter);
        target.parryDamage = 0;
        logAction(Date.now(), `⚔️ PARRY: ${target.heroName} parried the attack from [${attacker.name}] and dealt ${counter} physical damage!`);
        if (attacker.hp <= 0) {
            gameState.gold += attacker.reward || 0;
            removeDeadEnemies();
        }
        return 0;
    }
    let damage = Math.max(0, attacker ? mobTraits.attackDamage(attacker,rawDamage) : rawDamage);
    if (target.heroKey === 'torghar' && (target.skills || []).includes('flat_reduction')) damage = Math.max(0, damage - 3);
    const armor = damageType === 'pure' ? 0 : damageType === 'magic' ? Math.min(100, Math.max(0, target.magicRes || 0)) :
        Math.min(100, Math.max(target.armor || 0, target.heroKey === 'gerald' ? 30 : 0));
    damage = Math.max(0, Math.round(damage * (100 - armor) / 100));
    if (melee && attacker && target.retributionShield > 0) {
        const reflected = Math.min(damage, target.retributionShield);
        target.retributionShield -= reflected;
        damage -= reflected;
        mobTraits.damage(attacker,reflected);
        if (attacker.hp <= 0) {
            gameState.gold += attacker.reward || 0;
            removeDeadEnemies();
            damage = 0;
        }
    }
    const absorbed = Math.min(damage, Math.max(0, target.shieldHp || 0));
    if (absorbed) {
        target.shieldHp -= absorbed;
        damage -= absorbed;
        logAction(Date.now(), `🛡️ BARRIER: Shield absorbed ${absorbed} damage for ${target.heroName || target.name || 'soldier'}!`);
    }
    setCombatHp(target, Math.max(0, target.hp - damage));
    return damage;
}

function clearTowerCell(cell, type = 'slot') {
    gameState.soldiers = (gameState.soldiers || []).filter(s => s.towerKey !== `${cell.x},${cell.y}`);
    for (const key of Object.keys(cell)) if (key !== 'x' && key !== 'y') delete cell[key];
    cell.type = type;
}

function getTowerInvestment(cell) {
    if (Number.isFinite(cell.investedGold) && cell.investedGold >= 0) return cell.investedGold;
    // Старые сохранения и башни, установленные мастером: цена всей цепочки развития.
    let total = 0, type = cell.type;
    const visited = new Set();
    while (GAME_DATA.towers[type] && !visited.has(type)) {
        visited.add(type);
        total += GAME_DATA.towers[type].cost || 0;
        type = Object.keys(GAME_DATA.towers).find(key => {
            const next = GAME_DATA.towers[key].next;
            return Array.isArray(next) ? next.includes(type) : next === type;
        });
    }
    for (const upgrade of GAME_DATA.towers[cell.type]?.upgrades || []) {
        if ((cell.upgrades || []).includes(upgrade.id)) total += upgrade.cost || 0;
    }
    return total;
}

function getTowerRefund(cell) {
    return gameState.gamePeriod === 'preparation' ? getTowerInvestment(cell) :
        Math.round((GAME_DATA.towers[cell.type].cost || 70) * BALANCE.tower.refundRatio);
}

function isTowerTypeAvailable(type) {
    return gameState.availableTowerTypes.includes(TOWER_RULES.getFamily(GAME_DATA.towers, type));
}

function restorePreparationHero(player) {
    delete player.frostSlowUntilRound;
    delete player.disengaged;
    player.hp = player.maxHp;
    player.mana = player.maxMana;
    player.deathTimer = 0;
    player.cooldowns = {};
    player.hasMovedThisRound = false;
    player.hasAttackedThisRound = false;
    player.isReady = false;
    player.fatedUsedThisWave = false;
    player.bolinShotCount = 0;
    if (player.grailConsumed) {
        if (!player.skills.includes('grail')) player.skills.push('grail');
        player.grailConsumed = false;
    }
}

let enemySequence = Math.max(Date.now(),...gameState.enemies.map(enemy => Number.isSafeInteger(enemy.id) ? enemy.id : 0));
function createEnemy(type, x, y) {
    const proto = GAME_DATA.enemies[type];
    const enemy = { ...proto, traits: JSON.parse(JSON.stringify(proto.traits || {})), id: enemySequence = Math.max(Date.now(), enemySequence + 1), type, x, y,
        maxHp: proto.hp, baseSpeed: proto.baseSpeed || proto.speed || 1,
        meleeDmg: proto.meleeDmg || 3, rangedDmg: proto.rangedDmg || 6, range: proto.range || 4,
        livesTaken: proto.livesTaken || 1, stunTurns: 0, slowTurns: 0, bleedTurns: 0, bleedDmg: 0 };
    mobTraits.ensure(enemy);
    return enemy;
}

function resetWaveBonuses() {
    for (const soldier of gameState.soldiers || []) {
        if (soldier.towerType === 'barracks_barbarians') soldier.dmg = GAME_DATA.towers.barracks_barbarians.soldierDmg;
    }
}

function spawnPendingEnemies() {
    const pending = gameState.pendingSpawns || [];
    for (const entry of pending) {
        if (entry.round <= gameState.roundCounter) gameState.enemies.push(createEnemy(entry.type, entry.x, entry.y));
    }
    gameState.pendingSpawns = pending.filter(entry => entry.round > gameState.roundCounter);
}

function triggerMinesAt(x, y) {
    const mines = (gameState.mines || []).filter(mine => mine.x === x && mine.y === y);
    if (!mines.length || !gameState.enemies.some(e => e.hp > 0 && !e.isFlying && e.x === x && e.y === y)) return;
    gameState.mines = gameState.mines.filter(mine => !mines.includes(mine));
    for (const mine of mines) {
        for (const enemy of gameState.enemies.filter(e => e.hp > 0 && !e.isFlying && e.x === x && e.y === y)) {
            const damage = Math.max(1, Math.round(mine.damage * (100 - Math.min(100, (enemy.armor || 0) + ACTIVATED_EVENT_RULES.auraBonus(gameState, enemy, 'armor'))) / 100));
            mobTraits.damage(enemy,damage);
            logAction(Date.now(), `💣 MINE: [${enemy.name}] took ${damage} physical damage at (${x}, ${y})!`);
            if (enemy.hp <= 0) gameState.gold += enemy.reward || 0;
        }
    }
    removeDeadEnemies();
}

function resolveCastleArrival(enemy) {
    if (enemy.eventKind) return false;
    if (enemy.hp <= 0 || gameState.grid[enemy.y]?.[enemy.x]?.type !== 'castle') return false;
    const old = gameState.baseHp;
    const penalty = enemy.livesTaken || 1;
    gameState.baseHp = Math.max(0, old - penalty);
    enemy.hp = 0;
    enemy.escapedToCastle = true;
    logAction(Date.now(), `💥 ${enemy.name} breached the Castle (-${penalty} lives)! Base health: ${gameState.baseHp}`, { type: 'baseHp', old });
    return true;
}

// АВТОМАТИКА KINGDOM RUSH: Враги двигаются строго по рельсам дороги (крестом без диагоналей), чтобы не срезать углы!
function findShortestPath(startX, startY, targetType) {
    let queue = [ [{ x: startX, y: startY }] ];
    let visited = new Set([`${startX},${startY}`]);

    while (queue.length > 0) {
        let path = queue.shift();
        let cell = path[path.length - 1];
        if (gameState.grid[cell.y][cell.x].type === targetType) return path;

        // Строго 4 направления перемещения для мобов (вверх, вниз, влево, вправо)
        let neighbors = [
            { x: cell.x, y: cell.y - 1 }, { x: cell.x, y: cell.y + 1 },
            { x: cell.x - 1, y: cell.y }, { x: cell.x + 1, y: cell.y }
        ];

        let gw = gameState.gridWidth || 16;
        let gh = gameState.gridHeight || 16;
        for (let n of neighbors) {
            if (n.x >= 0 && n.x < gw && n.y >= 0 && n.y < gh) {
                let cellType = gameState.grid[n.y][n.x].type;
                let key = `${n.x},${n.y}`;
                if (!visited.has(key) && (cellType === 'road' || cellType === 'castle' || cellType === 'spawn')) {
                    visited.add(key);
                    queue.push([...path, n]);
                }
            }
        }
    }
    return null;
}

// Поиск ближайшей клетки дороги в радиусе башни (для точки сбора солдат казармы)
function findNearestRoadCell(startX, startY, maxRange) {
    let gw = gameState.gridWidth || 16;
    let gh = gameState.gridHeight || 16;
    let bestCell = null;
    let bestDist = Infinity;

    for (let dy = -maxRange; dy <= maxRange; dy++) {
        for (let dx = -maxRange; dx <= maxRange; dx++) {
            let x = startX + dx;
            let y = startY + dy;
            if (x >= 0 && x < gw && y >= 0 && y < gh) {
                let cell = gameState.grid[y][x];
                if (cell && (cell.type === 'road' || cell.type === 'spawn' || cell.type === 'castle')) {
                    let chebyshev = Math.max(Math.abs(dx), Math.abs(dy));
                    let euclidean = dx * dx + dy * dy;
                    if (chebyshev <= maxRange && euclidean < bestDist) {
                        bestDist = euclidean;
                        bestCell = { x, y };
                    }
                }
            }
        }
    }
    return bestCell || { x: startX, y: startY };
}

// Проверка и высадка наездника при гибели гоблина на варге
function checkAndSpawnDismount(enemy) {
    if (!enemy || enemy.type !== 'goblin_rider' || enemy.hasDismounted || enemy.escapedToCastle) return;
    enemy.hasDismounted = true;
    const gProto = (GAME_DATA.enemies && GAME_DATA.enemies['goblin']) || { name: 'Goblin', hp: 40, speed: 2, reward: 3, armor: 0, magicRes: 0 };
    let spawnX = enemy.x;
    let spawnY = enemy.y;
    let pathToCastle = findShortestPath(enemy.x, enemy.y, 'castle');
    if (pathToCastle && pathToCastle.length > 1) {
        spawnX = pathToCastle[1].x;
        spawnY = pathToCastle[1].y;
    }
    let dismountedGoblin = {
        id: Math.floor(Date.now() + Math.random() * 1000000),
        type: 'goblin',
        name: gProto.name,
        hp: gProto.hp || 40,
        maxHp: gProto.hp || 40,
        speed: gProto.speed || 2,
        baseSpeed: gProto.speed || 2,
        armor: gProto.armor || 0,
        magicRes: gProto.magicRes || 0,
        isFlying: false,
        reward: gProto.reward || 3,
        isRanged: false,
        meleeDmg: gProto.meleeDmg || 3,
        rangedDmg: 0,
        range: 1,
        livesTaken: 1,
        dodgeChance: 0,
        x: spawnX,
        y: spawnY,
        stunTurns: 0,
        slowTurns: 0,
        bleedTurns: 0,
        bleedDmg: 0
    };
    const fresh = createEnemy('goblin',spawnX,spawnY);
    Object.assign(dismountedGoblin,{id:fresh.id,traits:fresh.traits});
    if (fresh.shieldHp !== undefined) dismountedGoblin.shieldHp = fresh.shieldHp;
    if (enemy.summonGeneration > 0) Object.assign(dismountedGoblin,{summonGeneration:enemy.summonGeneration,summonedBy:enemy.summonedBy,reward:0});
    gameState.enemies.push(dismountedGoblin);
    logAction(Date.now(), `🏇 DISMOUNT: The goblin rider fell, but rider [${dismountedGoblin.name}] jumped off onto (${spawnX}, ${spawnY})!`);
    logDebug('RIDER_EJECT', `Goblin Rider (#${enemy.id}) dismounted into regular Goblin (#${dismountedGoblin.id}) at (${spawnX}, ${spawnY})`);
}

function checkNecromancerRaiseSkeleton(enemy) {
    if (!enemy || enemy.escapedToCastle) return;
    let gh = gameState.gridHeight || 16;
    let gw = gameState.gridWidth || 16;
    if (!gameState.soldiers) gameState.soldiers = [];

    for (let ty = 0; ty < gh; ty++) {
        for (let tx = 0; tx < gw; tx++) {
            let cell = gameState.grid[ty] && gameState.grid[ty][tx];
            if (!cell || !cell.type || !cell.type.startsWith('necro_')) continue;
            let proto = GAME_DATA.towers[cell.type];
            if (!proto) continue;
            let range = proto.range || 3;
            if ((tx - enemy.x) ** 2 + (ty - enemy.y) ** 2 > range * range) continue;

            let towerKey = `${tx},${ty}`;
            let upgrades = cell.upgrades || [];
            let maxSkeletons = upgrades.includes('necro_extra_shovels') ? 7 : (proto.skeletonLimit || (cell.type === 'necro_1' ? 2 : cell.type === 'necro_2' ? 3 : 4));
            let activeSkeletons = gameState.soldiers.filter(s => s.towerKey === towerKey && s.isSkeleton && s.hp > 0);

            if (activeSkeletons.length < maxSkeletons) {
                let hasBoneKnight = activeSkeletons.some(s => s.isBoneKnight);
                let shouldSpawnKnight = upgrades.includes('necro_bone_knight') && !hasBoneKnight;

                const skeletonId = `skeleton_${tx}_${ty}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
                const newSkeleton = {
                    id: skeletonId,
                    towerKey: towerKey,
                    towerType: cell.type,
                    name: shouldSpawnKnight ? 'Bone Knight' : 'Skeleton',
                    soldierIndex: activeSkeletons.length,
                    x: enemy.x,
                    y: enemy.y,
                    hp: shouldSpawnKnight ? 55 : 25,
                    maxHp: shouldSpawnKnight ? 55 : 25,
                    armor: shouldSpawnKnight ? 30 : 0,
                    dmg: shouldSpawnKnight ? 12 : 4,
                    respawnTimer: 0,
                    blockedEnemyIds: [],
                    isSkeleton: true,
                    isBoneKnight: shouldSpawnKnight,
                    blockLimit: shouldSpawnKnight ? 2 : 1
                };

                gameState.soldiers.push(newSkeleton);
                logAction(Date.now(), `💀 RAISE UNDEAD: [${proto.name}] at (${tx}, ${ty}) raised ${newSkeleton.name} from the remains of [${enemy.name}] at (${enemy.x}, ${enemy.y}) (${activeSkeletons.length + 1}/${maxSkeletons})!`);
                logDebug('NECRO_RAISE_SKELETON', `Necromancer (${tx}, ${ty}) raised ${newSkeleton.name} (#${skeletonId}) at (${enemy.x}, ${enemy.y}) [HP: ${newSkeleton.hp}]`);
                return;
            }
        }
    }
}

function resolveEnemyDeath(enemy) {
    if (!enemy.eventKind) sceneDirector.enemyDied(enemy);
    if (enemy.eventStructure) return;
    mobTraits.onDeath(enemy);
    checkAndSpawnDismount(enemy);
    checkNecromancerRaiseSkeleton(enemy);
}

function removeDeadEnemies() {
    let dead = gameState.enemies.filter(e => e.hp <= 0);
    dead.forEach(e => resolveEnemyDeath(e));
    gameState.enemies = gameState.enemies.filter(e => e.hp > 0);
}

// Создание отряда солдат для казармы на указанной точке сбора
function spawnBarracksSoldiers(towerX, towerY, towerType, rallyPoint) {
    if (!gameState.soldiers) gameState.soldiers = [];
    let towerKey = `${towerX},${towerY}`;
    gameState.soldiers = gameState.soldiers.filter(s => s.towerKey !== towerKey);

    const proto = GAME_DATA.towers[towerType];
    if (!proto) return;
    let count = proto.soldierCount || 3;
    for (let i = 0; i < count; i++) {
        gameState.soldiers.push({
            id: `soldier_${towerX}_${towerY}_${i}`,
            towerKey: towerKey,
            towerType: towerType,
            soldierIndex: i,
            x: rallyPoint.x,
            y: rallyPoint.y,
            hp: proto.soldierHp || 40,
            maxHp: proto.soldierHp || 40,
            armor: proto.soldierArmor || 20,
            dmg: proto.soldierDmg || 3,
            respawnTimer: 0,
            blockedEnemyIds: []
        });
    }
}

// Модернизация солдат казармы до нового уровня
function upgradeBarracksSoldiers(towerX, towerY, nextTowerType) {
    if (!gameState.soldiers) gameState.soldiers = [];
    let towerKey = `${towerX},${towerY}`;
    let cell = gameState.grid[towerY] && gameState.grid[towerY][towerX];
    let rally = (cell && cell.rallyPoint) ? cell.rallyPoint : { x: towerX, y: towerY };
    let soldiers = gameState.soldiers.filter(s => s.towerKey === towerKey);

    const proto = GAME_DATA.towers[nextTowerType];
    if (!proto) return;

    if (soldiers.length === 0) {
        spawnBarracksSoldiers(towerX, towerY, nextTowerType, rally);
    } else {
        soldiers.forEach(s => {
            s.towerType = nextTowerType;
            s.maxHp = proto.soldierHp || 65;
            s.hp = proto.soldierHp || 65;
            s.armor = proto.soldierArmor || 35;
            s.dmg = proto.soldierDmg || 5;
            s.respawnTimer = 0;
            s.x = rally.x;
            s.y = rally.y;
            s.blockedEnemyIds = [];
        });
    }
}

function refreshHeroBlocks(player) {
    // Сохраняем первые захваченные цели; уменьшение лимита освобождает остальные.
    player.blockedEnemyIds = (player.blockedEnemyIds || []).filter(id => {
        const enemy = gameState.enemies.find(e => e.id === id && e.hp > 0);
        return enemy && Math.max(Math.abs(player.x - enemy.x), Math.abs(player.y - enemy.y)) <= 1;
    }).slice(0, player.blockLimit ?? 1);
}

function applyDeathOrSurvival(player) {
    if (!player) return;
    if (player.hp <= 0 && player.skills.includes("fated") && !player.fatedUsedThisWave) {
        setCombatHp(player, Math.max(5, player.stats.con * 2));
        player.fatedUsedThisWave = true;
        logAction(Date.now(), `⏳ TIME RELIC: Fated Survivor saved ${player.heroName}! HP: ${player.hp}.`);
        return;
    }

    if (player.hp <= 0) {
        player.deathTimer = player.skills.includes("grail") ? 1 : 2; 
        if (player.skills.includes("grail")) {
            setCombatHp(player, Math.round(player.maxHp * 0.7));
            player.deathTimer = 0;
            player.skills = player.skills.filter(s => s !== "grail");
            player.grailConsumed = true;
            logAction(Date.now(), `🏆 HOLY GRAIL: ${player.heroName} rose from the dead in a flash of light! HP: ${player.hp}`);
        } else {
            logAction(Date.now(), `💀 DEATH: ${player.heroName} fell in battle and became a gravestone.`);
            player.blockedEnemyIds = [];
        }
    }
}

const towerCombat = require('./tower-combat')({
    getState: () => gameState, getData: () => GAME_DATA,
    setHp: setCombatHp,
    damageEnemy: (enemy, amount) => mobTraits.damage(enemy, amount),
    resolveEnemyDeath, removeDeadEnemies, findShortestPath, logAction, logDebug,
    random: () => Math.random(), now: () => Date.now()
});

const sceneDirector = require('./scene-director')({
    getState:()=>gameState,getData:()=>GAME_DATA,createEnemy,startWave:startScenarioWave,
    setCell(x,y,type) { clearTowerCell(gameState.grid[y][x],type); gameState.mines=(gameState.mines || []).filter(mine=>mine.x !== x || mine.y !== y); },
    log:text=>logAction(Date.now(),text)
});

function processDwarvenMinesIncome() {
    let gh = gameState.gridHeight || 16;
    let gw = gameState.gridWidth || 16;
    for (let y = 0; y < gh; y++) {
        for (let x = 0; x < gw; x++) {
            let cell = gameState.grid[y] && gameState.grid[y][x];
            if (!cell || !cell.type || !cell.type.startsWith('dwarf_')) continue;
            let proto = GAME_DATA.towers[cell.type];
            if (!proto) continue;
            let range = proto.range || 2;
            let enemiesInRange = (gameState.enemies || []).filter(e => e.hp > 0 && Math.max(Math.abs(x - e.x), Math.abs(y - e.y)) <= range);
            if (enemiesInRange.length === 0) {
                let baseIncome = proto.goldPerRound || (cell.type === 'dwarf_1' ? 4 : cell.type === 'dwarf_2' ? 7 : cell.type === 'dwarf_3' ? 10 : 15);
                let multiplier = 1;
                let upgrades = cell.upgrades || [];
                if (upgrades.includes('dwarf_deep_mine')) {
                    let roll = Math.random();
                    if (roll < 0.05) {
                        multiplier = 3;
                    } else if (roll < 0.30) {
                        multiplier = 2;
                    }
                }
                let income = baseIncome * multiplier;
                gameState.gold += income;
                let extraTag = multiplier === 3 ? ' (🔥 TRIPLE VEIN x3!)' : multiplier === 2 ? ' (✨ DOUBLE VEIN x2!)' : '';
                logAction(Date.now(), `⛏️ DWARVEN MINE: Miners [${proto.name}] at (${x}, ${y}) mined +${income}💰 ore${extraTag}! (No enemies nearby)`);
                logDebug('DWARF_MINE_INCOME', `Mine at (${x}, ${y}) produced +${income} gold (base: ${baseIncome}, multiplier: ${multiplier}). Treasury: ${gameState.gold}`);
            } else {
                logDebug('DWARF_MINE_BLOCKED', `Mine at (${x}, ${y}) produced no gold: enemies detected within range (${enemiesInRange.length} total).`);
            }
        }
    }
}

function processPriestessHealPrayer() {
    let gh = gameState.gridHeight || 16;
    let gw = gameState.gridWidth || 16;
    for (let y = 0; y < gh; y++) {
        for (let x = 0; x < gw; x++) {
            let cell = gameState.grid[y] && gameState.grid[y][x];
            if (!cell || cell.type !== 'mage_priestess') continue;
            let upgrades = cell.upgrades || [];
            if (!upgrades.includes('priestess_heal_prayer')) continue;

            let healed = [];
            // Живые герои
            Object.values(gameState.players || {}).forEach(p => {
                if (p.hp > 0 && p.deathTimer === 0 && p.hp < p.maxHp) {
                    if (Math.hypot(x - p.x, y - p.y) <= 2.85) {
                        let roll = Math.floor(Math.random() * 4) + 1 + 3;
                        let oldH = p.hp;
                        setCombatHp(p, Math.min(p.maxHp, p.hp + roll));
                        healed.push(`${p.heroName || p.name} (+${p.hp - oldH})`);
                    }
                }
            });
            // Живые солдаты гарнизона (НЕ скелеты!)
            (gameState.soldiers || []).forEach(s => {
                if (s.hp > 0 && s.respawnTimer === 0 && !s.isSkeleton && s.hp < s.maxHp) {
                    if (Math.hypot(x - s.x, y - s.y) <= 2.85) {
                        let roll = Math.floor(Math.random() * 4) + 1 + 3;
                        let oldH = s.hp;
                        setCombatHp(s, Math.min(s.maxHp, s.hp + roll));
                        healed.push(`${s.name || 'Soldier'} (+${s.hp - oldH})`);
                    }
                }
            });
            if (healed.length > 0) {
                logAction(Date.now(), `💖 HEALING PRAYER: Priestess of Light at (${x}, ${y}) healed allies: ${healed.join(', ')}!`);
                logDebug('PRIESTESS_HEAL', `Priestess of Light at (${x}, ${y}) healed: ${healed.join(', ')}`);
            }
        }
    }
}


function damageFromActivatedEvent(unit, amount, type) {
    if (unit.hp <= 0) return;
    if (gameState.enemies.includes(unit)) {
        const armor = Math.min(100, (unit.armor || 0) + ACTIVATED_EVENT_RULES.auraBonus(gameState, unit, 'armor'));
        const resist = type === 'magic' ? (unit.magicRes || 0) : type === 'physical' ? armor : 0;
        mobTraits.damage(unit, Math.max(0, Math.round(amount * (100 - Math.min(100, Math.max(0, resist))) / 100)));
        if (unit.hp <= 0) gameState.gold += unit.reward || 0;
    } else {
        applyIncomingDamage(unit, amount, { damageType: type === 'true' ? 'pure' : type });
        if (Object.values(gameState.players).includes(unit)) applyDeathOrSurvival(unit);
        else if (unit.hp <= 0) {
            unit.blockedEnemyIds = [];
            if (!unit.isSkeleton && !unit.isTemporary) unit.respawnTimer = GAME_DATA.towers[unit.towerType]?.respawnTurns || 2;
        }
    }
}
const activatedEvents = require('./activated-events')({
    getState: () => gameState, getData: () => GAME_DATA, createEnemy,
    damage: damageFromActivatedEvent, removeDeadEnemies, refreshBlocks: refreshHeroBlocks, triggerMinesAt,
    log: text => logAction(Date.now(), text), random: () => Math.random()
});

const combatEngine = require('./combat-engine')({
    activatedEvents,
    getState: () => gameState,
    getData: () => GAME_DATA,
    getModifier,
    applyIncomingDamage,
    applyDeathOrSurvival,
    setCombatHp,
    mobTraits,
    towerCombat,
    createEnemy,
    resolveEnemyDeath,
    removeDeadEnemies,
    findShortestPath,
    triggerMinesAt,
    resolveCastleArrival,
    refreshHeroBlocks,
    resetWaveBonuses,
    spawnPendingEnemies,
    processDwarvenMinesIncome,
    processPriestessHealPrayer,
    logAction,
    logDebug,
    broadcastState,
    random: () => Math.random()
});

function moveEnemies() {
    combatEngine.moveEnemies();
}

const heroActions = require('./hero-actions')({
    getState: () => gameState,
    getData: () => GAME_DATA,
    getModifier,
    setCombatHp,
    mobTraits,
    removeDeadEnemies,
    findShortestPath,
    triggerMinesAt,
    restorePreparationHero,
    logAction,
    logDebug,
    broadcastState,
    random: () => Math.random()
});

function castAbility(playerName, abilityType, targetEnemyId, diceRoll) {
    heroActions.castAbility(playerName, abilityType, targetEnemyId, diceRoll);
}

function startScenarioWave(waveDef) {
    gameState.wave = waveDef.waveNum;
    
    // Ищем точку спавна на карте (type === 'spawn')
    let spawnPoints = [];
    let gwSpawn = gameState.gridWidth || 16;
    let ghSpawn = gameState.gridHeight || 16;
    for (let y = 0; y < ghSpawn; y++) {
        for (let x = 0; x < gwSpawn; x++) {
            if (gameState.grid[y][x].type === 'spawn') spawnPoints.push({ x, y });
        }
    }
    if (spawnPoints.length === 0) spawnPoints.push({ x: 0, y: 0 });

    // Задержка задаёт начало группы; каждый вход выпускает одного её врага за ход.
    resetWaveBonuses();
    Object.values(gameState.players).forEach(player => {
        player.fatedUsedThisWave = false; player.bolinShotCount = 0;
    });
    if (!gameState.pendingSpawns) gameState.pendingSpawns = [];
    let spawnedCount = 0;
    waveDef.enemies.forEach(group => {
        if (!GAME_DATA.enemies[group.type]) return;
        for (let i = 0; i < group.count; i++) {
            const sp = spawnPoints[i % spawnPoints.length];
            const delay = Math.max(0, group.offsetDelay || 0) + Math.floor(i / spawnPoints.length);
            if (delay === 0) gameState.enemies.push(createEnemy(group.type, sp.x, sp.y));
            else gameState.pendingSpawns.push({ type: group.type, x: sp.x, y: sp.y, round: (gameState.roundCounter || 0) + delay });
            spawnedCount++;
        }
    });

    gameState.phase = 'player';
    logAction(Date.now(), `🚨 WAVE START: The GM launched [${waveDef.title}]! This wave contains ${spawnedCount} enemies; each group releases one enemy per spawn point per turn.`);
}

function activatePreparedScene(sceneId, adventure = null) {
    const scene = SCENES.validatePlayable(sceneStore.get(sceneId),GAME_DATA);
    const players = gameState.players;
    gameState = {gold:scene.gold,baseHp:scene.baseHp,wave:1,roundCounter:0,phase:'player',gamePeriod:'preparation',
        grid:scene.grid,gridWidth:scene.gridWidth,gridHeight:scene.gridHeight,availableTowerTypes:scene.availableTowerTypes,
        players,enemies:[],pendingSpawns:[],activeEvents:[],soldiers:[],mines:[],napalmPuddles:[],demolishVote:null,actionLogs:[],debugLogs:[],
        sceneMaster:{id:scene.id,kind:scene.kind,scenario:scene.scenario,cards:scene.cards,eventPresets:scene.eventPresets || [],title:scene.title,description:scene.description,objectives:scene.objectives,waves:scene.waves,
            noteRevision:0,notes:scene.notes.map(note => ({...note,revealed:false}))}};
    const spawn = scene.grid.flat().find(cell => cell.type === 'spawn') || {x:0,y:0};
    for (const player of Object.values(players)) {
        player.x = spawn.x; player.y = spawn.y;
        if (player.shieldWallRounds > 0) player.armor = Math.max(0,(player.armor || 0)-(player.shieldWallArmorBonus ?? 25));
        if (player.blockLimitBeforeUltimate !== undefined) player.blockLimit = player.blockLimitBeforeUltimate;
        for (const field of ['shieldWallRounds','shieldWallArmorBonus','blockLimitBeforeUltimate','invulnerableRounds','shieldHp',
            'retributionShield','parryRounds','parryDamage','speedBonus','speedBonusRounds','naniteCloudRounds','godDamageOverride','frostSlowUntilRound']) delete player[field];
        player.blockedEnemyIds = [];
        restorePreparationHero(player);
    }
    for (const row of scene.grid) for (const cell of row) {
        if (GAME_DATA.towers[cell.type]) cell.investedGold = getTowerInvestment(cell);
        if (GAME_DATA.towers[cell.type]?.isBarracks) {
            cell.rallyPoint ||= findNearestRoadCell(cell.x,cell.y,GAME_DATA.towers[cell.type].range || 3);
            spawnBarracksSoldiers(cell.x,cell.y,cell.type,cell.rallyPoint);
        }
        if (cell.type === 'mage_sorcerer' && (cell.upgrades || []).includes('sorcerer_golem')) {
            const road = cell.rallyPoint || findNearestRoadCell(cell.x,cell.y,GAME_DATA.towers[cell.type].range || 3);
            if (road) {
                cell.rallyPoint = {x:road.x,y:road.y};
                gameState.soldiers.push({id:`golem_${cell.x}_${cell.y}`,towerKey:`${cell.x},${cell.y}`,towerType:cell.type,
                    name:'Stone Golem',soldierIndex:99,x:road.x,y:road.y,hp:250,maxHp:250,armor:50,dmg:15,
                    respawnTimer:0,blockedEnemyIds:[],isGolem:true});
            }
        }
    }
    for (const group of scene.enemies) for (let i=0;i<group.count;i++) gameState.enemies.push(createEnemy(group.type,group.x,group.y));
    sceneDirector.ensure();
    logAction(Date.now(),'🎭 The GM opened scene “'+scene.title+'”. Preparation period.');
    if (adventure) gameState.adventureMaster = adventure;
}

wss.on('connection', (ws, request) => {
    let clientRole = null; let clientPlayerName = null;
    ws.diagnostics = { connectionId: ++connectionSequence, address: request?.socket?.remoteAddress,
        role: null, playerName: null, lastCommand: null };
    diagnosticLog('info', 'connection.open', 'WebSocket connected', ws.diagnostics);
    ws.on('error', error => diagnosticLog('error', 'connection.error', 'WebSocket error', { client: ws.diagnostics, error }));
    ws.on('message', (message) => {
        let msg;
        try { msg = JSON.parse(message); } catch { sendError(ws, 'Invalid JSON'); return; }
        if (!msg || typeof msg.type !== 'string') { sendError(ws, 'Command type is missing'); return; }
        const startedAt = Date.now();
        ws.diagnostics.lastCommand = msg.type;
        diagnosticCommand = { id: ++commandSequence, type: msg.type, connectionId: ws.diagnostics.connectionId,
            role: clientRole, playerName: clientPlayerName, status: 'processed' };
        // Большие каталоги, карты и тексты заметок не дублируем в журнале.
        const payload = Object.fromEntries(Object.entries(msg).map(([key, value]) =>
            [key, ['catalog', 'scene', 'note', 'grid', 'adventure'].includes(key) ? '[omitted]' : value]));
        diagnosticLog('info', 'command.received', msg.type, payload);
        try {
        if ((msg.type === 'REGISTER_MASTER' && clientRole && clientRole !== 'master') ||
            (msg.type === 'REGISTER_PLAYER' && clientRole && clientRole !== 'player')) {
            sendError(ws,'Open a separate connection for another role'); return;
        }
        if (msg.type === 'REGISTER_SCENE_EDITOR') {
            if (clientRole && clientRole !== 'scene-editor') { sendError(ws,'Open scene preparation in a separate connection'); return; }
            clientRole = 'scene-editor'; sceneEditors.add(ws);
            ws.send(JSON.stringify({type:'CATALOG_UPDATE',...catalogStore.read()}));
            sendSceneLibrary(ws); return;
        }
        if (['SCENE_GET_LIBRARY','SCENE_SAVE','SCENE_DELETE','SCENE_CAPTURE','ADVENTURE_SAVE','ADVENTURE_DELETE'].includes(msg.type)) {
            if (!['master','scene-editor'].includes(clientRole)) { sendError(ws,'Scenes are available only to the GM and preparation editor'); return; }
            try {
                if (msg.type === 'SCENE_GET_LIBRARY') sendSceneLibrary(ws);
                if (msg.type === 'SCENE_CAPTURE') ws.send(JSON.stringify({type:'SCENE_CAPTURED',scene:SCENES.captureScene(gameState,GAME_DATA,require('crypto').randomUUID())}));
                if (msg.type === 'SCENE_SAVE') { sceneStore.save(msg.scene,msg.revision); broadcastSceneLibrary(ws); }
                if (msg.type === 'SCENE_DELETE') { sceneStore.delete(msg.sceneId,msg.revision); broadcastSceneLibrary(ws); }
                if (msg.type === 'ADVENTURE_SAVE') { sceneStore.saveAdventure(msg.adventure,msg.revision); broadcastSceneLibrary(ws); }
                if (msg.type === 'ADVENTURE_DELETE') { sceneStore.deleteAdventure(msg.adventureId,msg.revision); broadcastSceneLibrary(ws); }
            } catch (error) { sendError(ws,error.message,error); }
            return;
        }
        if (clientRole === 'scene-editor') { sendError(ws,'The preparation editor cannot control the current game'); return; }
        if (msg.type === 'REGISTER_EDITOR') {
            if (clientRole && clientRole !== 'editor') { sendError(ws,'Open the editor in a separate connection'); return; }
            clientRole = 'editor'; catalogEditors.add(ws); sendCatalog(ws); return;
        }
        if (msg.type === 'EDITOR_GET_CATALOG' || msg.type === 'EDITOR_SAVE_CATALOG') {
            if (clientRole !== 'editor') { sendError(ws,'This command is available in the enemy and wave editor'); return; }
            if (msg.type === 'EDITOR_GET_CATALOG') { sendCatalog(ws); return; }
            try {
                const neededTypes = [...(gameState.pendingSpawns || []).map(entry => entry.type),
                    ...(gameState.activeEvents || []).filter(event => ['goblinTower','ritualTotem'].includes(event.kind)).map(event => event.config.enemyType),
                    ...gameState.enemies.filter(enemy => enemy.hp > 0).map(enemy => enemy.traits?.summoning?.type).filter(Boolean)];
                catalogStore.save(msg.catalog,msg.revision,neededTypes);
                playerHistory = [];
                delete gameState.masterUndo;
                sendCatalog(ws,'saved');
                for (const editor of catalogEditors) if (editor !== ws) sendCatalog(editor,'updated');
                broadcastCatalog();
                logAction(Date.now(),'📚 The GM saved the enemy catalog and wave scenarios.');
                broadcastState();
            } catch (error) { sendError(ws,error.message,error); }
            return;
        }
        if (clientRole === 'editor') { sendError(ws,'The editor cannot control the current game'); return; }
        const before = JSON.stringify(gameState);
        combatEvents.clear();
        combatResetPending = msg.type.startsWith('MASTER_') && msg.type !== 'MASTER_MOVE_ENEMIES';
        const signature = worldSignature(gameState);
        processingCommand = true;
        try {
        switch (msg.type) {
            case 'MASTER_ACTIVATE_EVENT':
            case 'MASTER_FINISH_EVENT': {
                let result;
                if (clientRole !== 'master') result = { ok: false, error: 'Only the GM can manage this' };
                else {
                    try {
                        if (msg.type === 'MASTER_ACTIVATE_EVENT') activatedEvents.activate(msg.config);
                        else activatedEvents.finish(msg.id);
                        result = { ok: true };
                        broadcastState();
                    } catch (error) {
                        gameState = JSON.parse(before);
                        combatEvents.clear();
                        result = { ok: false, error: error.message };
                    }
                }
                ws.send(JSON.stringify({ type: 'EVENT_RESULT', requestId: msg.requestId, ...result }));
                break;
            }
            case 'MASTER_CLEAR_ENEMIES':
            case 'MASTER_MANAGE_ENEMIES':
            case 'MASTER_RESTORE_HEROES':
            case 'MASTER_CANCEL_SPAWNS': {
                if (clientRole !== 'master') { sendError(ws, 'Only the GM can manage this'); return; }
                try {
                    const description = MASTER_CONTROLS.execute(gameState, msg, { data: GAME_DATA, refreshBlocks: refreshHeroBlocks });
                    logAction(Date.now(), '🛠️ GM: ' + description);
                    broadcastState();
                } catch (error) { sendError(ws, error.message); }
                break;
            }
            case 'MASTER_UNDO_INTERVENTION': {
                if (clientRole !== 'master') { sendError(ws, 'Only the GM can undo this'); return; }
                if (!gameState.masterUndo || msg.id !== gameState.masterUndo.id) { sendError(ws, 'This intervention can no longer be undone'); return; }
                const entry = gameState.masterUndo;
                gameState = JSON.parse(entry.snapshot);
                delete gameState.masterUndo;
                logAction(Date.now(), '↶ The GM undid an intervention: ' + entry.label);
                playerHistory = [];
                broadcastState();
                break;
            }
            case 'MASTER_START_ADVENTURE': {
                if (clientRole !== 'master') { sendError(ws,'Only the GM can manage adventures'); return; }
                if (msg.revision !== sceneStore.read().revision) throw new Error('The library has changed. Select the plan again.');
                const plan = sceneStore.getAdventure(msg.adventureId), step = plan.steps.find(step=>step.id === (msg.stepId || plan.steps[0].id));
                if (!step) throw new Error('Plan scene not found');
                activatePreparedScene(step.sceneId,{...plan,currentStepId:step.id,visited:[step.id],results:{},revision:0,finished:false});
                broadcastState(); break;
            }
            case 'MASTER_ADVENTURE_NEXT':
            case 'MASTER_ADVENTURE_GOTO':
            case 'MASTER_ADVENTURE_FINISH': {
                if (clientRole !== 'master') { sendError(ws,'Only the GM can manage adventures'); return; }
                const active = gameState.adventureMaster;
                if (!active || msg.revision !== active.revision) throw new Error('The plan has changed. Retry the transition using current data.');
                if (msg.type === 'MASTER_ADVENTURE_FINISH') { active.finished = true; active.revision++; broadcastState(); break; }
                if (active.finished) throw new Error('The plan has ended. Restart the adventure to continue.');
                const transitions = SCENES.adventureTransitions(active,gameState.sceneMaster?.runtime?.outcome);
                const targetId = msg.stepId || transitions[0]?.target;
                if (msg.type === 'MASTER_ADVENTURE_NEXT' && !transitions.some(branch=>branch.target === targetId)) throw new Error('This transition is unavailable for the current scene outcome');
                const nextStep = active.steps.find(step=>step.id === targetId);
                if (!nextStep) throw new Error('Transition scene not found');
                const next = JSON.parse(JSON.stringify(active));
                next.currentStepId = nextStep.id; next.revision++; next.finished = false;
                delete next.results[nextStep.id];
                if (!next.visited.includes(nextStep.id)) next.visited.push(nextStep.id);
                activatePreparedScene(nextStep.sceneId,next);
                broadcastState(); break;
            }
            case 'MASTER_SCENE_COUNTER':
            case 'MASTER_SCENE_GOAL':
            case 'MASTER_SCENE_EVENT':
            case 'MASTER_SCENE_OUTCOME':
            case 'MASTER_CARD_USED':
            case 'MASTER_BOSS_PHASE': {
                if (clientRole !== 'master') { sendError(ws,'Only the GM can manage the scenario'); return; }
                sceneDirector.command(msg); broadcastState(); break;
            }
            case 'MASTER_ACTIVATE_SCENE': {
                if (clientRole !== 'master') { sendError(ws,'Only the GM can launch a scene'); return; }
                if (msg.revision !== sceneStore.read().revision) { sendError(ws,'The library has changed. Select the scene again.'); sendSceneLibrary(ws); return; }
                activatePreparedScene(msg.sceneId);
                broadcastState(); break;
            }
            case 'MASTER_SAVE_NOTE':
            case 'MASTER_DELETE_NOTE':
            case 'MASTER_REVEAL_NOTE': {
                if (clientRole !== 'master') { sendError(ws,'Only the GM can edit notes'); return; }
                const scene = gameState.sceneMaster || {title:'Current map',description:'',objectives:'',notes:[],noteRevision:0};
                if (msg.revision !== (scene.noteRevision || 0)) { sendError(ws,'Notes have changed. Close this window and reopen the note.'); return; }
                try {
                    const index = scene.notes.findIndex(note => note.id === (msg.noteId || msg.note?.id));
                    if (msg.type === 'MASTER_SAVE_NOTE') {
                        const note = SCENES.validateNote(msg.note,gameState.gridWidth,gameState.gridHeight);
                        if (index < 0 && scene.notes.length >= 200) throw new Error('No more than 200 notes');
                        const next = {...note,revealed:index >= 0 ? !!scene.notes[index].revealed : false};
                        if (index < 0) scene.notes.push(next); else scene.notes[index] = next;
                    } else {
                        if (index < 0) throw new Error('Note not found');
                        if (msg.type === 'MASTER_DELETE_NOTE') scene.notes.splice(index,1);
                        else {
                            if (typeof msg.revealed !== 'boolean') throw new Error('Specify note visibility');
                            scene.notes[index].revealed = msg.revealed;
                        }
                    }
                    scene.noteRevision = (scene.noteRevision || 0)+1;
                    gameState.sceneMaster = scene;
                } catch (error) { sendError(ws,error.message,error); return; }
                ws.send(JSON.stringify({type:'NOTE_SAVED'}));
                broadcastState(); break;
            }
            
            case 'PROPOSE_TOWER_ROSTER': {
                if (clientRole !== 'master' && !(clientRole === 'player' && gameState.players[clientPlayerName])) {
                    sendError(ws, 'Game participants can select towers'); return;
                }
                if (gameState.gamePeriod !== 'preparation') {
                    sendError(ws, 'The tower roster can only be changed during preparation'); return;
                }
                if (gameState.rosterVote) {
                    sendError(ws, 'A tower roster vote is already in progress'); return;
                }
                const allTowers = GAME_DATA.towers;
                const baseTypes = TOWER_RULES.getBaseTypes(allTowers);
                const proposed = Array.isArray(msg.proposedTypes) ? msg.proposedTypes : [];
                if (proposed.length === 0 || proposed.length > TOWER_RULES.maxTypes || proposed.some(t => !baseTypes.includes(t))) {
                    sendError(ws, 'The roster must contain 1 to 5 base tower types'); return;
                }
                const builtFamilies = TOWER_RULES.getBuiltFamilies(gameState, allTowers);
                for (const built of builtFamilies) {
                    if (!proposed.includes(built)) {
                        sendError(ws, 'Cannot remove type [' + (allTowers[built]?.name || built) + ']: demolish its towers on the map first');
                        return;
                    }
                }
                const activePlayers = Object.keys(gameState.players);
                if (clientRole === 'master' || activePlayers.length <= 1) {
                    gameState.availableTowerTypes = [...proposed];
                    gameState.rosterVote = null;
                    const actor = clientRole === 'master' ? 'GM' : (clientPlayerName || 'Player');
                    logAction(Date.now(), '👑 ' + actor + ' approved the team arsenal: ' + proposed.map(t => allTowers[t]?.name || t).join(', ') + '.');
                    broadcastState(); break;
                }
                gameState.rosterVote = {
                    initiator: clientPlayerName,
                    proposedTypes: [...proposed],
                    votes: { [clientPlayerName]: true }
                };
                logAction(Date.now(), '🗳️ ' + clientPlayerName + ' proposed a new tower arsenal for a team vote.');
                broadcastState(); break;
            }
            case 'VOTE_TOWER_ROSTER': {
                if (!gameState.rosterVote) return;
                if (!clientPlayerName || !gameState.players[clientPlayerName]) return;
                if (msg.vote === false) {
                    logAction(Date.now(), '❌ Player ' + clientPlayerName + ' rejected the proposed tower arsenal. Vote canceled.');
                    gameState.rosterVote = null;
                    broadcastState(); return;
                }
                gameState.rosterVote.votes[clientPlayerName] = true;
                const activeList = Object.keys(gameState.players);
                const allAgreed = activeList.length > 0 && activeList.every(p => gameState.rosterVote.votes[p] === true);
                if (allAgreed) {
                    gameState.availableTowerTypes = [...gameState.rosterVote.proposedTypes];
                    logAction(Date.now(), '🎉 The team unanimously approved the new tower arsenal! (' + gameState.availableTowerTypes.length + ' types)');
                    gameState.rosterVote = null;
                } else {
                    const agreedCount = Object.values(gameState.rosterVote.votes).filter(Boolean).length;
                    logAction(Date.now(), '🗳️ ' + clientPlayerName + ' supported the arsenal (' + agreedCount + '/' + activeList.length + ').');
                }
                broadcastState(); break;
            }
            case 'CANCEL_TOWER_ROSTER_VOTE': {
                if (gameState.rosterVote && (clientRole === 'master' || gameState.rosterVote.initiator === clientPlayerName)) {
                    logAction(Date.now(), '🗳️ Tower roster vote canceled.');
                    gameState.rosterVote = null;
                    broadcastState();
                }
                break;
            }
            case 'MASTER_FORCE_SET_ROSTER': {
                if (clientRole === 'master') {
                    const types = Array.isArray(msg.proposedTypes) ? msg.proposedTypes : (gameState.rosterVote?.proposedTypes || []);
                    if (types.length > 0) {
                        gameState.availableTowerTypes = [...types];
                        logAction(Date.now(), '👑 The GM overrode the vote and approved the tower arsenal.');
                    }
                    gameState.rosterVote = null;
                    broadcastState();
                }
                break;
            }

            case 'SET_TOWER_TYPE': {
                if (clientRole !== 'master' && !(clientRole === 'player' && gameState.players[clientPlayerName])) {
                    sendError(ws, 'Game participants can select towers'); return;
                }
                if (gameState.gamePeriod !== 'preparation') {
                    sendError(ws, 'The tower roster can only be changed during preparation'); return;
                }
                const baseTypes = TOWER_RULES.getBaseTypes(GAME_DATA.towers);
                if (!baseTypes.includes(msg.towerType) || typeof msg.enabled !== 'boolean') {
                    sendError(ws, 'Select a base tower type'); return;
                }
                const selected = gameState.availableTowerTypes;
                if (selected.includes(msg.towerType) === msg.enabled) { broadcastState(); break; }
                if (msg.enabled && selected.length >= TOWER_RULES.maxTypes) {
                    sendError(ws, 'No more than 5 tower types can be available at once'); return;
                }
                if (!msg.enabled && TOWER_RULES.getBuiltFamilies(gameState, GAME_DATA.towers).has(msg.towerType)) {
                    sendError(ws, 'Demolish all towers of this type and its upgrades first'); return;
                }
                const next = new Set(selected);
                if (msg.enabled) next.add(msg.towerType); else next.delete(msg.towerType);
                // Переключается один тип по актуальному состоянию: параллельные запросы не теряют выбор друг друга.
                gameState.availableTowerTypes = baseTypes.filter(type => next.has(type));
                const actor = clientRole === 'master' ? 'GM' : clientPlayerName;
                logAction(Date.now(), `🏗️ ${actor} ${msg.enabled ? 'added to the roster' : 'removed from the roster'} [${GAME_DATA.towers[msg.towerType].name}] (${gameState.availableTowerTypes.length}/5 types).`);
                broadcastState(); break;
            }
            case 'MASTER_SET_GAME_PERIOD': {
                if (clientRole !== 'master') { sendError(ws, 'Only the GM can switch the game period'); return; }
                if (!['preparation', 'game'].includes(msg.gamePeriod)) {
                    sendError(ws, 'Unknown game period'); return;
                }
                if (gameState.gamePeriod === msg.gamePeriod) { broadcastState(); break; }
                gameState.gamePeriod = msg.gamePeriod;
                gameState.demolishVote = null;
                gameState.rosterVote = null;
                Object.values(gameState.players).forEach(player => {
                    delete player.disengaged;
                    player.hasMovedThisRound = false;
                    player.hasAttackedThisRound = false;
                    player.isReady = false;
                });
                logAction(Date.now(), `🎮 The GM enabled the ${msg.gamePeriod === 'preparation' ? 'preparation period' : 'play period'}.`);
                broadcastState(); break;
            }
            case 'MASTER_ROLLBACK_PLAYER': {
                if (clientRole !== 'master') return;
                const index = playerHistory.findIndex(entry => entry.id === msg.historyId);
                if (index < 0) { sendError(ws, 'Snapshot unavailable. Refresh the history list.'); return; }
                const entry = playerHistory[index];
                gameState = JSON.parse(entry.snapshot);
                delete gameState.masterUndo;
                playerHistory = playerHistory.slice(0, index);
                logAction(Date.now(), `↶ The GM undid action [${entry.playerName}: ${entry.label}] and all subsequent actions.`);
                broadcastState();
                break;
            }
            case 'MASTER_ADD_GOLD': {
                if (clientRole !== 'master') return;
                if (!Number.isSafeInteger(msg.amount) || Math.abs(msg.amount) > 1000000 ||
                    !Number.isSafeInteger(gameState.gold + msg.amount) || gameState.gold + msg.amount < 0) {
                    sendError(ws, 'Invalid gold amount'); return;
                }
                gameState.gold += msg.amount;
                logAction(Date.now(), `💰 The GM changed the treasury by ${msg.amount}. Balance: ${gameState.gold}`);
                broadcastState(); break;
            }
            case 'MASTER_EDIT_HERO': {
                if (clientRole !== 'master') return;
                const hero = gameState.players[msg.playerName];
                const values = msg.values;
                const numeric = { hp: [0, 1000000], maxHp: [1, 1000000], mana: [0, 1000000],
                    maxMana: [0, 1000000], armor: [0, 100], speed: [0, 40], range: [0, 40],
                    blockLimit: [0, 100], deathTimer: [0, 1000], godDamageOverride: [0, 1000000] };
                if (!hero || !values || typeof values !== 'object' || Array.isArray(values)) {
                    sendError(ws, 'Character not found'); return;
                }
                const next = JSON.parse(JSON.stringify(hero));
                for (const [key, value] of Object.entries(values)) {
                    if (key === 'stats') {
                        if (!value || typeof value !== 'object' || Array.isArray(value)) { sendError(ws, 'Invalid ability scores'); return; }
                        for (const [stat, score] of Object.entries(value)) {
                            if (!['str','dex','con','int','wis','cha'].includes(stat) || !Number.isInteger(score) || score < 1 || score > 30) {
                                sendError(ws, 'Ability scores must be between 1 and 30'); return;
                            }
                            next.stats[stat] = score;
                        }
                    } else if (['hasMovedThisRound','hasAttackedThisRound','isReady'].includes(key) && typeof value === 'boolean') {
                        next[key] = value;
                    } else if (key === 'godDamageOverride' && value === null) { next[key] = null;
                    } else if (numeric[key] && Number.isInteger(value) && value >= numeric[key][0] && value <= numeric[key][1]) {
                        next[key] = value;
                    } else { sendError(ws, 'Invalid field: ' + key); return; }
                }
                if (next.hp > next.maxHp || next.mana > next.maxMana) { sendError(ws, 'HP and MP cannot exceed their maximums'); return; }
                if (Object.prototype.hasOwnProperty.call(values, 'blockLimit')) refreshHeroBlocks(next);
                gameState.players[msg.playerName] = next;
                logAction(Date.now(), `🛠️ The GM updated hero parameters for ${hero.heroName}`);
                broadcastState(); break;
            }
            case 'REGISTER_MASTER':
                if (clientRole === 'editor') { sendError(ws,'The editor cannot control the game'); return; }
                clientRole = 'master'; clients.master = ws;
                ws.send(JSON.stringify({type:'CATALOG_UPDATE',...catalogStore.read()}));
                sendSceneLibrary(ws);
                broadcastState(); break;
                
            case 'REGISTER_PLAYER':
                ws.send(JSON.stringify({type:'CATALOG_UPDATE',...catalogStore.read()}));
                clientRole = 'player'; clientPlayerName = msg.name; clients.players[msg.name] = ws;
                if (!gameState.players[msg.name]) {
                    let hKey = "gerald";
                    if (msg.heroName.indexOf("Zefira") > -1) hKey = "zefira";
                    if (msg.heroName.indexOf("Malik") > -1) hKey = "malik";
                    if (msg.heroName.indexOf("Bolin") > -1) hKey = "bolin";
                    if (msg.heroName.indexOf("Connor") > -1) hKey = "connor";
                    if (msg.heroName.indexOf("Illiana") > -1) hKey = "illiana";
                    if (msg.heroName.indexOf("Torghar") > -1) hKey = "torghar";
                    if (msg.heroName.indexOf("Ratchet") > -1) hKey = "ratchet";
                    
                    const heroProto = GAME_DATA.heroes[hKey];
                    const scores = ['str', 'dex', 'con', 'int', 'wis', 'cha'].map(key => msg.stats?.[key]);
                    if (scores.some(score => !Number.isInteger(score) || score < 8 || score > 20) ||
                        scores.reduce((sum, score) => sum + score - 10, 0) > 27 || !Array.isArray(msg.skills) ||
                        msg.skills.length > 3 || new Set(msg.skills).size !== msg.skills.length ||
                        msg.skills.some(id => !heroProto.skills.some(skill => skill.id === id))) {
                        sendError(ws, 'Check your ability scores (27 points) and selected hero\'s abilities'); return;
                    }
                    let hSpeed = heroProto ? heroProto.baseSpeed : 2;
                    let hRange = heroProto ? heroProto.baseRange : 1;
                    let bLimit = heroProto ? heroProto.blockLimit : 2;
                    
                    let conMod = Math.floor((msg.stats.con - 10) / 2);
                    let intMod = Math.floor((msg.stats.int - 10) / 2);
                    
                    let calculatedMaxHp = 30 + (conMod * 5);
                    let calculatedMaxMana = 20 + (intMod * 5);
                    let baseArmor = 0;

                    if (hKey === 'torghar') {
                        calculatedMaxHp = 90 + (conMod * 5);
                        calculatedMaxMana = 35 + (intMod * 3);
                        baseArmor = 55;
                        bLimit = 3;
                    } else if (hKey === 'ratchet') {
                        calculatedMaxHp = 60 + (conMod * 4);
                        calculatedMaxMana = 50 + (intMod * 5);
                        baseArmor = 35;
                        hRange = 3;
                        bLimit = 1;
                    }

                    let gwSpawn = gameState.gridWidth || 16;
                    let ghSpawn = gameState.gridHeight || 16;
                    let spawnX = gwSpawn - 1, spawnY = ghSpawn - 1; 
                    for (let y = 0; y < ghSpawn; y++) {
                        for (let x = 0; x < gwSpawn; x++) {
                            if (gameState.grid[y][x].type === 'castle') { spawnX = x; spawnY = y; break; }
                        }
                    }

                    gameState.players[msg.name] = {
                        name: msg.name, heroName: msg.heroName, heroKey: hKey, sen: msg.sen,
                        hp: calculatedMaxHp, maxHp: calculatedMaxHp, 
                        mana: calculatedMaxMana, maxMana: calculatedMaxMana,
                        armor: baseArmor,
                        speed: hSpeed, range: hRange, blockLimit: bLimit, blockedEnemyIds: [], 
                        godDamageOverride: null, x: spawnX, y: spawnY, 
                        hasMovedThisRound: false, hasAttackedThisRound: false, fatedUsedThisWave: false,
                        isReady: false,
                        deathTimer: 0,
                        stats: msg.stats, 
                        skills: msg.skills 
                    };
                }
                logAction(Date.now(), `👤 CREATION: Player ${msg.name} successfully created a D&D character sheet for ${msg.heroName}!`);
                broadcastState();
                break;

            case 'MASTER_KICK_PLAYER':
                if (clientRole === 'master') {
                    const targetName = msg.playerName;
                    if (gameState.players[targetName]) {
                        delete gameState.players[targetName];
                        if (clients.players[targetName]) {
                            try {
                                clients.players[targetName].send(JSON.stringify({ type: 'KICKED', message: 'Your character was removed by the GM.' }));
                            } catch (e) {}
                            delete clients.players[targetName];
                        }
                        logAction(Date.now(), `🗑️ CLEANUP: The GM removed character [${targetName}] from the tactical map.`);
                        broadcastState();
                    }
                } break;

            case 'PLAYER_LEAVE':
                const leavingName = msg.name || clientPlayerName;
                if (leavingName && gameState.players[leavingName]) {
                    delete gameState.players[leavingName];
                    if (clients.players[leavingName]) delete clients.players[leavingName];
                    logAction(Date.now(), `🚪 Player [${leavingName}] left the battlefield and removed their character.`);
                    broadcastState();
                } break;

            case 'MASTER_RESIZE_MAP':
                if (clientRole === 'master') {
                    let newW = parseInt(msg.width);
                    let newH = parseInt(msg.height);
                    if (isNaN(newW) || newW < 8 || newW > 40) newW = 16;
                    if (isNaN(newH) || newH < 8 || newH > 40) newH = 16;
                    if ((gameState.activeEvents || []).length && (newW < gameState.gridWidth || newH < gameState.gridHeight)) {
                        sendError(ws, 'End active events before shrinking the map'); return;
                    }

                    let oldGrid = gameState.grid || [];
                    let newGrid = [];
                    for (let y = 0; y < newH; y++) {
                        let row = [];
                        for (let x = 0; x < newW; x++) {
                            if (oldGrid[y] && oldGrid[y][x]) {
                                row.push({ ...oldGrid[y][x], x, y });
                            } else {
                                row.push({ x: x, y: y, type: 'empty' });
                            }
                        }
                        newGrid.push(row);
                    }
                    gameState.grid = newGrid;
                    gameState.gridWidth = newW;
                    gameState.gridHeight = newH;
                    if (gameState.sceneMaster) {
                        gameState.sceneMaster.notes = gameState.sceneMaster.notes.filter(note => note.x < newW && note.y < newH);
                        gameState.sceneMaster.noteRevision = (gameState.sceneMaster.noteRevision || 0)+1;
                    }

                    // Удерживаем врагов и героев внутри новых границ карты
                    gameState.enemies.forEach(e => {
                        e.x = Math.min(newW - 1, Math.max(0, e.x));
                        e.y = Math.min(newH - 1, Math.max(0, e.y));
                    });
                    Object.values(gameState.players).forEach(p => {
                        p.x = Math.min(newW - 1, Math.max(0, p.x));
                        p.y = Math.min(newH - 1, Math.max(0, p.y));
                    });
                    for (const cell of newGrid.flat()) {
                        if (cell.rallyPoint && !newGrid[cell.rallyPoint.y]?.[cell.rallyPoint.x]) {
                            cell.rallyPoint = findNearestRoadCell(cell.x, cell.y, GAME_DATA.towers[cell.type]?.range || 3);
                        }
                    }
                    gameState.soldiers = (gameState.soldiers || []).filter(soldier => {
                        const [x, y] = soldier.towerKey.split(',').map(Number);
                        const tower = newGrid[y]?.[x];
                        if (!tower || (!GAME_DATA.towers[tower.type]?.isBarracks && !(soldier.isGolem && tower.type === 'mage_sorcerer'))) return false;
                        soldier.x = tower.rallyPoint?.x ?? Math.min(newW - 1, Math.max(0, soldier.x));
                        soldier.y = tower.rallyPoint?.y ?? Math.min(newH - 1, Math.max(0, soldier.y));
                        return true;
                    });
                    gameState.mines = (gameState.mines || []).filter(mine => newGrid[mine.y]?.[mine.x]);
                    gameState.napalmPuddles = (gameState.napalmPuddles || []).filter(puddle => newGrid[puddle.y]?.[puddle.x]);
                    for (const entry of gameState.pendingSpawns || []) {
                        entry.x = Math.min(newW - 1, entry.x); entry.y = Math.min(newH - 1, entry.y);
                    }

                    logAction(Date.now(), `📐 MAP SIZE: The GM set the map dimensions to ${newW} × ${newH} cells.`);
                    broadcastState();
                } break;

            case 'MASTER_RESET_SESSION':
                if (clientRole === 'master') {
                    gameState.activeEvents = [];
                    gameState.players = {};
                    gameState.enemies = [];
                    gameState.pendingSpawns = [];
                    gameState.mines = [];
                    gameState.napalmPuddles = [];
                    resetWaveBonuses();
                    gameState.wave = 1;
                    gameState.phase = 'player';
                    gameState.gamePeriod = 'preparation';
                    gameState.gold = 300;
                    gameState.baseHp = 20;
                    if (gameState.sceneMaster) { delete gameState.sceneMaster.runtime; sceneDirector.ensure(); }
                    if (gameState.adventureMaster) { delete gameState.adventureMaster.results[gameState.adventureMaster.currentStepId]; gameState.adventureMaster.revision++; }
                    clients.players = {};

                    let gw = gameState.gridWidth || 16;
                    let gh = gameState.gridHeight || 16;
                    gameState.demolishVote = null;
                    if (msg.clearTowers) {
                        gameState.soldiers = [];
                        for (let y = 0; y < gh; y++) {
                            for (let x = 0; x < gw; x++) {
                                if (gameState.grid[y][x].type in GAME_DATA.towers) {
                                    clearTowerCell(gameState.grid[y][x]);
                                }
                            }
                        }
                    }

                    logAction(Date.now(), `🔄 SESSION RESET: Characters and enemies cleared${msg.clearTowers ? ', towers reset to build slots' : ''}.`);
                    broadcastState();
                } break;

            case 'MASTER_RESET_FULL':
                if (clientRole === 'master') {
                    gameState.activeEvents = [];
                    let gwFull = gameState.gridWidth || 16;
                    let ghFull = gameState.gridHeight || 16;
                    gameState.players = {};
                    gameState.enemies = [];
                    gameState.pendingSpawns = [];
                    gameState.mines = [];
                    gameState.napalmPuddles = [];
                    gameState.soldiers = [];
                    gameState.demolishVote = null;
                    gameState.wave = 1;
                    gameState.phase = 'player';
                    gameState.gamePeriod = 'preparation';
                    gameState.gold = 300;
                    gameState.baseHp = 20;
                    gameState.actionLogs = [];
                    delete gameState.sceneMaster;
                    delete gameState.adventureMaster;
                    gameState.grid = Array.from({ length: ghFull }, (_, y) => 
                        Array.from({ length: gwFull }, (_, x) => ({ x, y, type: 'empty' }))
                    );
                    clients.players = {};
                    logAction(Date.now(), `⚠️ FULL MAP RESET: The entire map was cleared to grass! Chronicle reset.`);
                    broadcastState();
                } break;

            case 'MASTER_EDIT_CELL':
                if (clientRole === 'master') { 
                    clearTowerCell(gameState.grid[msg.y][msg.x], msg.cellType);
                    gameState.mines = (gameState.mines || []).filter(mine => mine.x !== msg.x || mine.y !== msg.y);
                    broadcastState(); 
                } break;

            case 'MASTER_ERASE_ENEMY':
                if (clientRole === 'master') {
                    gameState.enemies = gameState.enemies.filter(e => !(e.x === msg.x && e.y === msg.y));
                    logAction(Date.now(), `🧹 The GM erased monsters in cell (${msg.x}, ${msg.y})`);
                    broadcastState();
                } break;
                
            case 'MASTER_GOD_EDIT':
                if (clientRole === 'master') {
                    if (['gold', 'baseHp'].includes(msg.field) &&
                        (String(msg.value).trim() === '' || !Number.isSafeInteger(Number(msg.value)) || Number(msg.value) < 0)) {
                        sendError(ws, 'Enter a non-negative integer'); return;
                    }
                    if (msg.field === 'gold') gameState.gold = parseInt(msg.value);
                    if (msg.field === 'baseHp') gameState.baseHp = parseInt(msg.value);
                    
                    const p = gameState.players[msg.pName];
                    if (p) {
                        if (msg.field === 'playerHp') p.hp = parseInt(msg.value);
                        if (msg.field === 'playerMana') p.mana = parseInt(msg.value);
                        if (msg.field === 'playerMoved') p.hasMovedThisRound = (msg.value === 'true');
                        if (msg.field === 'playerAttacked') p.hasAttackedThisRound = (msg.value === 'true');
                        if (msg.field === 'isReady') p.isReady = (msg.value === 'true' || msg.value === true);
                        if (msg.field === 'deathTimer') p.deathTimer = parseInt(msg.value);
                        
                        if (['str', 'dex', 'con', 'int', 'wis', 'cha'].includes(msg.field)) {
                            p.stats[msg.field] = parseInt(msg.value);
                            if (msg.field === 'con') {
                                let conMod = Math.floor((p.stats.con - 10) / 2);
                                p.maxHp = 30 + (conMod * 5); p.hp = Math.min(p.hp, p.maxHp);
                            }
                            if (msg.field === 'int') {
                                let intMod = Math.floor((p.stats.int - 10) / 2);
                                p.maxMana = 20 + (intMod * 5); p.mana = Math.min(p.mana, p.maxMana);
                            }
                        }
                        
                        if (msg.field === 'toggleSkill') {
                            if (p.skills.includes(msg.value)) { p.skills = p.skills.filter(s => s !== msg.value); } 
                            else { p.skills.push(msg.value); }
                        }
                    }
                    
                    if (msg.field === 'godDamage' && p) {
                        p.godDamageOverride = parseInt(msg.value);
                        logAction(Date.now(), `✨ GOD MODE: The next attack from ${p.heroName} was set to a fixed ${msg.value} damage!`);
                        broadcastState(); return;
                    }
                    logAction(Date.now(), `🛠️ GOD PANEL: The GM updated parameter [${msg.field}]`);
                    broadcastState();
                } break;
            case 'MASTER_UNDO_ACTION':
                if (clientRole === 'master') {
                    const targetLog = gameState.actionLogs.find(l => l.id === msg.logId);
                    if (targetLog && targetLog.undoData) {
                        const undo = targetLog.undoData;
                        
                        if (undo.type === 'playerHp') {
                            const p = gameState.players[undo.pName];
                            if (p) { p.hp = undo.oldHp; if (p.hp > 0) p.deathTimer = 0; }
                        }
                        if (undo.type === 'enemyHp') {
                            let enemy = gameState.enemies.find(e => e.id === undo.enemyId);
                            if (!enemy) {
                                let protoName = undo.oldHp > 45 ? "Brute" : "Orc"; 
                                gameState.enemies.push({ id: undo.enemyId, name: protoName, hp: undo.oldHp, maxHp: 100, speed: 1, armor: 30, magicRes: 0, x: 0, y: 0, stunTurns: 0, slowTurns: 0, bleedTurns: 0, bleedDmg: 0 });
                                enemy = gameState.enemies.find(e => e.id === undo.enemyId);
                            }
                            if (enemy) enemy.hp = undo.oldHp;
                            gameState.gold = undo.oldGold;
                        }
                        if (undo.type === 'baseHp') gameState.baseHp = undo.old;
                        
                        gameState.actionLogs = gameState.actionLogs.filter(l => l.id !== msg.logId);
                        broadcastState();
                    }
                } break;
                
            case 'MASTER_MOVE_ENEMIES':
                if (clientRole === 'master') {
                    if (gameState.gamePeriod === 'preparation') {
                        sendError(ws, 'Enable the play period to advance the wave'); return;
                    }
                    moveEnemies();
                }
                break;
            case 'MASTER_START_PRESET_WAVE':
                if (clientRole === 'master') {
                    let wIndex = parseInt(msg.waveIndex) || 0;
                    const sceneWaves = gameState.sceneMaster?.waves || GAME_DATA.presetWaves;
                    if (sceneWaves && sceneWaves[wIndex]) {
                        let waveDef = sceneWaves[wIndex];
                        if (waveDef.enemies.some(group => !Object.hasOwn(GAME_DATA.enemies,group.type))) { sendError(ws,'The wave contains a removed enemy type. Fix the scene in the library.'); return; }
                        startScenarioWave(waveDef);
                        broadcastState();
                    }
                } break;
            case 'MASTER_SPAWN_ENEMY':
                if (clientRole === 'master') {
                    let targetX = msg.x, targetY = msg.y;
                    const proto = GAME_DATA.enemies[msg.enemyType];
                    const count = msg.count === undefined ? 1 : msg.count;
                    if (!proto || !Number.isInteger(count) || count < 1 || count > 20 ||
                        !Number.isInteger(targetX) || !Number.isInteger(targetY) || !gameState.grid[targetY]?.[targetX]) {
                        sendError(ws, 'Check enemy type, count (1–20) and cell'); return;
                    }
                    
                    for (let spawnIndex = 0; spawnIndex < count; spawnIndex++) {
                        gameState.enemies.push(createEnemy(msg.enemyType, targetX, targetY));
                    }
                    logAction(Date.now(), `👾 Spawned [${proto.name}] × ${count} at coordinates (${targetX}, ${targetY})`);
                    broadcastState();
                } break;
            case 'MOVE_HERO': {
                const pName = clientRole === 'master' ? msg.playerName : clientPlayerName;
                const player = gameState.players[pName];
                if (!player) break;
                if (!Number.isInteger(msg.x) || !Number.isInteger(msg.y) || !gameState.grid[msg.y]?.[msg.x]) {
                    sendError(ws, 'Cell outside the map'); return;
                }
                if (clientRole !== 'master' && !['empty', 'road', 'spawn', 'castle'].includes(gameState.grid[msg.y][msg.x].type)) {
                    sendError(ws, 'Select an unoccupied cell to move to'); return;
                }
                if (player.x === msg.x && player.y === msg.y) return;
                const distance = Math.max(Math.abs(player.x - msg.x), Math.abs(player.y - msg.y));
                const preparation = gameState.gamePeriod === 'preparation';
                if (clientRole !== 'master' && !preparation) {
                    if (player.hp <= 0 || player.deathTimer > 0 || player.hasMovedThisRound || distance > ACTIVATED_EVENT_RULES.heroSpeed(player, gameState.roundCounter || 0)) {
                        sendError(ws, 'Movement unavailable or cell too far away'); return;
                    }
                    player.hasMovedThisRound = true;
                    player.isReady = false;
                    for (const enemyId of [...(player.blockedEnemyIds || [])]) {
                        if (player.disengaged) break;
                        const enemy = gameState.enemies.find(e => e.id === enemyId && e.hp > 0);
                        if (!enemy || enemy.eventKind || enemy.stunTurns > 0 || enemy.isPolymorphed) continue;
                        const oldDistance = Math.max(Math.abs(player.x - enemy.x), Math.abs(player.y - enemy.y));
                        const newDistance = Math.max(Math.abs(msg.x - enemy.x), Math.abs(msg.y - enemy.y));
                        if (oldDistance > 1 || newDistance <= oldDistance) continue;
                        const damage = applyIncomingDamage(player, enemy.meleeDmg || 3, { attacker: enemy, melee: true });
                        logAction(Date.now(), `🩸 [Backstab]: ${enemy.name} wounded retreating ${player.heroName} for ${damage} damage!`);
                        applyDeathOrSurvival(player);
                        if (player.hp <= 0) { broadcastState(); return; }
                    }
                }
                player.x = msg.x; player.y = msg.y;
                refreshHeroBlocks(player);
                if (preparation) restorePreparationHero(player);
                broadcastState(); break;
            }
            case 'BUILD_TOWER':
                const builder = gameState.players[clientPlayerName];
                if (!builder || builder.hp <= 0) return;

                let cell = gameState.grid[msg.y][msg.x];
                let towerToBuild = msg.towerType || 'archer_1';
                
                // 1. Постройка на пустом слоте
                if (cell.type === 'slot') {
                    const proto = GAME_DATA.towers[towerToBuild];
                    if (!proto) return;
                    if (!TOWER_RULES.getBaseTypes(GAME_DATA.towers).includes(towerToBuild) || !isTowerTypeAvailable(towerToBuild)) {
                        sendError(ws, 'This base tower type is not in the team roster'); return;
                    }

                    if (gameState.gold >= proto.cost) {
                        gameState.gold -= proto.cost;
                        cell.type = towerToBuild;
                        cell.investedGold = proto.cost;
                        logAction(Date.now(), `🏗️ CONSTRUCTION: Player ${clientPlayerName} built [${proto.name}] at cell (${msg.x}, ${msg.y}) for ${proto.cost}💰!`);
                        if (proto.isBarracks) {
                            let rallyPoint = findNearestRoadCell(msg.x, msg.y, proto.range);
                            cell.rallyPoint = rallyPoint;
                            spawnBarracksSoldiers(msg.x, msg.y, towerToBuild, rallyPoint);
                            logAction(Date.now(), `🛡️ BARRACKS: A garrison of 3 soldiers occupied rally point (${rallyPoint.x}, ${rallyPoint.y})!`);
                        }
                        broadcastState();
                    } else {
                        logAction(Date.now(), `❌ Treasury: The team needs ${proto.cost - gameState.gold}💰 more to build ${proto.name}.`);
                        broadcastState();
                    }
                    return;
                }
                
                // 2. Модернизация существующей башни
                if (cell.type in GAME_DATA.towers) {
                    if (!isTowerTypeAvailable(cell.type)) { sendError(ws, 'Tower type is not in the team roster'); return; }
                    const currentProto = GAME_DATA.towers[cell.type];
                    if (!currentProto.next) {
                        logAction(Date.now(), `ℹ️ Tower [${currentProto.name}] is already at maximum level!`);
                        broadcastState();
                        return;
                    }
                    const nextProto = GAME_DATA.towers[currentProto.next];
                    if (gameState.gold >= nextProto.cost) {
                        gameState.gold -= nextProto.cost;
                        cell.investedGold = getTowerInvestment(cell) + nextProto.cost;
                        cell.type = currentProto.next;
                        logAction(Date.now(), `🏰 UPGRADE: Player ${clientPlayerName} upgraded a tower to [${nextProto.name}] at (${msg.x}, ${msg.y}) for ${nextProto.cost}💰!`);
                        if (nextProto.isBarracks) {
                            upgradeBarracksSoldiers(msg.x, msg.y, currentProto.next);
                            logAction(Date.now(), `🛡️ GARRISON: Barracks soldiers (${msg.x}, ${msg.y}) rearmed and restored their health!`);
                        }
                        broadcastState();
                    } else {
                        logAction(Date.now(), `❌ Treasury: The team needs ${nextProto.cost - gameState.gold}💰 more to upgrade to ${nextProto.name}.`);
                        broadcastState();
                    }
                    return;
                }
                break;

            case 'UPGRADE_TOWER':
                const upgrader = gameState.players[clientPlayerName];
                if (!upgrader || upgrader.hp <= 0) return;
                let uCell = gameState.grid[msg.y] && gameState.grid[msg.y][msg.x];
                if (!uCell || !(uCell.type in GAME_DATA.towers)) return;
                if (!isTowerTypeAvailable(uCell.type)) { sendError(ws, 'Tower type is not in the team roster'); return; }
                const curProto = GAME_DATA.towers[uCell.type];
                if (!curProto.next) {
                    logAction(Date.now(), `ℹ️ Tower [${curProto.name}] is already at maximum level!`);
                    broadcastState();
                    return;
                }

                let nextTargetKey = msg.targetType;
                let availableBranches = Array.isArray(curProto.next) ? curProto.next : [curProto.next];
                if (!nextTargetKey || !availableBranches.includes(nextTargetKey)) {
                    nextTargetKey = availableBranches[0];
                }

                const nxtProto = GAME_DATA.towers[nextTargetKey];
                if (!nxtProto) return;

                if (gameState.gold >= nxtProto.cost) {
                    gameState.gold -= nxtProto.cost;
                    uCell.investedGold = getTowerInvestment(uCell) + nxtProto.cost;
                    uCell.type = nextTargetKey;
                    logAction(Date.now(), `🏰 UPGRADE: Player ${clientPlayerName} upgraded a tower to [${nxtProto.name}] at (${msg.x}, ${msg.y}) for ${nxtProto.cost}💰!`);
                    if (nxtProto.isBarracks) {
                        upgradeBarracksSoldiers(msg.x, msg.y, nextTargetKey);
                        logAction(Date.now(), `🛡️ GARRISON: Barracks soldiers (${msg.x}, ${msg.y}) rearmed and restored their health!`);
                    }
                    broadcastState();
                } else {
                    logAction(Date.now(), `❌ Treasury: The team needs ${nxtProto.cost - gameState.gold}💰 more to upgrade to ${nxtProto.name}.`);
                    broadcastState();
                }
                break;

            case 'BUY_TOWER_UPGRADE':
                const upgPlayer = gameState.players[clientPlayerName];
                if (!upgPlayer || upgPlayer.hp <= 0) return;
                let upgCell = gameState.grid[msg.y] && gameState.grid[msg.y][msg.x];
                if (!upgCell || !(upgCell.type in GAME_DATA.towers)) return;
                if (!isTowerTypeAvailable(upgCell.type)) { sendError(ws, 'Tower type is not in the team roster'); return; }
                const tProto = GAME_DATA.towers[upgCell.type];
                if (!tProto || !tProto.upgrades) return;
                const upgDef = tProto.upgrades.find(u => u.id === msg.upgradeId);
                if (!upgDef) return;

                if (!upgCell.upgrades) upgCell.upgrades = [];
                if (upgCell.upgrades.includes(upgDef.id)) {
                    logAction(Date.now(), `ℹ️ Upgrade [${upgDef.name}] has already been purchased for this tower!`);
                    broadcastState();
                    return;
                }

                if (gameState.gold >= upgDef.cost) {
                    gameState.gold -= upgDef.cost;
                    upgCell.investedGold = getTowerInvestment(upgCell) + upgDef.cost;
                    upgCell.upgrades.push(upgDef.id);
                    logAction(Date.now(), `✨ SPECIALIZATION: Player ${clientPlayerName} purchased [${upgDef.name}] for [${tProto.name}] at (${msg.x}, ${msg.y}) for ${upgDef.cost}💰!`);
                    logDebug('UPGRADE_PURCHASE', `Purchased upgrade [${upgDef.name}] (${upgDef.id}) for the tower at (${msg.x}, ${msg.y}). Treasury: ${gameState.gold}💰`);

                    // Особый эффект: если Чародей купил Каменного голема ('sorcerer_golem') - спавним голема на дорогу рядом!
                    if (upgDef.id === 'sorcerer_golem') {
                        let roadCell = findNearestRoadCell(msg.x, msg.y, tProto.range || 3);
                        if (roadCell) {
                            upgCell.rallyPoint = { x: roadCell.x, y: roadCell.y };
                            if (!gameState.soldiers) gameState.soldiers = [];
                            gameState.soldiers.push({
                                id: `golem_${msg.x}_${msg.y}`,
                                towerKey: `${msg.x},${msg.y}`,
                                towerType: 'mage_sorcerer',
                                name: 'Stone Golem',
                                soldierIndex: 99,
                                x: roadCell.x,
                                y: roadCell.y,
                                hp: 250,
                                maxHp: 250,
                                armor: 50,
                                dmg: 15,
                                respawnTimer: 0,
                                blockedEnemyIds: [],
                                isGolem: true
                            });
                            logAction(Date.now(), `🪨 GOLEM: The Sorcerer summoned a Stone Golem on road cell (${roadCell.x}, ${roadCell.y})!`);
                            logDebug('GOLEM_SUMMON', `Golem summoned at (${roadCell.x}, ${roadCell.y}) [HP: 250, Armor: 50%, Damage: 15]`);
                        }
                    }
                    broadcastState();
                } else {
                    logAction(Date.now(), `❌ Treasury: The team needs ${upgDef.cost - gameState.gold}💰 more to purchase ${upgDef.name}.`);
                    broadcastState();
                }
                break;

            case 'SET_RALLY_POINT':
                let rCell = gameState.grid[msg.towerY] && gameState.grid[msg.towerY][msg.towerX];
                if (!rCell) return;
                let rProto = GAME_DATA.towers[rCell.type];
                let isSorcererGolem = (rCell.type === 'mage_sorcerer' && (rCell.upgrades || []).includes('sorcerer_golem'));
                if (!rProto || (!rProto.isBarracks && !isSorcererGolem)) return;
                let rDist = Math.max(Math.abs(msg.towerX - msg.rallyX), Math.abs(msg.towerY - msg.rallyY));
                let maxRallyRange = rProto.range || 3;
                if (rDist > maxRallyRange) {
                    logAction(Date.now(), `❌ Rally point is too far from the tower (max. ${maxRallyRange} cells)!`);
                    broadcastState(); return;
                }
                let targetRoad = gameState.grid[msg.rallyY] && gameState.grid[msg.rallyY][msg.rallyX];
                if (!targetRoad || (targetRoad.type !== 'road' && targetRoad.type !== 'spawn' && targetRoad.type !== 'castle')) {
                    logAction(Date.now(), `❌ Rally points can only be placed on roads!`);
                    broadcastState(); return;
                }
                rCell.rallyPoint = { x: msg.rallyX, y: msg.rallyY };
                let rKey = `${msg.towerX},${msg.towerY}`;
                let rSoldiers = (gameState.soldiers || []).filter(s => s.towerKey === rKey);
                rSoldiers.forEach(s => {
                    if (s.respawnTimer === 0) {
                        s.x = msg.rallyX;
                        s.y = msg.rallyY;
                    }
                    s.blockedEnemyIds = [];
                });
                let unitName = isSorcererGolem ? 'Stone Golem' : 'Barracks garrison';
                logAction(Date.now(), `🚩 RALLY POINT: ${unitName} (${msg.towerX}, ${msg.towerY}) relocated to (${msg.rallyX}, ${msg.rallyY})!`);
                broadcastState();
                break;

            case 'REQUEST_DEMOLISH':
                const demRequester = gameState.players[clientPlayerName];
                if (!demRequester || demRequester.hp <= 0) return;
                let demCell = gameState.grid[msg.y] && gameState.grid[msg.y][msg.x];
                if (!demCell || !(demCell.type in GAME_DATA.towers)) return;

                if (gameState.demolishVote) {
                    logAction(Date.now(), `ℹ️ Another demolition vote is already in progress!`);
                    broadcastState(); return;
                }

                const dProto = GAME_DATA.towers[demCell.type];
                let refundGold = getTowerRefund(demCell);

                let currentPlayers = Object.keys(gameState.players);
                // Если играет всего 1 игрок — снос одобряется мгновенно!
                if (currentPlayers.length <= 1) {
                    clearTowerCell(demCell);
                    gameState.soldiers = (gameState.soldiers || []).filter(s => s.towerKey !== `${msg.x},${msg.y}`);
                    gameState.gold += refundGold;
                    logAction(Date.now(), `🧨 TOWER DEMOLITION: Player ${clientPlayerName} demolished [${dProto.name}] at (${msg.x}, ${msg.y})! Treasury refunded +${refundGold}💰.`);
                    broadcastState();
                    return;
                }

                // Иначе запускаем голосование среди всех игроков
                gameState.demolishVote = {
                    towerX: msg.x,
                    towerY: msg.y,
                    towerType: demCell.type,
                    towerName: dProto.name,
                    initiator: clientPlayerName,
                    refundGold: refundGold,
                    votes: { [clientPlayerName]: true }
                };
                logAction(Date.now(), `🗳️ VOTE: ${clientPlayerName} proposed demolishing [${dProto.name}] at (${msg.x}, ${msg.y}) (+${refundGold}💰). All players must agree!`);
                broadcastState();
                break;

            case 'VOTE_DEMOLISH':
                if (!gameState.demolishVote) return;
                if (!clientPlayerName || !gameState.players[clientPlayerName]) return;

                if (msg.vote === false) {
                    logAction(Date.now(), `❌ DEMOLITION CANCELED: Player ${clientPlayerName} rejected demolition of [${gameState.demolishVote.towerName}]. The tower remains in place.`);
                    gameState.demolishVote = null;
                    broadcastState();
                    return;
                }

                gameState.demolishVote.votes[clientPlayerName] = true;
                let activeList = Object.keys(gameState.players);
                let allVotedYes = activeList.length > 0 && activeList.every(pName => gameState.demolishVote.votes[pName] === true);

                if (allVotedYes) {
                    let dv = gameState.demolishVote;
                    let targetCellToDemolish = gameState.grid[dv.towerY] && gameState.grid[dv.towerY][dv.towerX];
                    if (targetCellToDemolish && GAME_DATA.towers[targetCellToDemolish.type]) {
                        dv.refundGold = getTowerRefund(targetCellToDemolish);
                        clearTowerCell(targetCellToDemolish);
                        gameState.soldiers = (gameState.soldiers || []).filter(s => s.towerKey !== `${dv.towerX},${dv.towerY}`);
                        gameState.gold += dv.refundGold;
                        logAction(Date.now(), `🧨 UNANIMOUS DEMOLITION: All players approved! [${dv.towerName}] at (${dv.towerX}, ${dv.towerY}) demolished; treasury refunded +${dv.refundGold}💰!`);
                    }
                    gameState.demolishVote = null;
                } else {
                    let agreedCount = Object.values(gameState.demolishVote.votes).filter(v => v === true).length;
                    logAction(Date.now(), `🗳️ VOTE: ${clientPlayerName} agreed to demolition (${agreedCount}/${activeList.length}).`);
                }
                broadcastState();
                break;

            case 'CANCEL_DEMOLISH':
                if (gameState.demolishVote) {
                    logAction(Date.now(), `🗳️ VOTE: Demolition request for tower [${gameState.demolishVote.towerName}] canceled.`);
                    gameState.demolishVote = null;
                    broadcastState();
                }
                break;

            case 'MASTER_FORCE_DEMOLISH':
                if (clientRole === 'master' && gameState.demolishVote) {
                    let dv = gameState.demolishVote;
                    let targetCellToDemolish = gameState.grid[dv.towerY] && gameState.grid[dv.towerY][dv.towerX];
                    if (targetCellToDemolish && GAME_DATA.towers[targetCellToDemolish.type]) {
                        dv.refundGold = getTowerRefund(targetCellToDemolish);
                        clearTowerCell(targetCellToDemolish);
                        gameState.soldiers = (gameState.soldiers || []).filter(s => s.towerKey !== `${dv.towerX},${dv.towerY}`);
                        gameState.gold += dv.refundGold;
                        logAction(Date.now(), `🧨 TOWER DEMOLITION: The GM forced demolition of [${dv.towerName}] at (${dv.towerX}, ${dv.towerY})! Treasury refunded +${dv.refundGold}💰.`);
                    }
                    gameState.demolishVote = null;
                    broadcastState();
                }
                break;

            case 'MASTER_SET_TOWER':
                if (clientRole === 'master') {
                    let c = gameState.grid[msg.y] && gameState.grid[msg.y][msg.x];
                    if (!c) return;
                    let targetTower = msg.towerType;
                    
                    clearTowerCell(c, targetTower);
                    const proto = GAME_DATA.towers[targetTower];
                    if (proto) {
                        c.investedGold = getTowerInvestment(c);
                        if (proto.isBarracks) {
                            let rally = findNearestRoadCell(msg.x, msg.y, proto.range);
                            c.rallyPoint = rally;
                            spawnBarracksSoldiers(msg.x, msg.y, targetTower, rally);
                        }
                        logAction(Date.now(), `🛠️ GM: Placed tower [${proto.name}] at cell (${msg.x}, ${msg.y})`);
                    } else if (targetTower === 'slot') {
                        logAction(Date.now(), `🛠️ GM: Demolished tower at cell (${msg.x}, ${msg.y}) into an empty build slot`);
                    }
                    broadcastState();
                }
                break;

            case 'MASTER_CHANGE_TOWER_LEVEL':
                if (clientRole === 'master') {
                    let c = gameState.grid[msg.y] && gameState.grid[msg.y][msg.x];
                    if (!c || !(c.type in GAME_DATA.towers)) return;
                    let curKey = c.type;
                    let curProto = GAME_DATA.towers[curKey];
                    let delta = msg.delta; // +1 или -1
                    
                    // Повышение
                    if (delta > 0) {
                        let nextBranches = curProto.next;
                        if (!nextBranches) {
                            logAction(Date.now(), `ℹ️ Tower [${curProto.name}] is already at maximum level!`);
                            broadcastState(); return;
                        }
                        let nextKey = Array.isArray(nextBranches) ? nextBranches[0] : nextBranches;
                        let nextProto = GAME_DATA.towers[nextKey];
                        c.type = nextKey;
                        if (nextProto.isBarracks) {
                            upgradeBarracksSoldiers(msg.x, msg.y, nextKey);
                        }
                        logAction(Date.now(), `⬆️ GM UPGRADED TOWER: [${curProto.name}] -> [${nextProto.name}] at (${msg.x}, ${msg.y})`);
                    } 
                    // Понижение уровня
                    else if (delta < 0) {
                        // Ищем в GAME_DATA.towers башню, у которой поле 'next' ссылается на curKey
                        let prevKey = null;
                        for (let k in GAME_DATA.towers) {
                            let cand = GAME_DATA.towers[k];
                            if (cand.next) {
                                if (Array.isArray(cand.next) && cand.next.includes(curKey)) {
                                    prevKey = k; break;
                                } else if (cand.next === curKey) {
                                    prevKey = k; break;
                                }
                            }
                        }

                        if (prevKey) {
                            let prevProto = GAME_DATA.towers[prevKey];
                            c.type = prevKey;
                            if (prevProto.isBarracks) {
                                upgradeBarracksSoldiers(msg.x, msg.y, prevKey);
                            }
                            logAction(Date.now(), `⬇️ GM DOWNGRADED TOWER: [${curProto.name}] -> [${prevProto.name}] at (${msg.x}, ${msg.y})`);
                        } else {
                            // Если предыдущего уровня нет (была башня 1 уровня), сносим в пустой слот!
                            clearTowerCell(c);
                            gameState.soldiers = (gameState.soldiers || []).filter(s => s.towerKey !== `${msg.x},${msg.y}`);
                            logAction(Date.now(), `⬇️ GM DOWNGRADED LEVEL 1 TOWER: Dismantled into build slot [🟨] at (${msg.x}, ${msg.y})`);
                        }
                    }
                    c.upgrades = (c.upgrades || []).filter(id => (GAME_DATA.towers[c.type]?.upgrades || []).some(upgrade => upgrade.id === id));
                    if (curKey === 'mage_sorcerer' && c.type !== curKey) {
                        gameState.soldiers = (gameState.soldiers || []).filter(soldier => soldier.towerKey !== `${msg.x},${msg.y}`);
                        delete c.rallyPoint;
                    }
                    if (GAME_DATA.towers[c.type]) {
                        delete c.investedGold;
                        c.investedGold = getTowerInvestment(c);
                    }
                    broadcastState();
                }
                break;

            case 'PLAYER_ACTION':
                if (clientRole === 'player') castAbility(clientPlayerName, msg.ability, msg.targetId, msg.dice); break;

            case 'CLEAR_DEBUG_LOG':
                if (clientRole === 'master') {
                    gameState.debugLogs = [];
                    logAction(Date.now(), `🧹 DEBUG LOG: AI debug journal cleared.`);
                    broadcastState();
                }
                break;

            case 'TOGGLE_READY':
            case 'END_TURN':
                const rName = clientRole === 'player' ? clientPlayerName : msg.playerName;
                const rPlayer = gameState.players[rName];
                if (rPlayer) {
                    rPlayer.isReady = !rPlayer.isReady;
                    logAction(Date.now(), `⏱️ [${rPlayer.heroName || rName}] ${rPlayer.isReady ? 'ENDED TURN ✅' : 'resumed actions 🟡'}`);
                    broadcastState();
                }
                break;
        }
        } catch (error) {
            gameState = JSON.parse(before);
            combatEvents.clear();
            diagnosticCommand.status = 'error';
            diagnosticLog('error', 'command.failed', 'Error processing ' + msg.type, { error });
            console.error('Command error', msg.type, error);
            sendError(ws, /^MASTER_(SCENE_|ADVENTURE_|START_ADVENTURE|ACTIVATE_SCENE|CARD_|BOSS_)/.test(msg.type) ? error.message : 'Command failed: check parameters');
            broadcastState();
        } finally {
            if (!['MASTER_ROLLBACK_PLAYER', 'MASTER_UNDO_INTERVENTION'].includes(msg.type) && signature !== worldSignature(gameState)) {
                try { sceneDirector.evaluate(); }
                catch (error) { gameState = JSON.parse(before); combatEvents.clear(); sendError(ws,'Could not apply scenario: '+error.message,error); broadcastState(); }
            }
            if (msg.type !== 'MASTER_ROLLBACK_PLAYER' && signature !== worldSignature(gameState)) {
                if (clientRole === 'master' && Object.hasOwn(MASTER_CONTROLS.labels, msg.type)) {
                    const previous = JSON.parse(before);
                    delete previous.masterUndo;
                    const snapshot = JSON.stringify(previous);
                    gameState.masterUndo = Buffer.byteLength(snapshot) <= 16 * 1024 * 1024 ?
                        { id: ++historySequence, label: MASTER_CONTROLS.labels[msg.type], snapshot } : null;
                } else { delete gameState.masterUndo; }
                if (clientRole === 'player' && PLAYER_COMMANDS.has(msg.type)) {
                    playerHistory.push({ id: ++historySequence, playerName: clientPlayerName,
                        label: ACTION_NAMES[msg.type], round: gameState.roundCounter || 0,
                        snapshot: before, bytes: Buffer.byteLength(before) });
                    while (playerHistory.length > 30 || playerHistory.reduce((sum, entry) => sum + entry.bytes, 0) > 16 * 1024 * 1024) {
                        playerHistory.shift();
                    }
                } else { playerHistory = []; }
                broadcastState();
            }
            processingCommand = false;
            if (pendingStateBroadcast) {
                pendingStateBroadcast = false;
                broadcastState();
            }
        }
        } catch (error) {
            diagnosticCommand.status = 'error';
            diagnosticLog('error', 'command.failed', 'Error processing ' + msg.type, { error });
            sendError(ws, 'Command failed: check parameters');
        } finally {
            ws.diagnostics.role = clientRole;
            ws.diagnostics.playerName = clientPlayerName;
            diagnosticCommand.role = clientRole;
            diagnosticCommand.playerName = clientPlayerName;
            diagnosticLog('info', 'command.finished', msg.type, { durationMs: Date.now() - startedAt });
            diagnosticCommand = null;
        }
    });
    ws.on('close', (code, reason) => {
        diagnosticLog('info', 'connection.close', 'WebSocket disconnected', { client: ws.diagnostics,
            code, reason: reason?.toString() });
        catalogEditors.delete(ws);
        sceneEditors.delete(ws);
        if (clientRole === 'master' && clients.master === ws) clients.master = null;
        if (clientRole === 'player' && clients.players[clientPlayerName] === ws) delete clients.players[clientPlayerName];
        broadcastState();
    });
});

app.use((req, res, next) => {
    res.on('finish', () => {
        if (res.statusCode >= 400) logger.write('warn', 'http.error', req.method + ' ' + req.path,
            { status: res.statusCode, address: req.socket.remoteAddress });
    });
    next();
});
app.post('/api/client-logs', express.json({ limit: '64kb' }), (req, res) => {
    const body = req.body;
    if (!body || typeof body.page !== 'string' || typeof body.clientId !== 'string' ||
        !Array.isArray(body.events) || !body.events.length || body.events.length > 20 ||
        body.events.some(event => !event || !['info', 'warn', 'error'].includes(event.level) ||
            typeof event.message !== 'string' || typeof event.event !== 'string')) {
        res.status(400).json({ error: 'Invalid diagnostics payload' }); return;
    }
    let written = true;
    for (const event of body.events) {
        written = logger.write(event.level, 'browser.' + event.event.slice(0, 80), event.message, {
            clientId: body.clientId.slice(0, 80), playerName: String(body.playerName || '').slice(0, 120),
            page: body.page.slice(0, 512), clientTime: event.time, stack: event.stack, details: event.data,
            address: req.socket.remoteAddress, userAgent: req.get('user-agent')
        }) && written;
    }
    res.sendStatus(written ? 204 : 503);
});
app.get('/gamedata.js', (req,res) => {
    res.set('Cache-Control','no-store').type('application/javascript').send(
        'window.GAME_DATA = ' + JSON.stringify(GAME_DATA).replace(/</g,'\\u003c') + ';');
});
app.use(express.static(path.join(__dirname, 'public')));
app.use((error, req, res, next) => {
    logger.write('error', 'http.exception', req.method + ' ' + req.path, { error });
    if (res.headersSent) { next(error); return; }
    res.status(error.status || 500).json({ error: 'HTTP request error' });
});

function printAccessInfo() {
    const port = server.address().port;
    const nets = os.networkInterfaces();
    const ips = [];
    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            if (net.family === 'IPv4' && !net.internal) ips.push(net.address);
        }
    }
    console.log('======================================================');
    console.log(`Kr6DnD engine running on port ${port}.`);
    console.log('  Log file: ' + logger.file);
    console.log(`  GM (this computer):  http://localhost:${port}/master.html`);
    if (ips.length === 0) {
        console.log('  ⚠ No local network IP found. Connect to a shared hotspot or router and restart.');
    } else {
        ips.forEach(ip => {
            console.log('  Players (hotspot/LAN): http://' + ip + ':' + port + '/player.html');
        });
    }
    console.log('  All devices must be on the SAME network (one hotspot/router).');
    console.log('  If the page does not open, allow the configured port through Windows Firewall.');
    console.log('======================================================');
}

server.listen(PORT, '0.0.0.0', printAccessInfo);
