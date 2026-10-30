var _tr = typeof _tr !== 'undefined' ? _tr : (text => (typeof window !== 'undefined' && window.KR_I18N ? window.KR_I18N.t(text) : text));
// =========================================================================
// ТАКТИЧЕСКИЙ ДВИЖОК ИГРОКА (ГЕОМЕТРИЯ ДИАГОНАЛЕЙ И СТРЕЛЬБЫ HEROES V)
// =========================================================================
function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}

const socket = new WebSocket((window.location.protocol === 'https:' ? 'wss://' : 'ws://') + window.location.host);
window.KR_DIAGNOSTICS?.trackSocket(socket);
const PLAYER_CELL_SIZE = 80;
const PLAYER_CELL_GAP = 2;
const combatText = COMBAT_TEXT.install(document.getElementById('combat-text-layer'), { cellSize: PLAYER_CELL_SIZE, gap: PLAYER_CELL_GAP });

// Расширенный список 6 каноничных героев
const heroesBase = [
    { id: 'gerald', name: 'Gerald Lightbringer', sen: 10 },
    { id: 'zefira', name: 'Zefira (Mage Archer)', sen: 16 },
    { id: 'malik', name: 'Malik Hammerfury', sen: 9 },
    { id: 'bolin', name: 'Bolin (Dwarven Demolitionist)', sen: 12 },
    { id: 'connor', name: 'Connor (Templar)', sen: 11 },
    { id: 'illiana', name: 'Illiana and Sparky', sen: 14 },
    { id: 'torghar', name: 'Torghar the Unbreakable', sen: 8 },
    { id: 'ratchet', name: 'Ratchet (Combat Medic)', sen: 15 }
];

let character = { heroKey: '', heroName: '', sen: 0, stats: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }, skills: [] };
let poolPoints = 27; let activeAbility = ''; let myId = '';
let activeHeroSkillsPool = []; 
let mapMode = 'action';
let towerPreparationMenu = null;
let battleTargets = [];
let selectedBattleTarget = '';
let targetCellFocus = null;
let actionPending = false;
let lastBattleTurn = null;

// Отрисовка экрана выбора класса
let heroHtml = "";
for (let i = 0; i < heroesBase.length; i++) {
    heroHtml += "<div class='hero-card' id='hero-choice-" + i + "' onclick='selectHero(" + i + ")'><b>" + heroesBase[i].name + "</b> (SEN: " + heroesBase[i].sen + ")</div>";
}
document.getElementById('h-list').innerHTML = heroHtml;

window.selectHero = function(index) {
    for (let i = 0; i < heroesBase.length; i++) {
        document.getElementById('hero-choice-' + i).classList.remove('selected');
    }
    document.getElementById('hero-choice-' + index).classList.add('selected');
    
    let hKey = heroesBase[index].id;
    character.heroKey = hKey;
    character.heroName = heroesBase[index].name;
    character.sen = heroesBase[index].sen;
    
    if (window.GAME_DATA && window.GAME_DATA.heroes && window.GAME_DATA.heroes[hKey]) {
        activeHeroSkillsPool = window.GAME_DATA.heroes[hKey].skills;
    } else {
        activeHeroSkillsPool = [];
    }
    character.skills = character.skills.filter(id => activeHeroSkillsPool.some(skill => skill.id === id));

    document.getElementById('setup-step-1').style.display = 'none';
    document.getElementById('setup-step-2').style.display = 'block';
    renderStatsBuilder();
};

function renderStatsBuilder() {
    const box = document.getElementById('stats-dist-box');
    box.innerHTML = '';
    const fields = [
        { id: 'str', name: 'STR', desc: 'Strength (Melee damage)' },
        { id: 'dex', name: 'DEX', desc: 'Dexterity (Ranged attacks / Block)' },
        { id: 'con', name: 'CON', desc: 'Constitution (Max. HP)' },
        { id: 'int', name: 'INT', desc: 'Intelligence (Max. Mana)' },
        { id: 'wis', name: 'WIS', desc: 'Wisdom (Effect strength)' },
        { id: 'cha', name: 'CHA', desc: 'Charisma (Command radius)' }
    ];
    fields.forEach(f => {
        const row = document.createElement('div');
        row.className = 'stat-row';
        row.innerHTML = "<div><span class='stat-name'>" + f.name + "</span><span class='stat-desc'>" + f.desc + "</span></div><div class='stat-ctrl'><button class='stat-btn' onclick='adjustStat(\"" + f.id + "\", -1)'>-</button><span class='stat-val' id='v-" + f.id + "'>" + (character.stats[f.id] || 10) + "</span><button class='stat-btn' onclick='adjustStat(\"" + f.id + "\", 1)'>+</button></div>";
        box.appendChild(row);
    });
    // Классический DnD Point Buy: 27 очков (при базовых статах 10, или 8 с возвратом очков)
    poolPoints = 27 - Object.values(character.stats).reduce((spent, score) => spent + score - 10, 0);
    document.getElementById('points-left').innerText = poolPoints;
}
window.adjustStat = function(statKey, amount) {
    let currentVal = character.stats[statKey] || 10;
    let newVal = currentVal + amount;
    // Разрешаем уменьшать ниже 10 (до 8 включительно) и повышать до 20
    if (newVal < 8 || newVal > 20) return;
    if (amount > 0 && poolPoints < 1) return;
    character.stats[statKey] = newVal;
    poolPoints = amount > 0 ? poolPoints - 1 : poolPoints + 1;
    document.getElementById('v-' + statKey).innerText = newVal;
    document.getElementById('points-left').innerText = poolPoints;
};

window.goToStep = function(stepNum) {
    if (stepNum === 1) {
        document.getElementById('setup-step-2').style.display = 'none';
        document.getElementById('setup-step-3').style.display = 'none';
        document.getElementById('setup-step-1').style.display = 'block';
    } else if (stepNum === 2) {
        document.getElementById('setup-step-1').style.display = 'none';
        document.getElementById('setup-step-3').style.display = 'none';
        document.getElementById('setup-step-2').style.display = 'block';
    } else if (stepNum === 3) {
        if (poolPoints !== 0) { alert('Spend all D&D ability points! Remaining: ' + poolPoints); return; }
        document.getElementById('setup-step-1').style.display = 'none';
        document.getElementById('setup-step-2').style.display = 'none';
        document.getElementById('setup-step-3').style.display = 'block';
        renderSkillsBuilder();
    }
};

function renderSkillsBuilder() {
    const box = document.getElementById('skills-pick-box');
    box.innerHTML = '';
    if (activeHeroSkillsPool.length === 0) {
        box.innerHTML = '<p style="color:#aaa; text-align:center;">This hero has no available abilities.</p>';
        return;
    }
    activeHeroSkillsPool.forEach(s => {
        const card = document.createElement('div');
        let isSel = character.skills.includes(s.id);
        card.className = 'skill-card' + (isSel ? ' selected' : '');
        card.id = 'sk-card-' + s.id;
        card.onclick = function() { toggleSkillSelect(s.id); };
        card.innerHTML = "<div class='skill-name'>" + s.name + "</div><div style='font-size:11px; color:#ccc; margin-top:3px;'> " + s.desc + "</div>";
        box.appendChild(card);
    });
    document.getElementById('skills-left').innerText = Math.max(0, 3 - character.skills.length);
}

function toggleSkillSelect(skillId) {
    const idx = character.skills.indexOf(skillId);
    const card = document.getElementById('sk-card-' + skillId);
    if (idx > -1) {
        character.skills.splice(idx, 1);
        card.classList.remove('selected');
    } else {
        if (character.skills.length >= 3) { alert('You can select no more than 3 abilities!'); return; }
        character.skills.push(skillId);
        card.classList.add('selected');
    }
    document.getElementById('skills-left').innerText = 3 - character.skills.length;
}
window.finishCharacterCreation = function() {
    if (Object.values(character.stats).reduce((spent, score) => spent + score - 10, 0) !== 27) {
        alert('Allocate exactly 27 ability score points.'); return;
    }
    if (character.skills.length !== 3) { alert('Select exactly 3 abilities!'); return; }
    myId = document.getElementById('p-name').value.trim();
    if (!myId) { alert('Enter a player name!'); return; }
    try {
        localStorage.setItem('kr_player_id', myId);
        localStorage.setItem('kr_character', JSON.stringify(character));
    } catch(e) {}
    socket.send(JSON.stringify({ type: 'REGISTER_PLAYER', name: myId, heroName: character.heroName, sen: character.sen, stats: character.stats, skills: character.skills }));
    document.getElementById('screen-login').classList.remove('active');
    document.getElementById('screen-game').classList.add('active');
    renderBattleAbilitiesButtons();
};

function renderBattleAbilitiesButtons() {
    const box = document.getElementById('ab-box');
    box.replaceChildren();
    const hero = window.GAME_DATA.heroes[character.heroKey];
    const me = window.lastReceivedState?.players[myId] || { range: hero.baseRange };
    const abilities = [{ key: 'attack', name: 'Basic attack', desc: 'Select an enemy within range. The dice roll happens after confirmation.' }];
    activeHeroSkillsPool.forEach(s => {
        if (character.skills.includes(s.id) && s.cooldown > 0 && !s.desc.includes('Passive')) {
            abilities.push({ key: 'spell_' + s.id, ...s });
        }
    });
    abilities.push({ key: 'ultimate', ...hero.ultimate });
    abilities.forEach(ability => {
        const button = document.createElement('button');
        button.className = 'ab-btn';
        button.id = 'ab-' + ability.key.replace('spell_', '');
        button.dataset.ability = ability.key;
        button.title = ability.desc;
        button.onclick = () => setBattleAbility(ability.key);
        const title = document.createElement('span');
        title.className = 'ab-title';
        title.textContent = (ability.key === 'ultimate' ? '⚡ ' : '') + ability.name;
        const meta = document.createElement('span');
        meta.className = 'ab-meta';
        const info = getAbilityRangeInfo(ability.key, me);
        meta.textContent = getAbilityManaCost(ability.key) + ' MP · ' + formatBattleRange(info);
        button.append(title, meta);
        box.appendChild(button);
    });
    
    // Пассивные способности доступны во вкладке журнала.
    let passivesHtml = "";
    activeHeroSkillsPool.forEach(s => {
        if (character.skills.includes(s.id) && (s.cooldown === 0 || s.desc.indexOf('Passive') > -1)) {
            passivesHtml += "<div style='background:#1b281f; border-left:3px solid #00e676; padding:4px 8px; margin-bottom:4px; font-size:11px;'><b style='color:#00e676;'>🌀 " + s.name + " (Passive):</b> <span style='color:#bbb;'>" + s.desc.replace(/Passive:?\s*/i, '') + "</span></div>";
        }
    });
    const passBox = document.getElementById('passives-box');
    if (passBox) passBox.innerHTML = passivesHtml;

    if (!abilities.some(a => a.key === activeAbility)) clearBattleAbilitySelection();
    updateHeroAbilityRangePreview();
    updateBattleTargets();
}

// --- УПРАВЛЕНИЕ СТАТУСОМ ГОТОВНОСТИ (КОНЕЦ ХОДА) ---
window.toggleReady = function() {
    socket.send(JSON.stringify({ type: 'TOGGLE_READY' }));
};

// --- УПРАВЛЕНИЕ ОТОБРАЖЕНИЕМ КООРДИНАТ КЛЕТОК ---
let showCoords = true;
try {
    let saved = localStorage.getItem('kr_show_coords');
    if (saved !== null) showCoords = (saved === 'true');
} catch(e) {}

window.toggleCoordsDisplay = function(checked) {
    showCoords = checked;
    try { localStorage.setItem('kr_show_coords', checked ? 'true' : 'false'); } catch(e) {}
    applyCoordsVisibility();
};

function applyCoordsVisibility() {
    const g = document.getElementById('p-grid');
    const toggleEl = document.getElementById('coords-toggle');
    if (toggleEl) toggleEl.checked = showCoords;
    if (g) {
        if (showCoords) g.classList.remove('hide-coords');
        else g.classList.add('hide-coords');
    }
}

// --- ВИЗУАЛИЗАЦИЯ РАДИУСА СПОСОБНОСТЕЙ И АТАКИ БАШЕН ---
let activeRangePreview = null; // { x, y, range, metric: 'euclidean' | 'chebyshev', type: 'skill' | 'tower' }

function getAbilityRangeInfo(abilityKey, heroObj) {
    if (!heroObj || !abilityKey) return null;
    return BATTLE_ABILITY_RULES.rangeInfo(abilityKey, { ...heroObj, heroKey: character.heroKey || heroObj?.heroKey || 'gerald' });
}

function formatBattleRange(info) {
    return info.range === 0 ? 'self' : Number.isFinite(info.range) ? info.range + ' cells' : 'entire map';
}

function getAvailableBattleTargets(state, abilityKey = activeAbility) {
    return BATTLE_ABILITY_RULES.availableTargets(state, myId, abilityKey, character.heroKey);
}

function escapeBattleText(value) {
    return String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function getAbilityActionTone(abilityKey = activeAbility) {
    if (!abilityKey) return '';
    const key = abilityKey.replace('spell_', '');
    if (key === 'surgical_laser') return 'mixed';
    if (key === 'blink') return 'move';
    if (['nanite_cloud', 'ambulance_rush'].includes(key) ||
        (abilityKey === 'ultimate' && character.heroKey === 'ratchet')) return 'heal';
    if (['shield_wall', 'inspire', 'retribution', 'unbreakable', 'connor_retribution'].includes(key) ||
        (abilityKey === 'ultimate' && ['connor', 'torghar'].includes(character.heroKey))) return 'support';
    return 'attack';
}

function getBattleTargetTone(target) {
    const tone = getAbilityActionTone();
    return tone === 'mixed' ? (target.kind === 'enemy' ? 'attack' : 'heal') : tone;
}

function requiresBattleTarget(abilityKey = activeAbility) {
    return !!abilityKey && BATTLE_ABILITY_RULES.definition(abilityKey, character.heroKey).selection !== 'none';
}

function clearBattleAbilitySelection() {
    activeAbility = '';
    selectedBattleTarget = '';
    targetCellFocus = null;
    battleTargets = [];
    if (activeRangePreview?.type === 'skill') activeRangePreview = null;
}

function syncBattleTurnSelection(state) {
    const turn = { round: state.roundCounter || 0, wave: state.wave || 1, period: state.gamePeriod, phase: state.phase };
    if (!lastBattleTurn || turn.round !== lastBattleTurn.round || turn.wave !== lastBattleTurn.wave ||
        turn.period !== lastBattleTurn.period || (lastBattleTurn.phase === 'wave' && turn.phase === 'player')) {
        clearBattleAbilitySelection();
    }
    lastBattleTurn = turn;
}

function updateHeroAbilityRangePreview() {
    if (!activeAbility) {
        if (activeRangePreview?.type === 'skill') activeRangePreview = null;
        return;
    }
    if (!window.lastReceivedState || !window.lastReceivedState.players) return;
    const me = window.lastReceivedState.players[myId];
    if (me && me.hp > 0) {
        let rInfo = getAbilityRangeInfo(activeAbility, me);
        if (rInfo) {
            activeRangePreview = {
                x: me.x,
                y: me.y,
                range: rInfo.range,
                metric: rInfo.metric,
                type: 'skill'
            };
        }
    } else if (activeRangePreview?.type === 'skill') {
        activeRangePreview = null;
    }
}

function canMoveHeroTo(state, me, x, y) {
    const cell = state?.grid[y]?.[x];
    if (!me || !cell || !['empty', 'road', 'spawn', 'castle'].includes(cell.type) ||
        (me.x === x && me.y === y)) return false;
    if (state.gamePeriod === 'preparation') return true;
    return me.hp > 0 && !(me.deathTimer > 0) && !me.hasMovedThisRound &&
        Math.max(Math.abs(x - me.x), Math.abs(y - me.y)) <= me.speed + (me.speedBonus || 0);
}

function getRangeContourPath(cellKeys, columns, rows) {
    return MAP_RANGE_CONTOURS.path(cellKeys, columns, rows, { cellSize: PLAYER_CELL_SIZE, gap: PLAYER_CELL_GAP });
}

function renderRangeContours(grid, rangeCells, applicationCells) {
    const state = window.lastReceivedState;
    const columns = state?.gridWidth || state?.grid?.[0]?.length || 16;
    const rows = state?.gridHeight || state?.grid?.length || 16;
    const paths = [...applicationCells].map(([tone, keys]) => ({ tone, path: getRangeContourPath(keys, columns, rows), classes: 'application-range' }));
    const rangePath = getRangeContourPath(rangeCells, columns, rows);
    if (rangePath && !paths.some(({ path }) => path === rangePath)) paths.unshift({
        path: rangePath, tone: activeRangePreview?.type === 'tower' ? 'support' : getAbilityActionTone(),
        classes: activeRangePreview?.type === 'tower' ? 'tower-range' : 'cast-range'
    });
    MAP_RANGE_CONTOURS.render(document, grid, paths, columns, rows);
}

function updateGridRangeOverlay() {
    const grid = document.getElementById('p-grid');
    if (!grid) return;
    const cells = grid.querySelectorAll('.cell');
    const showApplication = mapMode === 'action' && !isSelectingRally && activeRangePreview?.type !== 'tower';
    const application = showApplication ? BATTLE_ABILITY_RULES.application(window.lastReceivedState, myId, activeAbility, selectedBattleTarget) : { effects: [], areas: [] };
    const rangeCells = new Set();
    const applicationCells = new Map();
    cells.forEach(cEl => {
        let cx = parseInt(cEl.dataset.x);
        let cy = parseInt(cEl.dataset.y);
        cEl.classList.remove('range-skill', 'range-attack', 'range-heal', 'range-support', 'range-move', 'range-mixed',
            'range-tower', 'tower-preview-origin', 'cell-in-range', 'available-target', 'target-attack', 'target-heal',
            'target-support', 'target-move', 'selected-target', 'available-move', 'application-area',
            'application-attack', 'application-heal', 'application-support', 'application-mixed');

        if (activeRangePreview && (mapMode === 'action' || activeRangePreview.type === 'tower') && activeRangePreview.x !== undefined && activeRangePreview.y !== undefined) {
            let inRange = false;
            if (activeRangePreview.metric === 'euclidean') {
                inRange = Math.hypot(cx - activeRangePreview.x, cy - activeRangePreview.y) <= (activeRangePreview.range + 0.05);
            } else {
                inRange = Math.max(Math.abs(cx - activeRangePreview.x), Math.abs(cy - activeRangePreview.y)) <= activeRangePreview.range;
            }
            if (activeRangePreview.isMapPreview && cx === activeRangePreview.x && cy === activeRangePreview.y) {
                cEl.classList.add('tower-preview-origin');
            }
            if (inRange) {
                cEl.classList.add(activeRangePreview.type === 'tower' ? 'range-tower' : 'range-skill');
                rangeCells.add(cx + ',' + cy);
                if (activeRangePreview.type === 'skill') {
                    cEl.classList.add('range-' + getAbilityActionTone());
                }
                if (activeRangePreview.isMapPreview) {
                    cEl.classList.add('cell-in-range');
                }
            }
        }
        if (showApplication) {
            for (const area of application.areas) {
                if (BATTLE_ABILITY_RULES.contains(area, { x: cx, y: cy })) {
                    cEl.classList.add('application-area', 'application-' + area.tone);
                    if (!applicationCells.has(area.tone)) applicationCells.set(area.tone, new Set());
                    applicationCells.get(area.tone).add(cx + ',' + cy);
                }
            }
            const targets = (requiresBattleTarget() ? battleTargets : application.effects).filter(t => t.x === cx && t.y === cy);
            if (targets.length) {
                cEl.classList.add('available-target');
                for (const target of targets) cEl.classList.add('target-' + (target.tone || getBattleTargetTone(target)));
            }
            if (requiresBattleTarget() && targets.some(t => t.id === selectedBattleTarget)) cEl.classList.add('selected-target');
        }
        const me = window.lastReceivedState?.players[myId];
        if (mapMode === 'move' && !isSelectingRally && canMoveHeroTo(window.lastReceivedState, me, cx, cy)) {
            cEl.classList.add('available-move');
        }
    });
    renderRangeContours(grid, rangeCells, applicationCells);
    grid.querySelectorAll('.health-token').forEach(token => {
        for (const tone of ['attack', 'heal', 'support']) token.classList.toggle('effect-' + tone,
            application.effects.some(effect => effect.kind === token.dataset.unitKind && effect.id === token.dataset.unitId && effect.tone === tone));
    });
}

function updateBattleTargets(state) {
    state = state || window.lastReceivedState;
    if (!state) return;
    battleTargets = getAvailableBattleTargets(state);
    if (!battleTargets.some(t => t.id === selectedBattleTarget)) selectedBattleTarget = '';
    if (targetCellFocus && !battleTargets.some(t => t.x === targetCellFocus.x && t.y === targetCellFocus.y)) targetCellFocus = null;
    renderBattleControls(state);
    updateGridRangeOverlay();
}

function getAbilityManaCost(ability = activeAbility) {
    return BATTLE_ABILITY_RULES.manaCost(ability);
}

function getActionBlockReason(me) {
    if (!me) return 'Connecting to game…';
    if (socket.readyState !== WebSocket.OPEN) return 'Disconnected · refresh page';
    if (me.hp <= 0) return 'Hero fallen · respawns in ' + (me.deathTimer || 0) + ' turns';
    if (actionPending) return 'Performing action…';
    if (me.hasAttackedThisRound) return 'Action already used';
    if (!activeAbility) return 'Select an ability';
    if ((me.cooldowns?.[activeAbility] || 0) > 0) return 'Cooldown · ' + me.cooldowns[activeAbility] + ' turns';
    if (me.mana < getAbilityManaCost()) return 'Not enough mana · requires ' + getAbilityManaCost();
    return '';
}

function getBattleDiceSides() {
    if (activeAbility === 'ultimate') return 1;
    const key = activeAbility.replace('spell_', '');
    if (key === 'ground_tremor') return 6;
    if (['earthquake', 'mortar', 'shatter', 'glitter', 'ambulance_rush'].includes(key)) return 10;
    if (['hammer', 'mines', 'prey', 'connor_retribution'].includes(key)) return 12;
    return 8;
}

function renderBattleControls(state = window.lastReceivedState) {
    const me = state?.players[myId];
    document.getElementById('journal-controls').hidden = mapMode !== 'journal';
    const isPrep = state?.gamePeriod === 'preparation';
    document.getElementById('tower-roster-controls').hidden = mapMode !== 'build' || isPrep;
    const prepRosterBox = document.getElementById('preparation-roster-box');
    if (prepRosterBox) {
        prepRosterBox.style.display = (mapMode === 'build' && isPrep) ? 'block' : 'none';
        const dockCount = document.getElementById('dock-roster-count');
        if (dockCount && state?.availableTowerTypes) {
            dockCount.textContent = state.availableTowerTypes.length + '/5';
        }
    }
    if (towerPreparationMenu) {
        if (mapMode !== 'build' || state?.gamePeriod !== 'preparation') towerPreparationMenu.close();
        else towerPreparationMenu.refresh();
    }
    if (state && mapMode === 'build' && state.gamePeriod !== 'preparation') {
        document.getElementById('player-tower-type-count').textContent = TOWER_RULES.getSelectedTypes(state, GAME_DATA.towers).length + '/5';
        document.getElementById('tower-roster-hint').textContent = state.gamePeriod === 'preparation' ?
            'Shared team roster: up to 5 types with all upgrades. Any player can edit it. Demolish a type\'s towers before removing it.' :
            'The team roster is locked. Change it during preparation.';
        renderTowerRoster(document.getElementById('player-tower-roster'), state, GAME_DATA.towers, (towerType, enabled) => {
            socket.send(JSON.stringify({ type: 'SET_TOWER_TYPE', towerType, enabled }));
        });
    }
    const hero = window.GAME_DATA.heroes[character.heroKey];
    const key = activeAbility.replace('spell_', '');
    const ability = activeAbility === 'ultimate' ? hero?.ultimate : activeHeroSkillsPool.find(s => s.id === key);
    document.getElementById('ability-name').textContent = !activeAbility ? 'No ability selected' : ability?.name || 'Basic attack';
    document.getElementById('ability-description').textContent = !activeAbility ?
        'Select an ability to highlight its range and targets. Click again to clear selection and highlights.' :
        ability?.desc || 'Select an enemy in the highlighted range and confirm the attack. Dice are rolled automatically.';
    document.querySelectorAll('.ab-btn').forEach(button => {
        const selected = button.dataset.ability === activeAbility;
        button.classList.toggle('active', selected);
        button.setAttribute('aria-pressed', String(selected));
        const cd = me?.cooldowns?.[button.dataset.ability] || 0;
        button.disabled = cd > 0 && !selected;
        const meta = button.querySelector('.ab-meta');
        if (meta) {
            const range = getAbilityRangeInfo(button.dataset.ability, me || { range: hero.baseRange });
            meta.textContent = cd > 0 ? 'Cooldown · ' + cd + ' turns' : getAbilityManaCost(button.dataset.ability) + ' MP · ' + formatBattleRange(range);
        }
    });
    const target = battleTargets.find(t => t.id === selectedBattleTarget);
    const automatic = !!activeAbility && !requiresBattleTarget();
    document.getElementById('target-step').hidden = !activeAbility || automatic;
    document.getElementById('clear-target-btn').hidden = !target && !targetCellFocus;
    const choices = document.getElementById('target-choices');
    choices.replaceChildren();
    const targetsInCell = targetCellFocus ? battleTargets.filter(t => t.x === targetCellFocus.x && t.y === targetCellFocus.y) : [];
    const visibleTargets = targetCellFocus ? targetsInCell : battleTargets.filter(t => t.kind !== 'cell');
    if (!visibleTargets.length) {
        const hint = document.createElement('p');
        hint.className = 'target-empty-hint';
        hint.textContent = !activeAbility ? 'Select an ability first' : battleTargets.length ?
            'Select a highlighted cell on the map' : 'No available targets within range';
        choices.appendChild(hint);
    }
    visibleTargets.forEach(t => {
        const button = document.createElement('button');
        button.className = 'target-chip' + (t.id === selectedBattleTarget ? ' selected' : '');
        button.textContent = t.name + ' · ' + t.detail;
        button.setAttribute('aria-pressed', String(t.id === selectedBattleTarget));
        button.onclick = () => selectBattleTarget(t.id);
        choices.appendChild(button);
    });
    const reason = getActionBlockReason(me);
    document.getElementById('action-status').textContent = reason || 'Action available';
    const main = document.getElementById('attack-main-btn');
    main.hidden = mapMode === 'journal';
    main.disabled = mapMode !== 'action' || !activeAbility || !!reason || (!automatic && !target);
    main.textContent = mapMode !== 'action' ? 'Select an action' : reason || (!automatic && !target ? 'Select a target' :
        (activeAbility === 'ultimate' ? '⚡ Confirm action' : '🎲 Confirm · d' + getBattleDiceSides()));
    const hint = document.getElementById('map-mode-hint');
    hint.hidden = mapMode === 'journal';
    hint.textContent = mapMode === 'move' ? (state?.gamePeriod === 'preparation' ?
        'Free movement: click a blue cell. Every move fully restores HP, mana and abilities.' :
        me?.hasMovedThisRound ? 'Movement already used this round.' : 'Click a blue cell to move your hero.') :
        mapMode === 'build' ? (state?.gamePeriod === 'preparation' ? 'Preparation period: use the button above to configure the team tower roster, or select a map slot.' : 'Click a yellow slot to build, or a tower to upgrade.') :
        automatic ? 'No target selection needed. Review the highlighted units and confirm the action.' :
        (targetCellFocus && targetsInCell.length > 1 ? 'There are several targets in this cell. Select one using the buttons above.' : 'Ability → target on map → confirm.');
}

window.selectBattleTarget = function(id) {
    if (!requiresBattleTarget()) return;
    battleTargets = getAvailableBattleTargets(window.lastReceivedState);
    selectedBattleTarget = battleTargets.some(t => t.id === String(id)) ? String(id) : '';
    renderBattleControls();
    updateGridRangeOverlay();
};
window.clearBattleTarget = function() {
    selectedBattleTarget = '';
    targetCellFocus = null;
    updateBattleTargets();
};
window.setMapMode = function(mode) {
    if (!['action', 'move', 'build', 'journal'].includes(mode)) return;
    if (isSelectingRally) cancelRallySelection();
    if (activeRangePreview?.isMapPreview) closeTowerRangePreview();
    const previousMode = mapMode;
    mapMode = mode;
    document.querySelectorAll('.mode-btn').forEach(button => {
        const active = button.id === 'mode-' + mode;
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', String(active));
    });
    document.getElementById('action-controls').hidden = mode !== 'action';
    if (mode !== 'journal' && previousMode !== 'journal') {
        selectedBattleTarget = '';
        targetCellFocus = null;
    }
    updateBattleTargets();
    if (mode === 'build' && window.lastReceivedState?.gamePeriod === 'preparation') {
        openPreparationTowerMenu();
    }
};
window.setBattleAbility = function(abKey) {
    activeAbility = abKey === activeAbility ? '' : abKey || '';
    selectedBattleTarget = '';
    targetCellFocus = null;
    updateHeroAbilityRangePreview();
    if (mapMode !== 'action') setMapMode('action');
    else updateBattleTargets();
};

// --- УПРАВЛЕНИЕ БАШНЯМИ И КАЗАРМАМИ (ВАРИАНТ 1: КОНТЕКСТНОЕ МЕНЮ / МОДАЛЬНОЕ ОКНО) ---
let selectedTowerCoords = null;
let isSelectingRally = false;
let rallyTowerCoords = null;

function updateTowerDemolishButton(cell, state = window.lastReceivedState) {
    const button = document.getElementById('tm-btn-demolish');
    const proto = GAME_DATA.towers[cell?.type];
    if (!button || !proto) return;
    const preparation = state?.gamePeriod === 'preparation';
    const refund = preparation ? (cell.investedGold ?? proto.cost) : Math.round((proto.cost || 70) * 0.6);
    button.innerText = _tr('🧨 Demolish tower (refund ') + (preparation ? '100%' : '60%') + ': +' + refund + _tr('💰, unanimous approval)');
}

window.openTowerModal = function(x, y, cell) {
    selectedTowerCoords = { x, y };
    const proto = window.GAME_DATA && GAME_DATA.towers && GAME_DATA.towers[cell.type];
    if (!proto) return;

    const modal = document.getElementById('tower-modal-backdrop');
    const titleEl = document.getElementById('tm-title');
    const infoEl = document.getElementById('tm-info');
    const upBtn = document.getElementById('tm-btn-upgrade');
    const rallyBtn = document.getElementById('tm-btn-rally');

    const towerName = _tr(proto.name);
    const shortName = _tr(proto.shortName || '');
    titleEl.innerText = (shortName ? shortName + " " : "") + towerName;

    let infoHtml = "";
    let isSorcererGolem = (cell.type === 'mage_sorcerer' && (cell.upgrades || []).includes('sorcerer_golem'));
    if (proto.isBarracks) {
        let rallyStr = cell.rallyPoint ? "(" + cell.rallyPoint.x + ", " + cell.rallyPoint.y + ")" : _tr("Not set");
        let soldiersAlive = 0;
        if (window.lastReceivedState && window.lastReceivedState.soldiers) {
            let key = x + "," + y;
            soldiersAlive = window.lastReceivedState.soldiers.filter(s => s.towerKey === key && s.hp > 0 && s.respawnTimer === 0).length;
        }
        infoHtml = "<div><b>" + _tr("Type:") + "</b> " + _tr("Garrison barracks") + "</div>" +
            "<div><b>" + _tr("Squad:") + "</b> " + (proto.soldierCount || 3) + " " + _tr("soldiers") + " (" + _tr("alive:") + " " + soldiersAlive + "/" + (proto.soldierCount || 3) + ")</div>" +
            "<div><b>" + _tr("Soldier stats:") + "</b> ❤️ " + proto.soldierHp + " HP | 🛡️ " + proto.soldierArmor + "% " + _tr("armor") + " | ⚔️ " + proto.soldierDmg + " " + _tr("physical damage") + "</div>" +
            "<div><b>" + _tr("⚡ Squad initiative:") + "</b> " + (proto.initiative || 12) + "</div>" +
            "<div><b>" + _tr("Rally radius:") + "</b> " + proto.range + " " + _tr("cells") + "</div>" +
            "<div style='margin-top:4px; color:#00e676;'><b>" + _tr("🚩 Rally point:") + "</b> " + rallyStr + "</div>";
        rallyBtn.style.display = 'block';
    } else {
        let typeStr = proto.dmgType === 'magic' ? _tr('🔮 Magic') : _tr('🏹 Physical');
        let dmgStr = (proto.minDamage !== undefined) ? (proto.minDamage + " - " + proto.maxDamage) : proto.damage;
        infoHtml = "<div><b>" + _tr("Attack range:") + "</b> " + proto.range + " " + _tr("cells") + "</div>" +
            "<div><b>" + _tr("Damage per shot:") + "</b> " + dmgStr + " (" + typeStr + ")</div>" +
            "<div><b>" + _tr("⚡ Tower initiative:") + "</b> " + (proto.initiative || 10) + "</div>" +
            (proto.noAir ? "<div style='color:#ff9800;'>" + _tr("⚠ Cannot hit flying targets") + "</div>" : "");
        if (isSorcererGolem) {
            let rallyStr = cell.rallyPoint ? "(" + cell.rallyPoint.x + ", " + cell.rallyPoint.y + ")" : _tr("Near tower");
            infoHtml += "<div style='margin-top:6px; color:#ffb74d;'><b>" + _tr("🪨 Stone Golem:") + "</b> " + _tr("Active") + " (❤️ 250 HP, 🛡️ 50%, ⚔️ 15)</div>" +
                "<div style='color:#00e676;'><b>" + _tr("🚩 Golem rally point:") + "</b> " + rallyStr + "</div>";
            rallyBtn.style.display = 'block';
        } else {
            rallyBtn.style.display = 'none';
        }
    }
    if (proto.description) {
        infoHtml += "<div style='color:#cbd5e1; font-size:11px; margin-top:6px; padding:6px; background:#1e293b; border-radius:4px;'>" + escapeHtml(_tr(proto.description)) + "</div>";
    }
    infoEl.innerHTML = infoHtml;

    // Список доступных улучшений (поддерживает линейный апгрейд, развилки и пассивки 4 уровня!)
    const upBox = document.getElementById('tm-upgrades-box');
    if (upBox) {
        upBox.innerHTML = '';
        let currentGold = (window.lastReceivedState && window.lastReceivedState.gold !== undefined) ? window.lastReceivedState.gold : 0;

        let nextKeys = [];
        if (proto.next) {
            if (Array.isArray(proto.next)) nextKeys = proto.next;
            else nextKeys = [proto.next];
        }

        if (nextKeys.length === 0) {
            let passivesHtml = '<div style="background:#262a2f; border:1px solid #ffcc00; padding:6px; border-radius:4px; text-align:center; color:#ffcc00; font-size:12px; margin-bottom:8px;">' + _tr('⭐ Maximum level (Level IV)') + '</div>';
            if (proto.upgrades && proto.upgrades.length > 0) {
                passivesHtml += '<div style="font-weight:bold; color:#00e676; font-size:12px; margin-bottom:6px;">' + _tr('✨ Specializations and passive upgrades:') + '</div>';
                let cellUpgrades = cell.upgrades || [];
                proto.upgrades.forEach(upg => {
                    let upgName = _tr(upg.name);
                    let upgDesc = _tr(upg.desc);
                    let isPurchased = cellUpgrades.includes(upg.id);
                    if (isPurchased) {
                        passivesHtml += '<div style="background:#1b3022; border:1px solid #00e676; padding:8px; border-radius:4px; margin-bottom:6px; font-size:11px;">' +
                            '<div style="font-weight:bold; color:#00e676;">' + (upg.icon || '✨') + ' ' + escapeHtml(upgName) + ' ' + _tr('[ ✅ PURCHASED ]') + '</div>' +
                            '<div style="color:#ccc; font-size:10px; margin-top:2px;">' + escapeHtml(upgDesc) + '</div>' +
                            '</div>';
                    } else {
                        let canAfford = currentGold >= upg.cost;
                        let btnStyle = canAfford 
                            ? 'background:#ff9800; color:#111; cursor:pointer;' 
                            : 'background:#444; color:#aaa; cursor:not-allowed;';
                        let costText = canAfford 
                            ? '(' + upg.cost + '💰)' 
                            : '❌ ' + _tr('Need') + ' ' + (upg.cost - currentGold) + '💰';
                        passivesHtml += '<div style="background:#25282c; border:1px solid #555; padding:8px; border-radius:4px; margin-bottom:6px; font-size:11px;">' +
                            '<div style="display:flex; justify-content:space-between; align-items:center;">' +
                                '<span style="font-weight:bold; color:#fff;">' + (upg.icon || '✨') + ' ' + escapeHtml(upgName) + '</span>' +
                                '<button class="btn" style="margin:0; padding:4px 8px; font-size:11px; ' + btnStyle + '" ' + (canAfford ? 'onclick="buyTowerUpgrade(\'' + upg.id + '\')"' : 'disabled') + '>' + _tr('Purchase') + ' ' + costText + '</button>' +
                            '</div>' +
                            '<div style="color:#aaa; font-size:10px; margin-top:3px;">' + escapeHtml(upgDesc) + '</div>' +
                            '</div>';
                    }
                });
            }
            upBox.innerHTML = passivesHtml;
        } else {
            nextKeys.forEach(nKey => {
                const nextProto = window.GAME_DATA && GAME_DATA.towers && GAME_DATA.towers[nKey];
                if (!nextProto) return;
                const nextName = _tr(nextProto.name);
                const nextDesc = nextProto.description ? _tr(nextProto.description) : "";
                const btn = document.createElement('button');
                btn.className = 'btn';
                btn.style.marginTop = '0';
                btn.style.padding = '10px';
                btn.style.fontSize = '12px';
                btn.style.textAlign = 'left';

                let canAfford = currentGold >= nextProto.cost;
                if (canAfford) {
                    btn.style.background = '#ffcc00';
                    btn.style.color = '#111';
                    let descHtml = nextDesc ? "<div style='font-size:10px; font-weight:normal; opacity:0.85; margin-top:2px;'>" + escapeHtml(nextDesc) + "</div>" : "";
                    btn.innerHTML = "<div style='font-weight:bold;'>🏰 " + _tr('Upgrade to: ') + escapeHtml(nextName) + " (" + nextProto.cost + "💰)</div>" + descHtml;
                    btn.onclick = function() {
                        upgradeCurrentTower(nKey);
                    };
                } else {
                    btn.disabled = true;
                    btn.style.background = '#444';
                    btn.style.color = '#aaa';
                    btn.innerHTML = "<div style='font-weight:bold;'>🏰 " + escapeHtml(nextName) + " (" + nextProto.cost + "💰)</div>" +
                                    "<div style='font-size:10px; color:#ff8a80; margin-top:2px;'>❌ " + _tr('Need') + " " + (nextProto.cost - currentGold) + "💰</div>";
                }
                upBox.appendChild(btn);
            });
        }
    }

    // Обновляем кнопку сноса башни с расчетом возврата монет
    updateTowerDemolishButton(cell);

    const rangeBtn = document.getElementById('tm-btn-range-preview');
    if (rangeBtn) {
        rangeBtn.onclick = function() {
            previewTowerRange(x, y);
        };
    }

    modal.style.display = 'flex';
    if (typeof window !== 'undefined' && window.KR_I18N && typeof window.KR_I18N.translateDOM === 'function') {
        window.KR_I18N.translateDOM(modal, window.KR_I18N.getLang());
    }
    activeRangePreview = {
        x: x,
        y: y,
        range: proto.range || 2,
        metric: 'euclidean',
        type: 'tower'
    };
    updateGridRangeOverlay();
};

window.previewTowerRange = function(x, y) {
    if (x === undefined || y === undefined) {
        if (!selectedTowerCoords) return;
        x = selectedTowerCoords.x;
        y = selectedTowerCoords.y;
    }
    const state = window.lastReceivedState;
    if (!state || !state.grid) return;
    const cell = state.grid[y] && state.grid[y][x];
    if (!cell) return;
    const proto = (window.GAME_DATA && GAME_DATA.towers && GAME_DATA.towers[cell.type]) || {};
    const range = proto.range || 2;

    const modal = document.getElementById('tower-modal-backdrop');
    if (modal) modal.style.display = 'none';

    activeRangePreview = {
        x: x,
        y: y,
        range: range,
        metric: 'euclidean',
        type: 'tower',
        isMapPreview: true
    };

    const bar = document.getElementById('range-preview-bar');
    if (bar) {
        bar.style.display = 'flex';
        const txt = document.getElementById('range-preview-text');
        if (txt) {
            const protoName = _tr(proto.name || 'Tower');
            txt.innerHTML = '👁️ ' + _tr('Range') + ` [${protoName}]: <b>${range} ` + _tr('cells') + `</b> ` + _tr('at') + ` (${x}, ${y})`;
        }
    }

    updateGridRangeOverlay();
};

window.closeTowerRangePreview = function() {
    const bar = document.getElementById('range-preview-bar');
    if (bar) bar.style.display = 'none';

    let prevX = activeRangePreview ? activeRangePreview.x : (selectedTowerCoords ? selectedTowerCoords.x : null);
    let prevY = activeRangePreview ? activeRangePreview.y : (selectedTowerCoords ? selectedTowerCoords.y : null);

    activeRangePreview = null;
    updateHeroAbilityRangePreview();
    updateGridRangeOverlay();

    if (prevX !== null && prevY !== null) {
        const towerCell = window.lastReceivedState?.grid?.[prevY]?.[prevX];
        if (towerCell && GAME_DATA.towers[towerCell.type]) openTowerModal(prevX, prevY, towerCell);
    }
};

window.closeTowerModal = function() {
    const modal = document.getElementById('tower-modal-backdrop');
    if (modal) modal.style.display = 'none';
    const bar = document.getElementById('range-preview-bar');
    if (bar) bar.style.display = 'none';
    selectedTowerCoords = null;
    activeRangePreview = null;
    updateHeroAbilityRangePreview();
    updateGridRangeOverlay();
};

window.upgradeCurrentTower = function(targetType) {
    if (!selectedTowerCoords) return;
    socket.send(JSON.stringify({ 
        type: 'UPGRADE_TOWER', 
        x: selectedTowerCoords.x, 
        y: selectedTowerCoords.y,
        targetType: targetType
    }));
    closeTowerModal();
};

window.requestDemolishCurrentTower = function() {
    if (!selectedTowerCoords) return;
    socket.send(JSON.stringify({ 
        type: 'REQUEST_DEMOLISH', 
        x: selectedTowerCoords.x, 
        y: selectedTowerCoords.y 
    }));
    closeTowerModal();
};

window.buyTowerUpgrade = function(upgradeId) {
    if (!selectedTowerCoords) return;
    socket.send(JSON.stringify({ 
        type: 'BUY_TOWER_UPGRADE', 
        x: selectedTowerCoords.x, 
        y: selectedTowerCoords.y,
        upgradeId: upgradeId
    }));
    closeTowerModal();
};

window.voteDemolish = function(agree) {
    socket.send(JSON.stringify({ type: 'VOTE_DEMOLISH', vote: agree }));
};

window.cancelDemolish = function() {
    socket.send(JSON.stringify({ type: 'CANCEL_DEMOLISH' }));
};

window.voteTowerRoster = function(agree) {
    socket.send(JSON.stringify({ type: 'VOTE_TOWER_ROSTER', vote: agree }));
};

window.cancelTowerRosterVote = function() {
    socket.send(JSON.stringify({ type: 'CANCEL_TOWER_ROSTER_VOTE' }));
};

// --- МОДАЛЬНОЕ ОКНО ПЕРВИЧНОГО СТРОИТЕЛЬСТВА НА ПУСТОМ СЛОТЕ ---
let selectedBuildSlot = null;

window.openBuildModal = function(x, y) {
    selectedBuildSlot = { x, y };
    const modal = document.getElementById('build-modal-backdrop');
    const titleEl = document.getElementById('bm-title');
    const listEl = document.getElementById('bm-cards-list');
    if (!modal || !listEl) return;

    titleEl.innerText = "🏗️ " + _tr("Build tower") + " (" + x + ", " + y + ")";
    listEl.innerHTML = '';

    let currentGold = (window.lastReceivedState && window.lastReceivedState.gold !== undefined) ? window.lastReceivedState.gold : 0;
    const baseTowers = TOWER_RULES.getSelectedTypes(window.lastReceivedState || {}, GAME_DATA.towers);
    if (!baseTowers.length) listEl.textContent = _tr('The team roster is empty. Select tower types during preparation.');

    baseTowers.forEach(tKey => {
        const proto = window.GAME_DATA && GAME_DATA.towers && GAME_DATA.towers[tKey];
        if (!proto) return;

        const pName = _tr(proto.name);
        const pShort = _tr(proto.shortName || '');
        const pDesc = proto.description ? _tr(proto.description) : '';

        const btn = document.createElement('button');
        btn.className = 'btn';
        btn.style.marginTop = '0';
        btn.style.padding = '10px';
        btn.style.fontSize = '12px';
        btn.style.textAlign = 'left';

        let canAfford = currentGold >= proto.cost;
        if (canAfford) {
            btn.style.background = '#ffcc00';
            btn.style.color = '#111';
            let descHtml = pDesc ? "<div style='font-size:10px; font-weight:normal; opacity:0.85; margin-top:3px; line-height:1.2;'>" + escapeHtml(pDesc) + "</div>" : "";
            btn.innerHTML = "<div style='display:flex; justify-content:space-between; align-items:center;'><span style='font-weight:bold; font-size:13px;'>" + escapeHtml(pShort + " " + pName) + "</span><b style='background:#111; color:#ffcc00; padding:2px 8px; border-radius:4px; font-size:12px;'>" + proto.cost + "💰</b></div>" + descHtml;
            btn.onclick = function() {
                socket.send(JSON.stringify({ type: 'BUILD_TOWER', x: x, y: y, towerType: tKey }));
                closeBuildModal();
            };
        } else {
            btn.disabled = true;
            btn.style.background = '#32363d';
            btn.style.color = '#888';
            btn.innerHTML = "<div style='display:flex; justify-content:space-between; align-items:center;'><span style='font-weight:bold; font-size:13px; color:#aaa;'>" + escapeHtml(pShort + " " + pName) + "</span><b style='color:#bbb;'>" + proto.cost + "💰</b></div>" +
                            "<div style='font-size:10px; color:#ff8a80; margin-top:2px;'>❌ " + _tr('Need') + " " + (proto.cost - currentGold) + "💰 " + _tr('in treasury') + "</div>";
        }
        btn.onmouseenter = function() {
            activeRangePreview = {
                x: x,
                y: y,
                range: proto.range || 3,
                metric: 'euclidean',
                type: 'tower'
            };
            updateGridRangeOverlay();
        };
        listEl.appendChild(btn);
    });

    activeRangePreview = {
        x: x,
        y: y,
        range: 3,
        metric: 'euclidean',
        type: 'tower'
    };
    updateGridRangeOverlay();

    modal.style.display = 'flex';
    if (typeof window !== 'undefined' && window.KR_I18N && typeof window.KR_I18N.translateDOM === 'function') {
        window.KR_I18N.translateDOM(modal, window.KR_I18N.getLang());
    }
};

window.closeBuildModal = function() {
    const modal = document.getElementById('build-modal-backdrop');
    if (modal) modal.style.display = 'none';
    selectedBuildSlot = null;
    activeRangePreview = null;
    updateHeroAbilityRangePreview();
    updateGridRangeOverlay();
};

window.startRallySelection = function() {
    if (!selectedTowerCoords) return;
    rallyTowerCoords = { x: selectedTowerCoords.x, y: selectedTowerCoords.y };
    isSelectingRally = true;
    closeTowerModal();

    const banner = document.getElementById('rally-mode-banner');
    if (banner) banner.style.display = 'flex';

    if (window.lastReceivedState) {
        renderGridAndUI(window.lastReceivedState);
    }
};

window.cancelRallySelection = function() {
    isSelectingRally = false;
    rallyTowerCoords = null;
    const banner = document.getElementById('rally-mode-banner');
    if (banner) banner.style.display = 'none';

    if (window.lastReceivedState) {
        renderGridAndUI(window.lastReceivedState);
    }
};

window.cellClick = function(x, y) {
    if (!window.lastReceivedState || !window.lastReceivedState.grid) return;
    if (mapMode === 'journal') return;
    let targetCell = window.lastReceivedState.grid[y][x];

    // Если был активен полноэкранный просмотр радиуса башни, клик по карте возвращает в модалку башни
    if (activeRangePreview && activeRangePreview.isMapPreview) {
        closeTowerRangePreview();
        return;
    }

    // 1. Если игрок в режиме выбора точки сбора для казармы (Rally Point)
    if (isSelectingRally && rallyTowerCoords) {
        let towerCell = window.lastReceivedState.grid[rallyTowerCoords.y][rallyTowerCoords.x];
        let tProto = window.GAME_DATA && GAME_DATA.towers && GAME_DATA.towers[towerCell.type];
        let maxRange = tProto ? tProto.range : 2;

        let dist = Math.max(Math.abs(x - rallyTowerCoords.x), Math.abs(y - rallyTowerCoords.y));
        let isRoad = (targetCell.type === 'road' || targetCell.type === 'spawn' || targetCell.type === 'castle');

        if (!isRoad) {
            alert('🚩 Soldier rally points can ONLY be placed on roads!');
            return;
        }
        if (dist > maxRange) {
            alert('🚩 Cell too far! Maximum radius from barracks: ' + maxRange + ' cells');
            return;
        }

        socket.send(JSON.stringify({
            type: 'SET_RALLY_POINT',
            towerX: rallyTowerCoords.x,
            towerY: rallyTowerCoords.y,
            rallyX: x,
            rallyY: y
        }));
        cancelRallySelection();
        return;
    }

    if (mapMode === 'action') {
        if (!activeAbility || !requiresBattleTarget()) return;
        battleTargets = getAvailableBattleTargets(window.lastReceivedState);
        const targets = battleTargets.filter(t => t.x === x && t.y === y);
        targetCellFocus = { x, y };
        selectedBattleTarget = targets.length === 1 ? targets[0].id : '';
        renderBattleControls();
        if (!targets.length) document.getElementById('map-mode-hint').textContent = 'This cell is unavailable for the selected ability. Select a highlighted target.';
        updateGridRangeOverlay();
        return;
    }

    // 2. Если кликнули по пустому слоту постройки — открываем карточку выбора башни!
    if (targetCell.type === 'slot') {
        openBuildModal(x, y);
        return;
    }

    // 3. Если кликнули по уже построенной башне — открываем меню действий (апгрейд, точка сбора, снос)
    if (window.GAME_DATA && GAME_DATA.towers && targetCell.type in GAME_DATA.towers) {
        openTowerModal(x, y, targetCell);
        return;
    }

    if (mapMode === 'build') return;

    const me = window.lastReceivedState.players[myId];
    if (!canMoveHeroTo(window.lastReceivedState, me, x, y)) return;

    // 4. Если обычная клетка — шаг героя (только если координата отличается от текущей!)
    if (window.myPlayerName && window.lastReceivedState && window.lastReceivedState.players) {
        let myHero = window.lastReceivedState.players[myId];
        if (myHero && myHero.x === x && myHero.y === y) {
            return; // Игнорируем клик по собственной клетке, чтобы не сжигать ход!
        }
    }
    if (me.x !== x || me.y !== y) socket.send(JSON.stringify({ type: 'MOVE_HERO', x: x, y: y }));
};



window.attack = function() {
    const state = window.lastReceivedState;
    const me = state?.players[myId];
    if (mapMode !== 'action' || getActionBlockReason(me)) return;
    const target = requiresBattleTarget() ? getAvailableBattleTargets(state).find(t => t.id === selectedBattleTarget) : { id: '-1' };
    if (!target || socket.readyState !== WebSocket.OPEN) { updateBattleTargets(); return; }
    const t = target.id;
    const maxDice = getBattleDiceSides();
    const d = Math.floor(Math.random() * maxDice) + 1;
    let targetVal = (!isNaN(parseInt(t)) && String(parseInt(t)) === t) ? parseInt(t) : t;
    actionPending = true;
    socket.send(JSON.stringify({ type: 'PLAYER_ACTION', ability: activeAbility, targetId: targetVal, dice: d }));
    selectedBattleTarget = '';
    targetCellFocus = null;
    updateBattleTargets();
};

// --- УПРАВЛЕНИЕ МАСШТАБОМ КАРТЫ (ZOOM / PAN ДЛЯ МОБИЛЬНЫХ) ---
let currentZoomScale = 1.0;
let autoFitMap = false;
let minimumFitScale = 0.8;
let centerMapOnFirstState = true;
window.changeMapZoom = function(delta) {
    autoFitMap = false;
    currentZoomScale = Math.min(1.8, Math.max(0.15, currentZoomScale + delta));
    applyMapZoom();
};
window.resetMapZoom = function() {
    autoFitMap = false;
    currentZoomScale = 1.0;
    applyMapZoom();
};
window.fitMapToView = function() {
    autoFitMap = true;
    minimumFitScale = 0.1;
    applyMapZoom();
};
window.focusHeroOnMap = function() {
    autoFitMap = false;
    currentZoomScale = Math.max(1, currentZoomScale);
    applyMapZoom();
    centerMapOnHero();
};
function centerMapOnHero() {
    const me = window.lastReceivedState?.players[myId];
    if (!me) return;
    const container = document.getElementById('p-map-container');
    const step = PLAYER_CELL_SIZE + PLAYER_CELL_GAP;
    container.scrollLeft = (me.x * step + PLAYER_CELL_SIZE / 2) * currentZoomScale - container.clientWidth / 2 + 12;
    container.scrollTop = (me.y * step + PLAYER_CELL_SIZE / 2) * currentZoomScale - container.clientHeight / 2 + 12;
}
function applyMapZoom() {
    const gridEl = document.getElementById('p-grid');
    const zoomValEl = document.getElementById('zoom-level-val');
    const surface = document.getElementById('map-surface');
    const container = document.getElementById('p-map-container');
    const state = window.lastReceivedState;
    const step = PLAYER_CELL_SIZE + PLAYER_CELL_GAP;
    const width = (state?.gridWidth || state?.grid?.[0]?.length || 16) * step - PLAYER_CELL_GAP;
    const height = (state?.gridHeight || state?.grid?.length || 16) * step - PLAYER_CELL_GAP;
    if (autoFitMap && container.clientWidth && container.clientHeight) {
        currentZoomScale = Math.max(minimumFitScale, Math.min(1.4, (container.clientWidth - 26) / width, (container.clientHeight - 26) / height));
    }
    if (gridEl) {
        gridEl.style.transform = 'scale(' + currentZoomScale + ')';
        document.getElementById('combat-text-layer').style.transform = gridEl.style.transform;
        gridEl.style.setProperty('--range-zoom', String(currentZoomScale));
    }
    if (surface) { surface.style.width = width * currentZoomScale + 'px'; surface.style.height = height * currentZoomScale + 'px'; }
    if (zoomValEl) zoomValEl.innerText = Math.round(currentZoomScale * 100) + '%';
    if (centerMapOnFirstState && state?.players[myId] && container.clientHeight) {
        centerMapOnFirstState = false;
        centerMapOnHero();
    }
}

window.leaveCharacter = function() {
    if (confirm("Leave and recreate your character? Your current hero will be removed from the map.")) {
        if (myId) {
            socket.send(JSON.stringify({ type: 'PLAYER_LEAVE', name: myId }));
        }
        try {
            localStorage.removeItem('kr_player_id');
            localStorage.removeItem('kr_character');
        } catch(e) {}
        window.location.reload();
    }
};

applyMapZoom();
new ResizeObserver(() => applyMapZoom()).observe(document.getElementById('p-map-container'));

socket.onopen = function() {
    let savedId = null;
    try { savedId = localStorage.getItem('kr_player_id'); } catch(e) {}
    if (savedId) {
        myId = savedId;
        try {
            let savedChar = JSON.parse(localStorage.getItem('kr_character') || '{}');
            if (savedChar && savedChar.heroKey) {
                character = savedChar;
                if (window.GAME_DATA && window.GAME_DATA.heroes && window.GAME_DATA.heroes[character.heroKey]) {
                    activeHeroSkillsPool = window.GAME_DATA.heroes[character.heroKey].skills;
                }
            }
        } catch(e) {}
        // Автоматически переподключаемся под своим сохранённым персонажем
        socket.send(JSON.stringify({ type: 'REGISTER_PLAYER', name: myId, heroName: character.heroName, sen: character.sen, stats: character.stats, skills: character.skills }));
    }
};
socket.onclose = function() {
    actionPending = false;
    if (window.lastReceivedState) renderBattleControls();
};

socket.onmessage = function(e) {
    const rawData = JSON.parse(e.data);
    if (rawData.type === 'CATALOG_UPDATE') {
        Object.assign(window.GAME_DATA,rawData.catalog);
        if (window.lastReceivedState) renderGridAndUI(window.lastReceivedState);
        return;
    }
    if (rawData.type === 'COMMAND_ERROR') { actionPending = false; updateBattleTargets(); alert(rawData.message); return; }
    if (rawData.type === 'KICKED') {
        alert(rawData.message || 'Your character was removed by the GM.');
        try {
            localStorage.removeItem('kr_player_id');
            localStorage.removeItem('kr_character');
        } catch(e) {}
        window.location.reload();
        return;
    }
    if (!rawData.state) return;
    actionPending = false;
    window.lastReceivedState = rawData.state;
    if (typeof TOWER_CATALOG_DATA !== 'undefined' && window.GAME_DATA?.towers) {
        Object.assign(window.GAME_DATA.towers, TOWER_CATALOG_DATA.TOWERS);
    }
    const state = rawData.state;
    renderGridAndUI(state);
    if (rawData.combatReset) combatText.clear();
    combatText.show(rawData.combatEvents, state);
};

function renderHealthToken(unit, label, classes, positionStyle, fillColor, statuses = [], kind = '', id = '') {
    const hp = Number.isFinite(Number(unit.hp)) ? Math.max(0, Number(unit.hp)) : 0;
    const maxHp = Number.isFinite(Number(unit.maxHp)) && Number(unit.maxHp) > 0 ? Number(unit.maxHp) : Math.max(1, hp);
    const percent = Math.min(100, hp / maxHp * 100);
    const description = (unit.heroName || unit.name || label) + ' · HP ' + hp + '/' + maxHp +
        (statuses.length ? ' · ' + UNIT_STATUSES.describe(statuses) : '');
    const colorStyle = fillColor ? '--token-fill:' + escapeBattleText(fillColor) + ';' : '';
    const effects = UNIT_STATUSES.renderEdges(statuses, kind, id);
    return '<div class="p-token health-token ' + classes + '" style="--hp-fill:' + percent + '%;' + colorStyle + positionStyle +
        '" data-unit-kind="' + escapeBattleText(kind) + '" data-unit-id="' + escapeBattleText(id) +
        '" role="group" aria-label="' + escapeBattleText(description) + '" title="' + escapeBattleText(description) + '">' +
        '<span class="token-label">' + effects.left + '<span class="token-name">' + escapeBattleText(label) + '</span>' +
        effects.right + '</span></div>';
}

window.renderGridAndUI = function(state) {
    if (!state) return;
    const progressPanel=document.getElementById('scene-progress-panel');
    if(progressPanel && typeof renderSceneProgress === 'function') {
        const progress=state.sceneProgress;
        progressPanel.hidden=!progress || (!progress.outcome && !progress.goals.length && !progress.counters.length);
        document.getElementById('scene-progress-round').textContent='round '+(progress?.round || 0);
        renderSceneProgress(document.getElementById('scene-progress-content'),progress);
    }
    syncBattleTurnSelection(state);
    const sceneNotesPanel = document.getElementById('revealed-scene-panel');
    if (sceneNotesPanel && typeof renderRevealedSceneNotes === 'function') {
        sceneNotesPanel.hidden = !(state.revealedNotes || []).length;
        renderRevealedSceneNotes(document.getElementById('revealed-scene-notes'),state.revealedNotes || []);
    }
    const statusIndex = UNIT_STATUSES.buildIndex(state);
    const me = state.players[myId];
    if (me) {
        document.getElementById('hero-name').textContent = me.heroName;
        const abilitiesChanged = character.heroKey !== me.heroKey || JSON.stringify(character.skills) !== JSON.stringify(me.skills);
        character = { heroKey: me.heroKey, heroName: me.heroName, sen: me.sen, stats: me.stats, skills: [...me.skills] };
        activeHeroSkillsPool = window.GAME_DATA.heroes[me.heroKey].skills;
        try { localStorage.setItem('kr_character', JSON.stringify(character)); } catch(e) {}
        if (abilitiesChanged && document.getElementById('screen-game').classList.contains('active')) renderBattleAbilitiesButtons();
        if (me.hasAttackedThisRound && ['spell_blink', 'spell_mines'].includes(activeAbility)) clearBattleAbilitySelection();
    }

    // Если игрок был зарегистрирован и есть на сервере, переключаем экран на игру
    if (me && document.getElementById('screen-login').classList.contains('active')) {
        document.getElementById('screen-login').classList.remove('active');
        document.getElementById('screen-game').classList.add('active');
        renderBattleAbilitiesButtons();
    }

    // Период, текущий ход и волна в компактном заголовке.
    const phaseTitle = document.getElementById('phase-title');
    const waveBadge = document.getElementById('phase-wave-badge');
    if (waveBadge) waveBadge.innerText = 'Wave ' + (state.wave || 1);

    if (state.gamePeriod === 'preparation') {
        if (phaseTitle) {
            phaseTitle.style.color = '#ffcc00';
            phaseTitle.innerText = '🛠 Preparation';
        }
    } else if (state.phase === 'wave') {
        if (phaseTitle) {
            phaseTitle.style.color = '#ff5252';
            phaseTitle.innerText = '👾 Play · enemy turn';
        }
    } else {
        if (phaseTitle) {
            phaseTitle.style.color = '#00e676';
            phaseTitle.innerText = '🛡 Play · hero turn';
        }
    }

    if (me) {
        let hpText = me.hp <= 0 ? 'FALLEN' : me.hp + '/' + me.maxHp;
        if (me.shieldHp && me.shieldHp > 0) hpText += ' (+' + me.shieldHp + '🛡️)';
        document.getElementById('s-hp').innerText = hpText;
        const sArmorEl = document.getElementById('s-armor');
        if (sArmorEl) sArmorEl.innerText = (me.armor || 0) + '%';
        document.getElementById('s-mana').innerText = me.mana + '/' + me.maxMana;
        document.getElementById('s-spd').innerText = state.gamePeriod === 'preparation' ? 'Free' :
            me.hasMovedThisRound ? '❌ 0 cells' : (me.speed + (me.speedBonus || 0)) + ' cells';
        if (selectedTowerCoords) updateTowerDemolishButton(state.grid[selectedTowerCoords.y]?.[selectedTowerCoords.x], state);
        document.getElementById('s-base').innerText = state.baseHp;

        const teamGoldEl = document.getElementById('team-gold-val');
        if (teamGoldEl) teamGoldEl.innerText = (state.gold !== undefined) ? state.gold : 0;

        // ОБРАБОТКА ОКНА ГОЛОСОВАНИЯ ЗА СНОС БАШНИ
        const dvModal = document.getElementById('demolish-vote-backdrop');
        if (state.demolishVote) {
            const dv = state.demolishVote;
            const dvInfo = document.getElementById('dv-info');
            const dvStatus = document.getElementById('dv-status');
            const dvActions = document.getElementById('dv-actions');

            let allPlayers = Object.keys(state.players);
            let approvedCount = Object.keys(dv.votes || {}).filter(k => dv.votes[k] === true).length;
            let myVoted = dv.votes && dv.votes[myId] === true;

            if (dvInfo) {
                dvInfo.innerHTML = "Player <b style='color:#ffcc00;'>" + dv.initiator + "</b> proposes demolishing tower <b style='color:#fff;'>" + dv.towerName + "</b> at cell (" + dv.towerX + ", " + dv.towerY + ").<br>" +
                    "💰 Gold refunded to treasury: <b style='color:#00e676;'>+" + dv.refundGold + " coins</b>";
            }

            if (dvStatus) {
                dvStatus.innerText = "Approved: " + approvedCount + " of " + allPlayers.length + " players (unanimous approval required)";
            }

            if (dvActions) {
                let actionsHtml = "";
                if (!myVoted) {
                    actionsHtml += "<button class='btn' style='background:#00e676; color:#111; font-weight:bold; margin-top:0;' onclick='voteDemolish(true)'>✅ APPROVE DEMOLITION</button>";
                    actionsHtml += "<button class='btn' style='background:#d32f2f; color:#fff; font-weight:bold; margin-top:4px;' onclick='voteDemolish(false)'>❌ REJECT (KEEP TOWER)</button>";
                } else {
                    actionsHtml += "<div style='color:#aaa; font-size:12px; text-align:center; padding:8px; background:#1c2024; border-radius:4px;'>⏳ You approved demolition. Waiting for the other allies...</div>";
                }

                if (dv.initiator === myId) {
                    actionsHtml += "<button class='btn' style='background:#444; color:#fff; font-size:11px; margin-top:6px; padding:6px;' onclick='cancelDemolish()'>Cancel my demolition request</button>";
                }
                dvActions.innerHTML = actionsHtml;
            }

            if (dvModal) dvModal.style.display = 'flex';
        } else {
            if (dvModal) dvModal.style.display = 'none';
        }

        // ОБРАБОТКА ОКНА ГОЛОСОВАНИЯ ЗА АРСЕНАЛ БАШЕН
        const rvModal = document.getElementById('roster-vote-backdrop');
        if (state.rosterVote) {
            const rv = state.rosterVote;
            const rvInfo = document.getElementById('rv-info');
            const rvStatus = document.getElementById('rv-status');
            const rvActions = document.getElementById('rv-actions');

            const allPlayers = Object.keys(state.players);
            const approvedCount = Object.keys(rv.votes || {}).filter(k => rv.votes[k] === true).length;
            const myVoted = rv.votes && rv.votes[myId] === true;
            const towerNames = (rv.proposedTypes || []).map(t => (GAME_DATA.towers[t]?.name || t)).join(', ');

            if (rvInfo) {
                rvInfo.innerHTML = "Player <b style='color:#60a5fa;'>" + rv.initiator + "</b> proposes a team tower arsenal:<br>" +
                    "<div style='margin-top:6px; padding:6px 8px; background:#0d131f; border-radius:4px; font-size:12px; color:#cbd5e1; border:1px solid #23334d;'>" +
                    "🏰 <b>" + towerNames + "</b></div>";
            }

            if (rvStatus) {
                rvStatus.innerText = "Approved: " + approvedCount + " of " + allPlayers.length + " players (unanimous approval required)";
            }

            if (rvActions) {
                let actionsHtml = "";
                if (!myVoted) {
                    actionsHtml += "<button class='btn' style='background:#10b981; color:#fff; font-weight:bold; margin-top:0;' onclick='voteTowerRoster(true)'>✅ APPROVE TOWER ROSTER</button>";
                    actionsHtml += "<button class='btn' style='background:#ef4444; color:#fff; font-weight:bold; margin-top:4px;' onclick='voteTowerRoster(false)'>❌ REJECT PROPOSAL</button>";
                } else {
                    actionsHtml += "<div style='color:#aaa; font-size:12px; text-align:center; padding:8px; background:#1c2024; border-radius:4px;'>⏳ You approved the selection. Waiting for the other allies...</div>";
                }

                if (rv.initiator === myId) {
                    actionsHtml += "<button class='btn' style='background:#475569; color:#fff; font-size:11px; margin-top:6px; padding:6px;' onclick='cancelTowerRosterVote()'>Cancel my proposal</button>";
                }
                rvActions.innerHTML = actionsHtml;
            }

            if (rvModal) rvModal.style.display = 'flex';
        } else {
            if (rvModal) rvModal.style.display = 'none';
        }

        // Вывод боевого журнала на экран игрока
        const pLogBox = document.getElementById('player-log-box');
        if (pLogBox && state.log) {
            let logHtml = "";
            for (let i = 0; i < Math.min(state.log.length, 15); i++) {
                logHtml += "<div style='margin-bottom:3px; border-bottom:1px solid #1a1c1e;'>" + escapeBattleText(window.KR_I18N ? window.KR_I18N.t(state.log[i].text) : state.log[i].text) + "</div>";
            }
            pLogBox.innerHTML = logHtml;
        }
        
        // Перерисовываем надписи и блокировку на кнопках под воздействием КД
        if (!me.cooldowns) me.cooldowns = {};
        
        // Обновление состояния кнопки Завершить ход
        const readyBtn = document.getElementById('btn-toggle-ready');
        if (readyBtn) {
            if (me.isReady) {
                readyBtn.style.background = '#2e7d32';
                readyBtn.style.color = '#fff';
                readyBtn.innerHTML = '<span>✓ Ready · cancel</span>';
            } else {
                readyBtn.style.background = '#ffcc00';
                readyBtn.style.color = '#111';
                readyBtn.innerHTML = '<span>✅ End turn</span>';
            }
            readyBtn.classList.toggle('is-ready', !!me.isReady);
        }
    }

    if (!activeRangePreview || activeRangePreview.type === 'skill') {
        updateHeroAbilityRangePreview();
    }

    const g = document.getElementById('p-grid'); g.innerHTML = '';
    const gw = state.gridWidth || (state.grid[0] ? state.grid[0].length : 16);
    const gh = state.gridHeight || state.grid.length;
    const mapTitleLabel = document.getElementById('map-title-label');
    if (mapTitleLabel) mapTitleLabel.innerText = "🗺️ Map " + gw + "×" + gh + " (drag/scroll)";
    g.style.gridTemplateColumns = "repeat(" + gw + ", " + PLAYER_CELL_SIZE + "px)";
    g.style.gridTemplateRows = "repeat(" + gh + ", " + PLAYER_CELL_SIZE + "px)";

    // Радиус сбора для подсвечивания клеток, если активен режим установки
    let rallyRange = 2;
    if (isSelectingRally && rallyTowerCoords) {
        let tCell = (state.grid[rallyTowerCoords.y] && state.grid[rallyTowerCoords.y][rallyTowerCoords.x]);
        let tProto = tCell && window.GAME_DATA && GAME_DATA.towers && GAME_DATA.towers[tCell.type];
        if (tProto) rallyRange = tProto.range;
    }

    for (let y = 0; y < gh; y++) {
        for (let x = 0; x < gw; x++) {
            const c = (state.grid[y] && state.grid[y][x]) ? state.grid[y][x] : { type: 'empty' };
            const cEl = document.createElement('div');
            cEl.dataset.x = x;
            cEl.dataset.y = y;
            let cellClass = 'cell ' + c.type;

            // Подсветка допустимых клеток для точки сбора казармы
            if (isSelectingRally && rallyTowerCoords) {
                let dist = Math.max(Math.abs(x - rallyTowerCoords.x), Math.abs(y - rallyTowerCoords.y));
                let isRoad = (c.type === 'road' || c.type === 'spawn' || c.type === 'castle');
                if (isRoad && dist <= rallyRange) {
                    cellClass += ' rally-allowed';
                }
            }

            // Подсветка дальности способностей героев и атак башен
            if (activeRangePreview && activeRangePreview.x !== undefined && activeRangePreview.y !== undefined) {
                let inRange = false;
                if (activeRangePreview.metric === 'euclidean') {
                    inRange = Math.hypot(x - activeRangePreview.x, y - activeRangePreview.y) <= (activeRangePreview.range + 0.05);
                } else {
                    inRange = Math.max(Math.abs(x - activeRangePreview.x), Math.abs(y - activeRangePreview.y)) <= activeRangePreview.range;
                }
                if (activeRangePreview.isMapPreview && x === activeRangePreview.x && y === activeRangePreview.y) {
                    cellClass += ' tower-preview-origin';
                }
                if (inRange) {
                    cellClass += (activeRangePreview.type === 'tower' ? ' range-tower' : ' range-skill');
                    if (activeRangePreview.isMapPreview) {
                        cellClass += ' cell-in-range';
                    }
                }
            }

            cEl.className = cellClass;
            cEl.setAttribute('onclick', 'cellClick(' + x + ',' + y + ')');
            cEl.innerHTML = "<span class='coords'>" + x + "," + y + "</span>";
            if ((state.mines || []).some(mine => mine.x === x && mine.y === y)) {
                cEl.innerHTML += "<span title='Bolin’s mine' style='position:absolute; bottom:1px; left:1px; font-size:12px; z-index:6; pointer-events:none;'>💣</span>";
            }
            
            // Враги
            let cellEnemies = state.enemies.filter(en => en.x === x && en.y === y && en.hp > 0);
            cellEnemies.forEach((enemy, idx) => {
                var enemyProto = (window.GAME_DATA && GAME_DATA.enemies && GAME_DATA.enemies[enemy.type]) || { color: '#2e7d32', shortName: enemy.name.substring(0,3) };
                var isSheep = enemy.isPolymorphed || (enemy.polymorphTurns > 0);
                var bgCol = isSheep ? '#ffffff' : enemyProto.color;
                var dispText = enemyProto.shortName;
                cEl.innerHTML += renderHealthToken({ ...enemy, maxHp: enemy.maxHp || enemyProto.maxHp }, dispText,
                    'enemy-tok' + (isSheep ? ' sheep-tok' : ''), 'bottom:' + (2 + idx * 16) + 'px;z-index:' + (10 + idx) + ';', bgCol,
                    statusIndex.get(enemy), 'enemy', enemy.id);
            });

            // Солдаты гарнизона
            let cellSoldiers = (state.soldiers || []).filter(s => s.x === x && s.y === y && s.hp > 0 && s.respawnTimer === 0);
            cellSoldiers.forEach((soldier, sIdx) => {
                let bottomOffset = 2 + ((cellEnemies.length + sIdx) * 16);
                let sLabel = soldier.isBoneKnight ? '⚔️💀' : (soldier.isSkeleton ? '💀' : (soldier.isGolem ? 'Gol' : (soldier.towerType && soldier.towerType.startsWith('dwarf') ? '⛏️' : 'Sol')));
                cEl.innerHTML += renderHealthToken(soldier, sLabel, 's-tok', 'bottom:' + bottomOffset + 'px;', null,
                    statusIndex.get(soldier), 'soldier', soldier.id);
            });

            // Герои
            let heroIdx = 0;
            Object.keys(state.players).forEach(k => {
                const p = state.players[k];
                if (p.x === x && p.y === y) {
                    let topPos = 2 + (heroIdx * 16);
                    let myClass = k === myId ? 'my-tok' : '';
                    const fallen = p.hp <= 0;
                    cEl.innerHTML += renderHealthToken(p, (fallen ? '🪦' : '') + p.heroName.substring(0, 3), 'h-tok ' + myClass + (fallen ? ' fallen-tok' : ''), 'top:' + topPos + 'px;', null,
                        statusIndex.get(p), 'player', k);
                    heroIdx++;
                }
            });

            // Значок башни
            if (window.GAME_DATA && GAME_DATA.towers && c.type in GAME_DATA.towers) {
                var tow = GAME_DATA.towers[c.type];
                if (tow) cEl.innerHTML += renderTowerMapBadge(tow);
                    // Dwarven Mine status
                    if (c.type.startsWith('dwarf_')) {
                        let towerKey = x + ',' + y;
                        let dSoldiers = (state.soldiers || []).filter(s => s.towerKey === towerKey && s.hp > 0 && s.respawnTimer === 0);
                        let inMineCount = dSoldiers.filter(s => s.inMine).length;
                        let hasDeepMine = (c.upgrades || []).includes('dwarf_deep_mine');
                        if (inMineCount > 0) {
                            cEl.innerHTML += `<span class="dwarf-mine-badge" title="Dwarves in the mine face: ${inMineCount}/3 (+gold)">⛏️${inMineCount}/3</span>`;
                        } else if (dSoldiers.length > 0) {
                            if (hasDeepMine) {
                                cEl.innerHTML += `<span class="dwarf-mine-badge deep-mine" title="All dwarves in combat, but Deep Vein continues producing income!">💰Vein</span>`;
                            } else {
                                cEl.innerHTML += `<span class="dwarf-mine-badge mine-halted" title="All 3 dwarves entered combat on the road! Mining paused.">⛔Combat</span>`;
                            }
                        }
                    }

                    // Court Mage Magic Resonance
                    if (c.damageBuffTurns > 0 && c.damageBuffMultiplier > 1) {
                        cEl.classList.add('cell-magic-resonance');
                        cEl.innerHTML += `<span class="resonance-buff-badge" title="Magic Resonance: damage increased by 25% (turns remaining: ${c.damageBuffTurns})">🔮+25% (${c.damageBuffTurns}t)</span>`;
                    }
            }

            // Ядовитая трясина Некроманта
            if (state.poisonPuddles && state.poisonPuddles.some(pp => pp.x === x && pp.y === y)) {
                cEl.innerHTML += "<span title='Toxic mire (15 true DoT damage/turn)' style='position:absolute; bottom:1px; right:1px; font-size:10px; z-index:6; pointer-events:none;'>☠️</span>";
            }

            // Лужа напалма Большой Берты
            if (state.napalmPuddles && state.napalmPuddles.some(np => np.x === x && np.y === y)) {
                cEl.innerHTML += "<span title='Burning napalm pool (10 damage/turn)' style='position:absolute; bottom:1px; left:1px; font-size:10px; z-index:6; pointer-events:none;'>🔥</span>";
            }

            // Флажок точки сбора казармы или голема
            for (let ty = 0; ty < gh; ty++) {
                for (let tx = 0; tx < gw; tx++) {
                    let tc = state.grid[ty] && state.grid[ty][tx];
                    let isRallySource = tc && window.GAME_DATA && GAME_DATA.towers && tc.type in GAME_DATA.towers && 
                        (GAME_DATA.towers[tc.type].isBarracks || (tc.type === 'mage_sorcerer' && (tc.upgrades || []).includes('sorcerer_golem')));
                    if (isRallySource && tc.rallyPoint && tc.rallyPoint.x === x && tc.rallyPoint.y === y) {
                        let flagTitle = (tc.type === 'mage_sorcerer') ? 'Golem rally point' : 'Barracks rally point';
                        cEl.innerHTML += `<span title='${flagTitle}' style='position:absolute; top:1px; right:1px; font-size:9px; z-index:30; pointer-events:none; text-shadow:1px 1px 2px #000;'>🚩</span>`;
                    }
                }
            }

            // Necromancer Poison Mire
            let poisonPuddle = state.poisonPuddles && state.poisonPuddles.find(pp => pp.x === x && pp.y === y);
            if (poisonPuddle) {
                cEl.classList.add('cell-poison-mire');
                cEl.innerHTML += `<div class="poison-mire-overlay" title="Poison Mire: 15 DoT damage, poison for 2 turns (remaining: ${poisonPuddle.turns} rounds)">` +
                    `<span class="mire-bubble-1">🫧</span>` +
                    `<span class="mire-bubble-2">☠️</span>` +
                    `<span class="mire-counter">${poisonPuddle.turns}t</span>` +
                `</div>`;
            }

            // Recent Combat FX
            if (state.recentCombatFx && state.recentCombatFx.length > 0) {
                state.recentCombatFx.forEach(fx => {
                    let isTargetCell = (fx.toX !== undefined && fx.toX === x && fx.toY === y) ||
                                       (fx.toX === undefined && fx.x !== undefined && fx.x === x && fx.y === y);
                    if (isTargetCell) {
                        let fxClass = fx.type === 'blast_keg' ? 'combat-fx-blast' :
                                      fx.type === 'radiant_smite' ? 'combat-fx-smite' :
                                      fx.type === 'old_tome_shot' ? 'combat-fx-tome' :
                                      fx.type === 'dwarf_surprise' ? 'combat-fx-surprise' :
                                      fx.type === 'poison_mire' ? 'combat-fx-mire-cast' : 'combat-fx-blast';
                        let fxText = fx.text || '✨';
                        cEl.innerHTML += `<div class="combat-fx-banner ${fxClass}">${fxText}</div>`;
                    }
                });
            }

            g.appendChild(cEl);
        }
    }

    applyCoordsVisibility();

    updateBattleTargets(state);
    if (selectedBuildSlot && document.getElementById('build-modal-backdrop').style.display === 'flex') {
        openBuildModal(selectedBuildSlot.x, selectedBuildSlot.y);
    }
    applyMapZoom();
    unitStatusUI.refresh(state);
};

const unitStatusUI = UNIT_STATUSES.install(() => window.lastReceivedState);

// =========================================================================
// =========================================================================
// ВЫБОР И РАЗВИТИЕ БАШЕН КОМАНДЫ (НА ТЕМЕ KINGDOM RUSH)

window.openPreparationTowerMenu = function() {
    if (window.lastReceivedState?.gamePeriod !== 'preparation') return;
    if (typeof TOWER_CATALOG_DATA !== 'undefined' && window.GAME_DATA?.towers) {
        Object.assign(window.GAME_DATA.towers, TOWER_CATALOG_DATA.TOWERS);
    }
    if (!towerPreparationMenu) {
        towerPreparationMenu = TOWER_PREPARATION.createMenu({
            document,
            getState: () => window.lastReceivedState,
            getTowers: () => {
                const all = typeof TOWER_CATALOG_DATA !== 'undefined' ?
                    TOWER_CATALOG_DATA.getAllTowers(GAME_DATA.towers) : GAME_DATA.towers;
                return typeof TOWER_CATALOG_DATA !== 'undefined' ?
                    TOWER_CATALOG_DATA.getPlayerVisibleTowers(all) : all;
            },
            canChange: () => socket.readyState === WebSocket.OPEN,
            onToggle: (towerType, enabled) => socket.send(JSON.stringify({ type: 'SET_TOWER_TYPE', towerType, enabled })),
            onClose: () => document.getElementById('mode-build')?.focus?.()
        });
    }
    towerPreparationMenu.open();
};

function initPlayerEventListeners() {
    if (typeof document === 'undefined') return;
    const bind = (id, event, fn) => {
        const el = document.getElementById(id);
        if (el && el.addEventListener) el.addEventListener(event, fn);
    };
    bind('mode-action', 'click', () => setMapMode('action'));
    bind('mode-move', 'click', () => setMapMode('move'));
    bind('mode-build', 'click', () => setMapMode('build'));
    bind('mode-journal', 'click', () => setMapMode('journal'));
    bind('clear-target-btn', 'click', clearBattleTarget);
    bind('attack-main-btn', 'click', attack);
    bind('btn-toggle-ready', 'click', toggleReady);
    bind('tm-btn-range-preview', 'click', previewTowerRange);
    bind('tm-btn-rally', 'click', startRallySelection);
    bind('tm-btn-demolish', 'click', requestDemolishCurrentTower);
    const coordsToggle = document.getElementById('coords-toggle');
    if (coordsToggle && coordsToggle.addEventListener) {
        coordsToggle.addEventListener('change', function() { toggleCoordsDisplay(this.checked); });
    }
}
if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('DOMContentLoaded', initPlayerEventListeners);
}

if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') window.addEventListener('kr6:langchange', function() {
    if (typeof renderHeroList === 'function') renderHeroList();
    if (typeof renderSkillsBuilder === 'function') renderSkillsBuilder();
    if (typeof window.renderGrid === 'function' && window.lastReceivedState) {
        try { window.renderGrid(window.lastReceivedState); } catch(e) {}
    }
});
