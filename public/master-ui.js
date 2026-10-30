'use strict';
var _tr = typeof _tr !== 'undefined' ? _tr : (text => (typeof window !== 'undefined' && window.KR_I18N ? window.KR_I18N.t(text) : text));

var masterMode = 'battle';
var masterSelection = null;
var masterZoom = 1;
var masterFit = true;
var editorDirty = false;
var editorPlayer = null;
var lastHeroOptions = '';
var lastHistoryOptions = '';
const ui = id => document.getElementById(id);

function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}
function masterNotice(text, error = false) {
    ui('master-notice').textContent = text;
    ui('master-notice').classList.toggle('error', error);
    ui('master-notice').hidden = !text;
    if (lastState) requestAnimationFrame(applyMasterZoom);
}
function sendMaster(message) {
    if (socket.readyState !== WebSocket.OPEN) { masterNotice('No server connection. Refresh the page.', true); return false; }
    socket.send(JSON.stringify(message));
    return true;
}
function setGamePeriod(gamePeriod) {
    sendMaster({ type: 'MASTER_SET_GAME_PERIOD', gamePeriod });
}
function renderGamePeriod(state) {
    const preparation = state.gamePeriod === 'preparation';
    ['preparation', 'game'].forEach(period => {
        const button = ui('period-' + period);
        const active = period === (preparation ? 'preparation' : 'game');
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', String(active));
        button.disabled = active;
    });
    ui('game-period-hint').textContent = preparation ?
        'Free movement. Every move to a different cell fully restores the hero\'s HP, mana and abilities. Demolition refunds 100% of tower and upgrade investment.' :
        'Standard rules: one speed-limited move per round, normal mana costs and cooldowns. Demolition refunds 60% of the current tower level\'s price.';
    ui('btn-move-enemies').disabled = preparation;
    ui('btn-move-enemies').title = preparation ? 'Enable the play period to advance the wave' : '';
}
let isMasterPageUnloading = false;
if (typeof window !== 'undefined') window.addEventListener('beforeunload', () => { isMasterPageUnloading = true; });
socket.addEventListener('open', () => { ui('connection-status').textContent = _tr('· connected'); renderWaveDescription(); });
socket.addEventListener('close', () => {
    if (isMasterPageUnloading) return;
    ui('connection-status').textContent = _tr('· disconnected');
    masterNotice('Connection lost. Refresh the page after starting the server.', true);
});

function setMasterMode(mode) {
    masterMode = mode;
    ['battle', 'editor'].forEach(name => {
        ui('mode-' + name).classList.toggle('active', name === mode);
        ui('mode-' + name).setAttribute('aria-pressed', name === mode);
    });
    ui('map-editor').hidden = mode !== 'editor';
    cancelMapAction();
    if (mode === 'editor') changeActiveTool('road');
}
const originalChangeActiveTool = changeActiveTool;
changeActiveTool = function(tool) {
    originalChangeActiveTool(tool);
    const names = { empty: _tr('Grass'), road: _tr('Road'), spawn: _tr('Spawn'), castle: _tr('Castle'), slot: _tr('Tower slot'),
        'spawn-click': _tr('Spawn enemies: select a cell'), 'erase-enemy': _tr('Remove enemies: select a cell'), inspect: _tr('Select a hero, enemy or tower') };
    ui('map-action').textContent = names[tool] || _tr('Select a cell');
};
function cancelMapAction() { selectedHeroToMove = null; masterEnemyMove = null; masterEnemyArea = null; changeActiveTool('inspect'); }
function openMasterTool(name) {
    ['spawn','gold','hero','undo'].forEach(key => { ui('master-tool-' + key).hidden = key !== name; });
    document.querySelectorAll('[data-master-tool]').forEach(button => button.setAttribute('aria-pressed', button.dataset.masterTool === name));
    ui('close-master-tool').hidden = !name;
    const dialog = ui('master-tools-dialog');
    if (name && !dialog.open) dialog.showModal();
    if (!name && dialog.open) dialog.close();
    cancelMapAction();
    if (name === 'hero') loadHeroEditor(false);
    if (name === 'undo') showRollbackPreview();
    if (name === 'spawn') filterSpawnCatalog();
    if (name) ui('master-tool-' + name).querySelector('input, select, button')?.focus();
}
function armSpawn() {
    if (!ui('spawn-count').reportValidity()) return;
    selectedHeroToMove = null;
    changeActiveTool('spawn-click');
    ui('master-tools-dialog').close();
}
function armErase() { cancelMapAction(); changeActiveTool('erase-enemy'); ui('master-tools-dialog').close(); }
function addGold(amount) { sendMaster({ type: 'MASTER_ADD_GOLD', amount }); }
function grantGold() { if (ui('gold-amount').reportValidity()) addGold(Number(ui('gold-amount').value)); }
function setTreasury() {
    const amount = Number(ui('god-gold').value);
    if (Number.isSafeInteger(amount) && amount >= 0 && lastState) addGold(amount - lastState.gold);
    else masterNotice('Enter a non-negative integer amount of gold', true);
}

clickCell = function(x, y) {
    if (!lastState) return;
    if (typeof MASTER_ACTIVATED_EVENTS !== 'undefined' && MASTER_ACTIVATED_EVENTS.pickCell(x, y)) return;
    if (masterEnemyMove) {
        sendMaster({ type: 'MASTER_MANAGE_ENEMIES', action: 'move', ids: masterEnemyMove, x, y });
        masterEnemyMove = null; cancelMapAction(); return;
    }
    if (selectedHeroToMove) {
        sendMaster({ type: 'MOVE_HERO', playerName: selectedHeroToMove, x, y });
        cancelMapAction(); return;
    }
    if (currentTool === 'spawn-click') {
        const message = { type: 'MASTER_SPAWN_ENEMY', enemyType: ui('active-spawn-type').value,
            count: Number(ui('spawn-count').value), x, y };
        if (sendMaster(message)) { lastMasterSpawn = message; ui('repeat-spawn').disabled = false; cancelMapAction(); }
        return;
    }
    if (currentTool === 'erase-enemy') {
        sendMaster({ type: 'MASTER_ERASE_ENEMY', x, y }); cancelMapAction(); return;
    }
    if (masterEnemyArea) { selectEnemyAreaCorner(x, y); return; }
    if (masterMode === 'editor' && currentTool !== 'inspect') {
        sendMaster({ type: 'MASTER_EDIT_CELL', x, y, cellType: currentTool }); return;
    }
    masterSelection = { type: 'cell', x, y };
    setInspectorTab('object');
    renderSelectedObject();
};
function selectMasterHero(name) { masterHeroPreview = null; masterSelection = { type: 'hero', name }; setInspectorTab('object'); renderSelectedObject(); }
function objectRow(label, value) { return '<div class="object-row"><span>' + escapeHTML(label) + '</span><b>' + escapeHTML(value) + '</b></div>'; }
function objectButton(label, action, danger = false) {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = label;
    if (danger) button.className = 'danger-outline';
    button.onclick = action; return button;
}
function renderSelectedObject() {
    const box = ui('selected-object');
    if (!activeMasterTower) {
        const selectedCell = masterSelection?.type === 'cell' ? lastState?.grid?.[masterSelection.y]?.[masterSelection.x] : null;
        const tower = GAME_DATA.towers[selectedCell?.type];
        const hero = masterSelection?.type === 'hero' ? lastState?.players[masterSelection.name] : null;
        const preview = hero && masterHeroPreview ? getMasterHeroRange(hero, masterHeroPreview) : null;
        activeMasterRangePreview = preview || (tower ? { x: masterSelection.x, y: masterSelection.y, range: tower.range || 2, metric: 'euclidean' } : null);
        updateMasterGridRange();
    }
    document.querySelectorAll('.selected-cell').forEach(cell => cell.classList.remove('selected-cell'));
    if (!lastState || !masterSelection) { box.textContent = 'Click an object on the map or a hero in the team list.'; return; }
    renderMasterTargets();
    if (masterSelection.type === 'enemy') { renderEnemyInspector(box); return; }
    let x = masterSelection.x, y = masterSelection.y;
    if (masterSelection.type === 'hero') {
        const player = lastState.players[masterSelection.name];
        if (!player) { masterSelection = null; renderSelectedObject(); return; }
        x = player.x; y = player.y;
        box.innerHTML = '<div class="object-name">' + escapeHTML(player.heroName) + '</div><div class="muted">' + escapeHTML(player.name) + ' · ' + x + ', ' + y + '</div>' +
            objectRow('HP', player.hp + ' / ' + player.maxHp) + objectRow('MP', player.mana + ' / ' + player.maxMana) +
            objectRow('Status', player.deathTimer > 0 ? 'Fallen in battle' : player.isReady ? 'Ready' : 'Taking turn') +
            UNIT_STATUSES.renderList(masterStatusIndex.get(player) || []);
        const actions = document.createElement('div'); actions.className = 'object-actions';
        actions.append(objectButton('Edit', () => {
            if (editorDirty && editorPlayer !== player.name && !confirm('Discard unsaved changes to the other hero?')) return;
            ui('edit-hero-select').value = player.name; loadHeroEditor(true); openMasterTool('hero');
        }), objectButton('Relocate', () => { cancelMapAction(); selectedHeroToMove = player.name; ui('map-action').textContent = 'Relocate ' + player.heroName + ': select a cell'; }),
        objectButton('Action history', () => { openMasterTool('undo'); const entry = (lastState.playerHistory || []).slice().reverse().find(item => item.playerName === player.name); if (entry) { ui('rollback-select').value = entry.id; showRollbackPreview(); } }),
        objectButton('Delete', () => kickPlayer(player.name), true));
        const administration = persistentDetails('admin-' + player.name, 'Editing and history');
        administration.append(actions); box.append(administration);
        renderHeroInspectorExtras(box, player);
        const skills = GAME_DATA.heroes[player.heroKey]?.skills || [];
        if (skills.length) {
            const details = document.createElement('details'); details.style.marginTop = '14px';
            const summary = document.createElement('summary'); summary.textContent = 'Change selected abilities'; details.append(summary);
            const group = document.createElement('div'); group.className = 'object-actions';
            skills.forEach(skill => { const enabled = (player.skills || []).includes(skill.id); const b = objectButton((enabled ? '✓ ' : '＋ ') + skill.name, () => godToggleSkill(player.name, skill.id)); b.setAttribute('aria-pressed', enabled); group.append(b); });
            details.append(group); box.append(details);
        }
    } else {
        const cell = lastState.grid[y]?.[x];
        if (!cell) { masterSelection = null; renderSelectedObject(); return; }
        const tower = GAME_DATA.towers[cell.type];
        const names = { empty: _tr('Grass'), road: _tr('Road'), spawn: _tr('Spawn point'), castle: _tr('Castle'), slot: _tr('Empty slot') };
        box.innerHTML = '<div class="object-name">' + escapeHTML(tower?.name || names[cell.type] || cell.type) + '</div><div class="muted">' + _tr('Cell') + ' ' + x + ', ' + y + '</div>';
        const actions = document.createElement('div'); actions.className = 'object-actions';
        Object.values(lastState.players).filter(p => p.x === x && p.y === y).forEach(p => actions.append(objectButton(p.heroName, () => selectMasterHero(p.name))));
        if (tower || cell.type === 'slot') actions.append(objectButton(_tr('Tower controls'), () => openMasterTowerModal(x, y, cell)));
        actions.append(objectButton(_tr('＋ Note'), () => openLiveSceneNote(null,x,y)));
        box.append(actions);
        (lastState.sceneMaster?.notes || []).filter(note => note.x === x && note.y === y).forEach(note => {
            box.append(objectButton((note.revealed ? '◉ ' : '✎ ') + note.title, () => openLiveSceneNote(note,x,y)));
        });
        lastState.enemies.filter(e => e.x === x && e.y === y).forEach(enemy => {
            const row = document.createElement('div'); row.className = 'object-row';
            const label = objectButton(enemy.name + ' #' + enemy.id, () => selectMasterEnemy(enemy.id));
            const hp = document.createElement('b'); hp.textContent = 'HP ' + enemy.hp + '/' + enemy.maxHp;
            row.append(label, hp); box.append(row);
            const statuses = document.createElement('div');
            statuses.innerHTML = UNIT_STATUSES.renderList(masterStatusIndex.get(enemy) || []);
            box.append(statuses);
        });
        (lastState.soldiers || []).filter(s => s.x === x && s.y === y && s.hp > 0 && !s.respawnTimer).forEach(soldier => {
            const details = document.createElement('div');
            details.innerHTML = objectRow(soldier.isGolem ? 'Golem' : 'Soldier', 'HP ' + soldier.hp + '/' + soldier.maxHp) +
                UNIT_STATUSES.renderList(masterStatusIndex.get(soldier) || []);
            box.append(details);
        });
    }
    document.querySelector('#game-grid .cell[data-x="' + x + '"][data-y="' + y + '"]')?.classList.add('selected-cell');
}

const heroFields = [ ['hp','HP',0,1000000], ['maxHp','Max. HP',1,1000000], ['mana','MP',0,1000000],
    ['maxMana','Max. MP',0,1000000], ['armor','Armor, %',0,100], ['speed','Speed',0,40],
    ['range','Range',0,40], ['blockLimit','Block limit',0,100], ['deathTimer','Until respawn',0,1000],
    ['godDamageOverride','Next attack damage',0,1000000], ...['str','dex','con','int','wis','cha'].map(key => ['stats.' + key,key.toUpperCase(),1,30]) ];
function loadHeroEditor(force = false) {
    const name = ui('edit-hero-select').value;
    const player = lastState?.players[name];
    if (!force && editorDirty && editorPlayer === name) return;
    editorPlayer = name; editorDirty = false;
    ui('hero-editor-fields').replaceChildren();
    ui('save-hero').disabled = !player;
    if (!player) { ui('hero-editor-hint').textContent = 'No heroes in this game yet.'; return; }
    heroFields.forEach(([field, title, min, max]) => {
        const label = document.createElement('label'); label.textContent = title;
        const input = document.createElement('input'); input.type = 'number'; input.min = min; input.max = max; input.step = 1;
        input.dataset.heroField = field; input.required = field !== 'godDamageOverride';
        input.value = (field.startsWith('stats.') ? player.stats[field.slice(6)] : player[field]) ?? '';
        if (field === 'godDamageOverride') input.placeholder = 'Normal damage';
        label.append(input); ui('hero-editor-fields').append(label);
    });
    ui('hero-moved').checked = !!player.hasMovedThisRound;
    ui('hero-attacked').checked = !!player.hasAttackedThisRound;
    ui('hero-ready').checked = !!player.isReady;
    ui('hero-editor-hint').textContent = 'HP/MP maximums are set separately from CON/INT. Leave damage blank for a normal attack.';
}
ui('hero-editor-form').addEventListener('input', () => { editorDirty = true; ui('hero-editor-hint').textContent = 'You have unsaved changes. Check the parameters and click “Apply”.'; });
function saveHeroEditor(event) {
    event.preventDefault();
    const values = { stats: {}, hasMovedThisRound: ui('hero-moved').checked,
        hasAttackedThisRound: ui('hero-attacked').checked, isReady: ui('hero-ready').checked };
    document.querySelectorAll('[data-hero-field]').forEach(input => {
        const key = input.dataset.heroField;
        if (key.startsWith('stats.')) values.stats[key.slice(6)] = Number(input.value);
        else values[key] = input.value === '' ? null : Number(input.value);
    });
    if (values.hp > values.maxHp || values.mana > values.maxMana) { masterNotice('HP and MP cannot exceed their maximums', true); return; }
    if (sendMaster({ type: 'MASTER_EDIT_HERO', playerName: editorPlayer, values })) {
        editorDirty = false;
        ui('hero-editor-hint').textContent = 'Parameters sent to the server. The hero card shows the current values.';
        masterNotice('Parameters sent to server');
    }
}

function renderHistory(state) {
    const entries = state.playerHistory || [];
    const signature = JSON.stringify(entries);
    if (signature !== lastHistoryOptions) {
        const previous = ui('rollback-select').value;
        ui('rollback-select').replaceChildren();
        entries.slice().reverse().forEach(entry => ui('rollback-select').add(new Option(entry.playerName + ' · ' + entry.label, entry.id)));
        if (entries.some(entry => String(entry.id) === previous)) ui('rollback-select').value = previous;
        lastHistoryOptions = signature;
    }
    ui('rollback-button').disabled = !entries.length;
    showRollbackPreview();
}
function showRollbackPreview() {
    const entries = lastState?.playerHistory || [];
    const index = entries.findIndex(entry => String(entry.id) === ui('rollback-select').value);
    ui('rollback-preview').textContent = index < 0 ? 'No snapshots available yet.' :
        'Actions to undo: ' + (entries.length - index) + '. The entire world, treasury, effects, HP, MP and action availability will return to their state before the selected step.';
}
function confirmRollback() {
    const id = Number(ui('rollback-select').value);
    const entries = lastState?.playerHistory || [];
    const index = entries.findIndex(entry => entry.id === id);
    if (index < 0) return;
    if (confirm('Restore the world to before action “' + entries[index].playerName + ': ' + entries[index].label + '”? Actions to undo: ' + (entries.length - index) + ', including other players\' subsequent actions.')) {
        sendMaster({ type: 'MASTER_ROLLBACK_PLAYER', historyId: id });
    }
}
function renderWaveDescription() {
    const wave = masterWaves()[Number(ui('preset-wave-select').value)];
    ui('wave-description').textContent = wave ? wave.enemies.map(group => (GAME_DATA.enemies[group.type]?.name || group.type) + ' × ' + group.count).join(' · ') : '';
    if (wave) ui('wave-description').textContent = (wave.desc ? wave.desc + ' · ' : '') + wave.enemies.map(group => (GAME_DATA.enemies[group.type]?.name || group.type) + ' × ' + group.count + (group.offsetDelay ? ' in ' + group.offsetDelay + ' turns' : ' immediately')).join(' · ');
}
function renderMasterPanels(state) {
    renderGamePeriod(state);
    ui('master-tower-type-count').textContent = TOWER_RULES.getSelectedTypes(state, GAME_DATA.towers).length + '/5';
    renderTowerRoster(ui('master-tower-roster'), state, GAME_DATA.towers, (towerType, enabled) => {
        sendMaster({ type: 'SET_TOWER_TYPE', towerType, enabled });
    });
    ui('metric-wave').textContent = state.wave;
    ui('metric-hp').textContent = state.baseHp;
    ui('metric-gold').textContent = state.gold + ' G';
    ui('round-label').textContent = _tr('Round') + ' ' + (state.roundCounter || 0) + ' · ' + (state.phase === 'wave' ? _tr('wave turn') : _tr('player phase'));
    ui('map-size-label').textContent = state.gridWidth + ' × ' + state.gridHeight;
    const players = Object.values(state.players);
    const ready = players.filter(p => p.isReady).length;
    ui('team-count').textContent = players.length + ' ' + (players.length === 1 ? _tr('player') : _tr('players'));
    ui('ready-summary').textContent = players.length ? (_tr('Ready') + ' ' + ready + ' ' + _tr('of') + ' ' + players.length) : _tr('Waiting for players');
    const waiting = players.filter(p => !p.isReady).map(p => p.name);
    ui('waiting-players').textContent = waiting.length ? (_tr('Waiting:') + ' ' + waiting.join(', ')) : players.length ? _tr('Everyone is ready. You can advance the turn.') : _tr('Connect players through player.html');
    ui('btn-move-enemies').textContent = _tr('Wave Turn →');
    ui('heroes-list').replaceChildren();
    if (!players.length) ui('heroes-list').textContent = _tr('Waiting for players…');
    players.forEach(p => {
        const button = objectButton('', () => selectMasterHero(p.name)); button.className = 'team-member';
        button.innerHTML = '<strong>' + escapeHTML(p.heroName) + '</strong><div class="team-meta"><span>' + escapeHTML(p.name) + ' · ♥ ' + p.hp + '/' + p.maxHp + ' · MP ' + p.mana + '/' + p.maxMana + '</span><span class="' + (p.isReady ? 'good' : 'waiting') + '">' + (p.deathTimer > 0 ? _tr('Fallen · ') + p.deathTimer + _tr(' turns') : p.isReady ? _tr('✓ Ready') : _tr('Acting')) + '</span></div><div class="muted">' + _tr('Action: ') + (p.hasAttackedThisRound ? _tr('used') : _tr('available')) + ' · ' + _tr('Move: ') + (p.hasMovedThisRound ? _tr('used') : _tr('available')) + '</div>' + UNIT_STATUSES.renderList(masterStatusIndex.get(p) || []);
        ui('heroes-list').append(button);
    });
    const playerOptions = JSON.stringify(players.map(p => [p.name, p.heroName]));
    if (playerOptions !== lastHeroOptions) {
        const previous = ui('edit-hero-select').value;
        ui('edit-hero-select').replaceChildren();
        players.forEach(p => ui('edit-hero-select').add(new Option(p.heroName + ' · ' + p.name, p.name)));
        if (state.players[previous]) ui('edit-hero-select').value = previous;
        else editorDirty = false;
        lastHeroOptions = playerOptions;
    }
    // Не заменяем поля на фоне, пока мастер вводит правки.
    if (!editorDirty && !ui('hero-editor-form').contains(document.activeElement)) loadHeroEditor();
    if (typeof renderMasterScene === 'function') renderMasterScene(state);
    if (typeof renderHistory === 'function') renderHistory(state);
    if (typeof renderSelectedObject === 'function') renderSelectedObject();
    if (typeof renderWaveDescription === 'function') renderWaveDescription();
    if (typeof applyMasterZoom === 'function') applyMasterZoom();
    if (typeof renderMasterControls === 'function') renderMasterControls();
    if (typeof MASTER_ACTIVATED_EVENTS !== 'undefined') MASTER_ACTIVATED_EVENTS.render(state);
    if (typeof ACTIVATED_EVENT_OVERLAYS !== 'undefined') ACTIVATED_EVENT_OVERLAYS.render(ui('game-grid'), state);
    if (activeMasterTower && !state.grid[activeMasterTower.y]?.[activeMasterTower.x]) closeMasterTowerModal();
}
function applyMasterZoom() {
    if (!lastState) return;
    const grid = ui('game-grid');
    if (masterFit) {
        const viewport = ui('map-viewport');
        let height = parseFloat(getComputedStyle(viewport).maxHeight) || 760;
        if (typeof window !== 'undefined' && window.innerHeight && viewport.getBoundingClientRect) {
            // Уведомления и перенос кнопок меняют высоту шапки: поле остаётся в окне.
            height = Math.min(height, Math.max(220, window.innerHeight - viewport.getBoundingClientRect().top - 36));
        }
        masterZoom = Math.min(1, Math.max(0.15, Math.min((viewport.clientWidth - 4) / grid.offsetWidth, (height - 6) / grid.offsetHeight)));
    }
    // CSS zoom меняет размеры прокрутки вместе с картой, в отличие от transform: scale.
    grid.style.zoom = String(masterZoom);
    grid.style.setProperty('--range-zoom', String(masterZoom));
    ui('map-stage').style.width = Math.ceil(grid.offsetWidth * masterZoom) + 'px';
    ui('map-stage').style.height = Math.ceil(grid.offsetHeight * masterZoom) + 'px';
    ui('zoom-label').textContent = Math.round(masterZoom * 100) + '%';
}
function changeMasterZoom(delta) { masterFit = false; masterZoom = Math.max(0.2, Math.min(2, masterZoom + delta)); applyMasterZoom(); }
function fitMasterMap() { masterFit = true; applyMasterZoom(); }
let observedMapWidth = 0;
new ResizeObserver(entries => {
    const width = entries[0].contentRect.width;
    if (Math.abs(width - observedMapWidth) > 1) {
        observedMapWidth = width;
        requestAnimationFrame(() => { if (masterFit) applyMasterZoom(); });
    }
}).observe(ui('map-viewport'));
window.addEventListener('resize', () => { if (masterFit) applyMasterZoom(); });
document.addEventListener('keydown', event => { if (event.key === 'Escape') { closeMasterTowerModal(); cancelMapAction(); } });
ui('master-tower-modal').addEventListener('click', event => { if (event.target === ui('master-tower-modal')) closeMasterTowerModal(); });

