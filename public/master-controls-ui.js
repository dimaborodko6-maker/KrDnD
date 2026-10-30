'use strict';
const masterControlsTr = text => typeof window._tr === 'function' ? window._tr(text) :
    window.KR_I18N?.t ? window.KR_I18N.t(text) : text;

var masterEnemyMove = null;
var masterEnemyArea = null;
var masterHeroPreview = null;
var lastMasterSpawn = null;
var selectedMasterEnemies = new Set();
var restoreNames = [];
var effectEnemyIds = [];
var inspectorTab = 'object';
var masterDetailsOpen = new Set();
var spawnFavorites = [];
try { spawnFavorites = JSON.parse(localStorage.getItem('kr-master-favorite-mobs') || '[]'); if (!Array.isArray(spawnFavorites)) spawnFavorites = []; } catch (_) { /* Настройки браузера необязательны. */ }

function setInspectorTab(name) {
    inspectorTab = name;
    ['object', 'team', 'enemies', 'wave'].forEach(key => { ui('inspector-' + key).hidden = key !== name; });
    document.querySelectorAll('[data-inspector-tab]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.inspectorTab === name)));
    if (name === 'enemies') renderEnemyRoster();
}
function toggleMapFocus() {
    const active = document.body.classList.toggle('map-focused');
    ui('focus-map-button').setAttribute('aria-pressed', String(active));
    ui('focus-map-button').textContent = active ? '⛶ Restore panels' : '⛶ Map only';
    requestAnimationFrame(applyMasterZoom);
}
function focusMasterUnit(unit) {
    const cell = document.querySelector('#game-grid .cell[data-x="' + unit.x + '"][data-y="' + unit.y + '"]');
    if (!cell) return;
    const view = ui('map-viewport'), rect = cell.getBoundingClientRect(), viewport = view.getBoundingClientRect();
    view.scrollBy({ left: rect.left + rect.width / 2 - viewport.left - viewport.width / 2,
        top: rect.top + rect.height / 2 - viewport.top - viewport.height / 2, behavior: 'smooth' });
}
function persistentDetails(key, title, open = false) {
    const details = document.createElement('details');
    details.className = 'inspector-details';
    details.open = masterDetailsOpen.has(key) || open;
    const summary = document.createElement('summary'); summary.textContent = title; details.append(summary);
    details.addEventListener('toggle', () => { if (details.isConnected) { if (details.open) masterDetailsOpen.add(key); else masterDetailsOpen.delete(key); } });
    return details;
}
function restoreHeroQuick(name, options, ability) {
    sendMaster({ type: 'MASTER_RESTORE_HEROES', playerNames: [name], options, ...(ability ? { ability } : {}) });
}
function openRestoreDialog(name) {
    restoreNames = name ? [name] : Object.keys(lastState?.players || {});
    if (!restoreNames.length) { masterNotice('No heroes in this game yet', true); return; }
    ui('restore-title').textContent = name ? 'Restore hero' : 'Restore team';
    ui('restore-targets').textContent = restoreNames.map(key => lastState.players[key].heroName).join(', ');
    ui('restore-dialog').showModal();
}
function submitHeroRestore(event) {
    event.preventDefault();
    const options = {};
    ui('restore-dialog').querySelectorAll('input[type=checkbox]').forEach(input => { options[input.name] = input.checked; });
    if (!Object.values(options).some(Boolean)) { masterNotice('Select at least one restoration option', true); return; }
    if (sendMaster({ type: 'MASTER_RESTORE_HEROES', playerNames: restoreNames, options })) ui('restore-dialog').close();
}
function openClearEnemies() {
    if (!lastState) return;
    ui('clear-enemies-count').textContent = 'On map: ' + lastState.enemies.length + ' enemies. Waiting to spawn: ' + (lastState.pendingSpawns || []).length + '.';
    ui('clear-enemies-dialog').showModal();
}
function submitClearEnemies(event) {
    event.preventDefault();
    if (sendMaster({ type: 'MASTER_CLEAR_ENEMIES', includePending: ui('clear-pending').checked })) ui('clear-enemies-dialog').close();
}
function undoIntervention() {
    const entry = lastState?.masterUndo;
    if (entry && confirm(masterControlsTr('Undo intervention “' + entry.label + '” and restore the previous world state?'))) sendMaster({ type: 'MASTER_UNDO_INTERVENTION', id: entry.id });
}
function getMasterHeroRange(hero, key) {
    const info = key === 'movement' ? { range: lastState.gamePeriod === 'preparation' ? Infinity : ACTIVATED_EVENT_RULES.heroSpeed(hero, lastState.roundCounter || 0), metric: 'chebyshev' } : BATTLE_ABILITY_RULES.rangeInfo(key, hero);
    return info && { x: hero.x, y: hero.y, ...info };
}
function previewMasterHero(hero, key) {
    masterHeroPreview = key;
    activeMasterRangePreview = getMasterHeroRange(hero, key);
    updateMasterGridRange(); renderMasterTargets(); focusMasterUnit(hero);
}
function renderMasterTargets() {
    const hero = masterSelection?.type === 'hero' && lastState.players[masterSelection.name];
    const targets = hero && masterHeroPreview && masterHeroPreview !== 'movement' ?
        BATTLE_ABILITY_RULES.availableTargets(lastState, hero.name, masterHeroPreview) : [];
    const affected = hero && masterHeroPreview && masterHeroPreview !== 'movement' && BATTLE_ABILITY_RULES.definition(masterHeroPreview, hero.heroKey, hero).selection === 'none' ?
        BATTLE_ABILITY_RULES.application(lastState, hero.name, masterHeroPreview).effects : [];
    const cells = new Set([...targets, ...affected].map(unit => unit.x + ',' + unit.y));
    if (hero && masterHeroPreview === 'movement') {
        const preparation = lastState.gamePeriod === 'preparation';
        if (preparation || hero.hp > 0 && !hero.deathTimer && !hero.hasMovedThisRound) {
            const info = getMasterHeroRange(hero, 'movement');
            lastState.grid.forEach((row, y) => row.forEach((cell, x) => {
                if (['empty','road','spawn','castle'].includes(cell.type) && (x !== hero.x || y !== hero.y) && Math.max(Math.abs(x - hero.x), Math.abs(y - hero.y)) <= info.range) cells.add(x + ',' + y);
            }));
        }
    }
    document.querySelectorAll('#game-grid .cell').forEach(cell => cell.classList.toggle('master-target-cell', cells.has(cell.dataset.x + ',' + cell.dataset.y)));
}
function renderHeroInspectorExtras(box, hero) {
    const actions = document.createElement('div'); actions.className = 'object-actions';
    actions.append(objectButton('♡ Restore…', () => openRestoreDialog(hero.name)),
        objectButton('Find on map', () => focusMasterUnit(hero)),
        objectButton('Relocate', () => { cancelMapAction(); selectedHeroToMove = hero.name; ui('map-action').textContent = 'Relocate hero: select a cell · Esc to cancel'; }));
    box.append(actions);
    const quick = persistentDetails('quick-' + hero.name, 'Quick restoration');
    const quickActions = document.createElement('div'); quickActions.className = 'object-actions';
    quickActions.append(
        objectButton('Heal', () => restoreHeroQuick(hero.name, { hp: true })),
        objectButton('Mana', () => restoreHeroQuick(hero.name, { mana: true })),
        objectButton('Revive', () => restoreHeroQuick(hero.name, { revive: true })),
        objectButton('Restore action', () => restoreHeroQuick(hero.name, { action: true })),
        objectButton('Restore movement', () => restoreHeroQuick(hero.name, { movement: true })),
        objectButton('Reset CDs', () => restoreHeroQuick(hero.name, { cooldowns: true })),
        objectButton('Remove negative effects', () => restoreHeroQuick(hero.name, { cleanse: true })));
    quick.append(quickActions); box.append(quick);
    const mod = key => Math.floor(((hero.stats?.[key] || 10) - 10) / 2);
    const ranged = ['zefira', 'bolin', 'illiana', 'ratchet'].includes(hero.heroKey);
    const formula = hero.godDamageOverride != null ? 'Fixed: ' + hero.godDamageOverride : hero.heroKey === 'ratchet' ? 'Roll + ' + (3 + mod('int')) + ' · true' : ranged ?
        'At range: roll + ' + (6 + mod('dex')) + ' · ' + (hero.heroKey === 'zefira' ? 'magic' : 'physical') + '; point blank: roll + ' + (2 + Math.min(mod('str'), mod('dex'))) + ' · physical' :
        'Roll + ' + (4 + mod('str')) + ' · physical';
    box.insertAdjacentHTML('beforeend', objectRow('Armor / speed', (hero.armor || 0) + '% / ' + (hero.speed + (hero.speedBonus || 0))) + objectRow('Blocking', (hero.blockedEnemyIds || []).length + ' / ' + hero.blockLimit));
    const stats = persistentDetails('stats-' + hero.name, 'Stats and combat');
    stats.insertAdjacentHTML('beforeend', objectRow('Armor', (hero.armor || 0) + '%') + objectRow('Speed', hero.speed + (hero.speedBonus ? ' + ' + hero.speedBonus : '')) +
        objectRow('Attack range', hero.range) + objectRow('Blocking', (hero.blockedEnemyIds || []).length + ' / ' + hero.blockLimit) +
        objectRow('Action', hero.hasAttackedThisRound ? 'Used' : 'Available') + objectRow('Movement', hero.hasMovedThisRound ? 'Used' : 'Available') +
        objectRow('Until respawn', (hero.deathTimer || 0) + ' turns') +
        Object.entries(hero.stats || {}).map(([key, value]) => objectRow(key.toUpperCase(), value + ' (' + (Math.floor((value - 10) / 2) >= 0 ? '+' : '') + Math.floor((value - 10) / 2) + ')')).join(''));
    if (hero.godDamageOverride != null) stats.insertAdjacentHTML('beforeend', objectRow('Fixed damage', hero.godDamageOverride));
    const ranges = document.createElement('div'); ranges.className = 'object-actions';
    ranges.append(objectButton('Movement radius', () => previewMasterHero(hero, 'movement')), objectButton('Attack radius', () => previewMasterHero(hero, 'attack')), objectButton('Hide radius', () => { masterHeroPreview = null; renderSelectedObject(); }));
    stats.append(ranges); box.append(stats);
    const abilities = persistentDetails('abilities-' + hero.name, 'Attacks and abilities');
    const proto = GAME_DATA.heroes[hero.heroKey];
    if (!proto) return;
    const entries = [{ key: 'attack', name: 'Basic attack', desc: formula + '. Base damage before abilities, target defenses and random effects.', cooldown: 0 },
        BATTLE_ABILITY_RULES.disengage,
        ...proto.skills.filter(skill => (hero.skills || []).includes(skill.id)).map(skill => ({ ...skill, key: 'spell_' + skill.id })),
        { ...proto.ultimate, key: 'ultimate' }];
    entries.forEach(ability => {
        const passive = ability.key.startsWith('spell_') && (!ability.cooldown || ability.desc.includes('Passive'));
        const card = document.createElement('article'); card.className = 'ability-card';
        const spec = BATTLE_ABILITY_RULES.definition(ability.key, hero.heroKey, hero);
        const range = BATTLE_ABILITY_RULES.rangeInfo(ability.key, hero);
        const remaining = hero.cooldowns?.[ability.key] || 0;
        const target = { cell: 'cell', unit: spec.tone === 'heal' ? 'ally' : spec.tone === 'mixed' ? 'unit' : 'enemy', none: 'no target selection' }[spec.selection];
        const area = { single: 'single target', cell: 'target cell', aoe_around_player: 'around hero', aoe_around_target: 'around target', all_allies: 'all heroes', nanites: 'nearby allies', taunt: 'area taunt', self: 'self', blink: 'teleport', mine: 'mine', rush: 'dash', reboot: 'restoration' }[spec.shape];
        const status = hero.hp <= 0 || hero.deathTimer > 0 ? 'Hero has fallen' : remaining ? 'Cooldown: ' + remaining + ' turns' : hero.hasAttackedThisRound ? 'Action used' : hero.mana < BATTLE_ABILITY_RULES.manaCost(ability.key) ? 'Not enough mana' : 'Ready';
        card.innerHTML = '<strong>' + escapeHTML(ability.name) + '</strong><p>' + escapeHTML(ability.desc) + '</p><div class="muted">' + (passive ? 'Passive' : escapeHTML(BATTLE_ABILITY_RULES.manaCost(ability.key) + ' MP · CD ' + ability.cooldown + ' turns · ' + status)) + '</div>';
        if (!passive) {
            card.insertAdjacentHTML('beforeend', '<div class="muted">' + escapeHTML('Target: ' + target + ' · ' + area + (spec.radius > 0 && Number.isFinite(spec.radius) ? ' (' + spec.radius + ' cells)' : '') + ' · ' + (Number.isFinite(range.range) ? 'range ' + range.range + ' cells' : 'entire map') + (range.metric === 'euclidean' ? ' · circle' : ' · cells')) + '</div>');
            const buttons = document.createElement('div'); buttons.className = 'object-actions';
            buttons.append(objectButton('Radius and targets', () => previewMasterHero(hero, ability.key)));
            if (remaining > 0) buttons.append(objectButton('Reset this CD', () => restoreHeroQuick(hero.name, { cooldowns: true }, ability.key)));
            card.append(buttons);
        }
        abilities.append(card);
    });
    box.append(abilities);
}
function selectMasterEnemy(id) {
    masterSelection = { type: 'enemy', id }; masterHeroPreview = null; setInspectorTab('object'); renderSelectedObject();
    const unit = lastState.enemies.find(e => e.id === id); if (unit) focusMasterUnit(unit);
}
function renderEnemyInspector(box) {
    const enemy = lastState.enemies.find(e => e.id === masterSelection.id);
    if (!enemy) { masterSelection = null; box.textContent = 'This enemy has already left the map.'; return; }
    const proto = GAME_DATA.enemies[enemy.type] || {};
    box.innerHTML = '<div class="object-name">' + escapeHTML(enemy.name) + '</div><div class="muted">#' + enemy.id + ' · ' + enemy.x + ', ' + enemy.y + '</div><p>' + escapeHTML(proto.description || '') + '</p>' +
        objectRow('HP', enemy.hp + ' / ' + enemy.maxHp) + objectRow('Shield', enemy.shieldHp || 0) + objectRow('Armor', enemy.armor + '%') +
        objectRow('Magic resistance', enemy.magicRes + '%') + objectRow('Melee / ranged damage', enemy.meleeDmg + ' / ' + enemy.rangedDmg) +
        objectRow('Base speed', enemy.speed) + objectRow('Range', enemy.range) + objectRow('Type', enemy.isFlying ? 'Flying' : 'Ground') +
        objectRow('Reward / base damage', (enemy.reward || 0) + ' G / ' + enemy.livesTaken) + UNIT_STATUSES.renderList(masterStatusIndex.get(enemy) || []);
    const actions = document.createElement('div'); actions.className = 'object-actions';
    actions.append(objectButton('Heal', () => manageEnemies([enemy.id], 'heal')),
        objectButton('Change HP', () => { const value = prompt(masterControlsTr('Enemy HP (1–' + enemy.maxHp + ')'), enemy.hp); if (value !== null) manageEnemies([enemy.id], 'hp', { hp: Number(value) }); }),
        objectButton('Relocate', () => { cancelMapAction(); masterEnemyMove = [enemy.id]; ui('map-action').textContent = 'Relocate enemy: select a cell · Esc to cancel'; }),
        objectButton('Effect…', () => openEnemyEffect([enemy.id])), objectButton('Remove effects', () => manageEnemies([enemy.id], 'cleanse')),
        objectButton('Find on map', () => focusMasterUnit(enemy)), objectButton('Remove one', () => manageEnemies([enemy.id], 'remove'), true));
    box.append(actions);
    document.querySelector('#game-grid .cell[data-x="' + enemy.x + '"][data-y="' + enemy.y + '"]')?.classList.add('selected-cell');
}
function filteredMasterEnemies() {
    const search = ui('enemy-search').value.trim().toLocaleLowerCase(), filter = ui('enemy-filter').value, type = ui('enemy-type-filter').value;
    const castles = [];
    if (filter === 'castle') lastState.grid.forEach((row, y) => row.forEach((cell, x) => { if (cell.type === 'castle') castles.push({ x, y }); }));
    let focus = masterSelection?.type === 'hero' ? lastState.players[masterSelection.name] : masterSelection?.type === 'enemy' ? lastState.enemies.find(e => e.id === masterSelection.id) : masterSelection;
    return lastState.enemies.filter(e => (!type || e.type === type) && (!search || (e.name + ' ' + e.id).toLocaleLowerCase().includes(search)) &&
        (filter === 'all' || filter === 'wounded' && e.hp < e.maxHp || filter === 'effects' && (masterStatusIndex.get(e) || []).some(s => s.polarity === 'negative' && s.id !== 'blocked') ||
            filter === 'castle' && castles.some(c => Math.hypot(c.x - e.x, c.y - e.y) <= 3) || filter === 'cell' && focus && e.x === focus.x && e.y === focus.y));
}
function renderEnemyRoster() {
    if (!lastState) return;
    const existing = new Set(lastState.enemies.map(e => e.id));
    selectedMasterEnemies.forEach(id => { if (!existing.has(id)) selectedMasterEnemies.delete(id); });
    const list = ui('enemy-roster'); list.replaceChildren();
    const groups = new Map();
    filteredMasterEnemies().forEach(enemy => { if (!groups.has(enemy.type)) groups.set(enemy.type, []); groups.get(enemy.type).push(enemy); });
    if (!groups.size) list.textContent = 'No enemies match this filter.';
    groups.forEach(units => {
        const heading = document.createElement('div'); heading.className = 'enemy-group-heading';
        const choose = objectButton(units[0].name + ' × ' + units.length, () => { units.forEach(e => selectedMasterEnemies.add(e.id)); renderEnemyRoster(); });
        choose.title = 'Select all matching enemies of this type'; heading.append(choose); list.append(heading);
        units.forEach(enemy => {
            const row = document.createElement('div'); row.className = 'enemy-list-row';
            const label = document.createElement('label'); label.className = 'check-label';
            const check = document.createElement('input'); check.type = 'checkbox'; check.checked = selectedMasterEnemies.has(enemy.id); check.setAttribute('aria-label', 'Select ' + enemy.name + ' #' + enemy.id);
            check.onchange = () => { if (check.checked) selectedMasterEnemies.add(enemy.id); else selectedMasterEnemies.delete(enemy.id); renderEnemySelectionCount(); }; label.append(check);
            const button = objectButton('#' + enemy.id + ' · ♥ ' + enemy.hp + '/' + enemy.maxHp + ' · ' + enemy.x + ',' + enemy.y, () => selectMasterEnemy(enemy.id));
            row.append(label, button); list.append(row);
        });
    });
    renderEnemySelectionCount();
}
function renderEnemySelectionCount() {
    ui('enemy-selection-count').textContent = 'Selected: ' + selectedMasterEnemies.size + ' · found: ' + filteredMasterEnemies().length;
    document.querySelectorAll('[data-enemy-bulk]').forEach(button => { button.disabled = !selectedMasterEnemies.size; });
    const cells = new Set(lastState.enemies.filter(e => selectedMasterEnemies.has(e.id)).map(e => e.x + ',' + e.y));
    document.querySelectorAll('#game-grid .cell').forEach(cell => cell.classList.toggle('bulk-selected-cell', cells.has(cell.dataset.x + ',' + cell.dataset.y)));
}
function selectVisibleEnemies() { filteredMasterEnemies().forEach(e => selectedMasterEnemies.add(e.id)); renderEnemyRoster(); }
function clearEnemySelection() { selectedMasterEnemies.clear(); renderEnemyRoster(); }
function armEnemyArea() {
    cancelMapAction(); masterEnemyArea = {};
    ui('map-action').textContent = 'Select enemies: choose the first rectangle corner · Esc to cancel';
}
function selectEnemyAreaCorner(x, y) {
    if (masterEnemyArea.x === undefined) { masterEnemyArea = { x, y }; ui('map-action').textContent = 'Choose the opposite corner · Esc to cancel'; return; }
    const start = masterEnemyArea;
    lastState.enemies.filter(e => e.x >= Math.min(start.x, x) && e.x <= Math.max(start.x, x) && e.y >= Math.min(start.y, y) && e.y <= Math.max(start.y, y)).forEach(e => selectedMasterEnemies.add(e.id));
    masterEnemyArea = null; cancelMapAction(); setInspectorTab('enemies'); renderEnemyRoster();
}
function moveSelectedEnemies() {
    if (!selectedMasterEnemies.size) return;
    cancelMapAction(); masterEnemyMove = [...selectedMasterEnemies];
    ui('map-action').textContent = 'Relocate group (' + masterEnemyMove.length + '): select a shared cell · Esc to cancel';
}
function manageEnemies(ids, action, extra = {}) {
    if (!ids.length) return;
    if (action === 'remove' && !confirm(masterControlsTr('Remove enemies: ' + ids.length + '? No rewards or death effects.'))) return;
    sendMaster({ type: 'MASTER_MANAGE_ENEMIES', ids, action, ...extra });
}
function manageSelectedEnemies(action) { manageEnemies([...selectedMasterEnemies], action); }
function openEnemyEffect(ids = [...selectedMasterEnemies]) {
    if (!ids.length) return;
    effectEnemyIds = ids;
    ui('effect-targets').textContent = 'Enemies selected: ' + ids.length;
    ui('enemy-effect-dialog').showModal();
}
function submitEnemyEffect(event) {
    event.preventDefault();
    if (sendMaster({ type: 'MASTER_MANAGE_ENEMIES', ids: effectEnemyIds, action: 'effect', effect: ui('enemy-effect').value,
        turns: Number(ui('enemy-effect-turns').value), power: Number(ui('enemy-effect-power').value) })) ui('enemy-effect-dialog').close();
}
function renderPendingSpawns() {
    let box = ui('pending-spawns');
    if (!box) { box = document.createElement('section'); box.id = 'pending-spawns'; box.className = 'panel'; ui('inspector-wave').append(box); }
    box.innerHTML = '<h2>Waiting to Spawn</h2>';
    const groups = new Map();
    (lastState.pendingSpawns || []).forEach(entry => { const key = JSON.stringify([entry.type, entry.round, entry.x, entry.y]); if (!groups.has(key)) groups.set(key, []); groups.get(key).push(entry); });
    if (!groups.size) { box.append('No reinforcements.'); return; }
    groups.forEach((entries, key) => {
        const e = entries[0], row = document.createElement('div'); row.className = 'queue-row';
        const text = document.createElement('span'); text.textContent = (GAME_DATA.enemies[e.type]?.name || e.type) + ' × ' + entries.length + ' · in ' + Math.max(0, e.round - (lastState.roundCounter || 0)) + ' turns · ' + e.x + ',' + e.y;
        row.append(text, objectButton('Cancel', () => { if (confirm(masterControlsTr('Cancel this reinforcement group (' + entries.length + ')?'))) sendMaster({ type: 'MASTER_CANCEL_SPAWNS', group: key }); })); box.append(row);
    });
    box.append(objectButton('Cancel all reinforcements', () => { if (confirm(masterControlsTr('Cancel all pending reinforcements?'))) sendMaster({ type: 'MASTER_CANCEL_SPAWNS', all: true }); }, true));
}
function filterSpawnCatalog() {
    const select = ui('active-spawn-type'), previous = select.value, search = ui('spawn-search').value.trim().toLocaleLowerCase();
    select.replaceChildren();
    Object.entries(GAME_DATA.enemies).filter(([id, e]) => (!ui('spawn-only-favorites').checked || spawnFavorites.includes(id)) && (e.name + ' ' + id).toLocaleLowerCase().includes(search))
        .sort(([a, ea], [b, eb]) => Number(spawnFavorites.includes(b)) - Number(spawnFavorites.includes(a)) || ea.name.localeCompare(eb.name, 'ru'))
        .forEach(([id, e]) => select.add(new Option((spawnFavorites.includes(id) ? '★ ' : '') + e.name, id)));
    if ([...select.options].some(option => option.value === previous)) select.value = previous;
    renderSpawnPreview();
}
function renderSpawnPreview() {
    const id = ui('active-spawn-type').value, proto = GAME_DATA.enemies[id];
    ui('spawn-preview').textContent = proto ? 'HP ' + proto.hp + ' · armor ' + proto.armor + '% · speed ' + proto.speed + ' · ' + (proto.description || '') : 'Nothing found';
    ui('spawn-favorite').textContent = spawnFavorites.includes(id) ? '★ Remove from favorites' : '☆ Add to favorites';
    ui('spawn-favorite').disabled = !proto; ui('tool-spawn-click').disabled = !proto;
}
function toggleSpawnFavorite() {
    const id = ui('active-spawn-type').value;
    spawnFavorites = spawnFavorites.includes(id) ? spawnFavorites.filter(key => key !== id) : [...spawnFavorites, id];
    try { localStorage.setItem('kr-master-favorite-mobs', JSON.stringify(spawnFavorites)); } catch (_) { /* Избранное работает и без хранилища. */ }
    filterSpawnCatalog();
}
function repeatLastSpawn() {
    if (lastMasterSpawn && confirm(masterControlsTr('Repeat group: ' + lastMasterSpawn.count + ' × ' + (GAME_DATA.enemies[lastMasterSpawn.enemyType]?.name || lastMasterSpawn.enemyType) + ' at cell ' + lastMasterSpawn.x + ',' + lastMasterSpawn.y + '?'))) sendMaster(lastMasterSpawn);
}
function renderMasterControls() {
    const state = lastState;
    ui('tab-team-count').textContent = Object.keys(state.players).length;
    ui('tab-enemy-count').textContent = state.enemies.length;
    ui('undo-intervention').disabled = !state.masterUndo;
    ui('undo-intervention').title = state.masterUndo ? state.masterUndo.label + ' · available until the next world change' : 'Restoration, enemy removal and edits can be undone until the next world change';
    const select = ui('enemy-type-filter'), current = select.value;
    const types = [...new Set(state.enemies.map(e => e.type))].sort();
    if (select.dataset.types !== JSON.stringify(types)) {
        select.replaceChildren(new Option('All types', ''));
        types.forEach(type => select.add(new Option(GAME_DATA.enemies[type]?.name || type, type)));
        if (types.includes(current)) select.value = current;
        select.dataset.types = JSON.stringify(types);
    }
    renderEnemyRoster(); renderPendingSpawns(); renderMasterTargets();
}
document.addEventListener('keydown', event => { if (event.key === 'Escape') { masterEnemyMove = null; masterEnemyArea = null; masterHeroPreview = null; renderSelectedObject(); } });
