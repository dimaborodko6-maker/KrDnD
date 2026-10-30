var _tr = typeof _tr !== 'undefined' ? _tr : (text => (typeof window !== 'undefined' && window.KR_I18N ? window.KR_I18N.t(text) : text));
'use strict';
const el = id => document.getElementById(id);
const clone = value => JSON.parse(JSON.stringify(value));
const numericFields = [
    ['hp','Health',1,1000000],['speed','Speed, cells',1,40],['initiative','Initiative',0,100],
    ['armor','Armor, %',0,100],['magicRes','Magic resistance, %',0,100],['reward','Reward, G',0,1000000],
    ['meleeDmg','Melee damage',1,1000000],['rangedDmg','Ranged damage',1,1000000],['range','Range, cells',1,40],
    ['livesTaken','Base damage',1,100],['dodgeChance','Dodge, %',0,100],
    ['executeThreshold','Execute threshold, %',0,100]
];
let draft = null, revision = -1, builtinIds = [], section = 'mobs', selectedMob = null, selectedWave = 0, selectedTower = 'dwarf_outpost';
let dirty = false, saving = false, online = false, conflict = false, forceReload = false;
let socket;
function notify(message, error = false) {
    el('editor-notice').textContent = message; el('editor-notice').hidden = !message;
    el('editor-notice').classList.toggle('error',error);
}
function controls() {
    const isTowers = section === 'towers';
    el('catalog-fields').disabled = (!draft && !isTowers) || saving;
    el('save-catalog').textContent = isTowers ? 'Save local preview' : 'Save catalog';
    el('save-catalog').disabled = isTowers ? !dirty : (!draft || !dirty || !online || saving || conflict);
    el('reload-catalog').disabled = !online || saving;
    el('tab-mobs').disabled = el('tab-waves').disabled = el('tab-towers').disabled = (!draft && !isTowers) || saving;
    el('save-state').textContent = saving ? _tr('Saving…') : conflict ? _tr('A newer version is available on the server') : dirty ? _tr('You have unsaved changes') : isTowers ? _tr('Tower preview · this browser only') : draft ? _tr('Saved · version ') + revision : _tr('Loading catalog');
    el('save-state').classList.toggle('dirty', dirty || conflict);
}
function markDirty() { dirty = true; controls(); refreshSummary(); }
function connectEditor() {
    socket = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host);
    window.KR_DIAGNOSTICS?.trackSocket(socket);
    socket.onopen = () => { online = true; el('editor-connection').textContent = _tr('connected'); socket.send(JSON.stringify({type:'REGISTER_EDITOR'})); controls(); };
    socket.onclose = () => { online = false; saving = false; el('editor-connection').textContent = _tr('disconnected'); notify('Connection lost. Your changes remain in this window. Click “Load from server” to reconnect.',true); controls(); el('reload-catalog').disabled = false; };
    socket.onmessage = event => {
        const data = JSON.parse(event.data);
        if (data.type === 'COMMAND_ERROR') { saving = false; notify(data.message,true); controls(); return; }
        if (data.type !== 'CATALOG_STATE') return;
        if (dirty && !forceReload && data.reason !== 'saved') {
            if (data.revision !== revision) { conflict = true; notify('Another editor saved a new version. Your changes remain in this window. Load the catalog from the server to continue.',true); }
            controls(); return;
        }
        const saved = data.reason === 'saved';
        draft = clone(data.catalog); revision = data.revision; builtinIds = data.builtinIds;
        dirty = saving = conflict = forceReload = false;
        if (!draft.enemies[selectedMob]) selectedMob = Object.keys(draft.enemies)[0];
        selectedWave = Math.min(selectedWave,draft.presetWaves.length - 1);
        render(); controls();
        notify(saved ? 'Catalog saved. The GM and players received the update.' : '');
    };
}
function requestConfirmation(title,text,action) {
    el('confirm-title').textContent = title; el('confirm-text').textContent = text;
    el('confirm-ok').onclick = () => { el('catalog-confirm').close(); action(); };
    el('catalog-confirm').showModal();
}
el('confirm-cancel').onclick = () => el('catalog-confirm').close();
el('reload-catalog').onclick = () => {
    const reload = () => { forceReload = true; if (!online) connectEditor(); else socket.send(JSON.stringify({type:'EDITOR_GET_CATALOG'})); };
    if (dirty) requestConfirmation('Load catalog from server?','Unsaved changes in this window will be replaced by the server version.',reload);
    else reload();
};
el('save-catalog').onclick = () => {
    if (section === 'towers') {
        const fields = el('tower-detail').querySelectorAll('input,textarea,select');
        for (const field of fields) if (!field.reportValidity()) return;
        saveTowerCatalog();
        dirty = false;
        controls();
        notify('Tower preview saved in this browser. Server combat rules and other players are unchanged.');
        return;
    }
    const fields = el(section === 'mobs' ? 'mob-detail' : 'wave-detail').querySelectorAll('input,textarea,select');
    for (const field of fields) if (!field.reportValidity()) return;
    if (!online || conflict) return;
    saving = true; controls();
    socket.send(JSON.stringify({type:'EDITOR_SAVE_CATALOG',revision,catalog:draft}));
};
window.addEventListener('beforeunload',event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } });
el('tab-mobs').onclick = () => { section = 'mobs'; render(); controls(); notify(''); };
el('tab-waves').onclick = () => { section = 'waves'; render(); controls(); notify(''); };
el('tab-towers').onclick = () => { section = 'towers'; render(); controls(); notify('Tower edits are a design preview stored in this browser. They do not update server combat rules.'); };

function entryButton(name,detail,key,active,onClick) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'catalog-entry';
    button.dataset.entry = key; button.setAttribute('aria-current',active);
    const title = document.createElement('span'); title.className = 'entry-name'; title.textContent = name;
    const sub = document.createElement('span'); sub.className = 'muted'; sub.textContent = detail;
    button.append(title,sub); button.onclick = onClick; return button;
}
function renderList() {
    el('entry-list').replaceChildren();
    if (section === 'mobs') {
        for (const [id,mob] of Object.entries(draft.enemies)) el('entry-list').append(entryButton(mob.name,
            '♥ ' + mob.hp + ' · ' + mob.reward + ' G',id,id === selectedMob,() => { selectedMob = id; render(); }));
    } else if (section === 'waves') {
        draft.presetWaves.forEach((wave,index) => el('entry-list').append(entryButton(wave.title,
            '№ ' + wave.waveNum + ' · ' + wave.enemies.reduce((sum,g) => sum + Number(g.count || 0),0) + ' enemies',String(index),index === selectedWave,() => { selectedWave = index; render(); })));
    } else if (section === 'towers') {
        const catalog = window.TOWER_DRAFT_CATALOG;
        if (catalog && catalog.TOWERS) {
            catalog.TOWERS.forEach(tower => {
                const sub = (tower.hiddenFromPlayers ? '🚫 Hidden · ' : '') + tower.cost + ' G · ' + (tower.dmgType === 'magic' ? 'magic' : 'physical');
                el('entry-list').append(entryButton(tower.name, sub, tower.id, tower.id === selectedTower, () => { selectedTower = tower.id; render(); }));
            });
        }
    }
}
function render() {
    if (!draft) return;
    const isMobs = section === 'mobs';
    const isWaves = section === 'waves';
    const isTowers = section === 'towers';
    
    el('tab-mobs').setAttribute('aria-pressed', String(isMobs));
    el('tab-waves').setAttribute('aria-pressed', String(isWaves));
    el('tab-towers').setAttribute('aria-pressed', String(isTowers));
    
    el('mob-count').textContent = '· ' + Object.keys(draft.enemies).length;
    el('wave-count').textContent = '· ' + draft.presetWaves.length;
    if (window.TOWER_DRAFT_CATALOG) {
        el('tower-count').textContent = '· ' + window.TOWER_DRAFT_CATALOG.TOWERS.length;
    }
    
    el('list-title').textContent = isMobs ? 'Bestiary' : isWaves ? 'Wave scenarios' : 'Tower arsenal';
    el('add-entry').textContent = isMobs ? '＋ Enemy' : isWaves ? '＋ Wave' : '＋ Tower';
    el('add-entry').style.display = isTowers ? 'none' : '';
    el('clone-entry').style.display = isTowers ? 'none' : '';
    el('delete-entry').style.display = isTowers ? 'none' : '';
    
    el('mob-detail').hidden = !isMobs;
    el('wave-detail').hidden = !isWaves;
    el('tower-detail').hidden = !isTowers;
    
    renderList();
    if (isMobs) renderMob();
    else if (isWaves) renderWave();
    else if (isTowers) renderTower();
    refreshSummary();
}
function renderMob() {
    const mob = draft.enemies[selectedMob];
    const builtin = builtinIds.includes(selectedMob);
    el('entry-title').textContent = mob.name;
    el('entry-subtitle').textContent = (builtin ? 'Built-in type' : 'Custom type') + ' · ' + selectedMob;
    el('delete-entry').disabled = builtin;
    const isRu = (typeof window !== 'undefined' && window.KR_I18N && window.KR_I18N.getLang() === 'ru');
    for (const field of ['name','shortName','color','description']) {
        el('mob-' + field).value = (isRu && field !== 'color') ? (_tr(mob[field]) || mob[field] || '') : mob[field];
        el('mob-' + field).oninput = event => { mob[field] = event.target.value; markDirty(); };
    }
    el('mob-numeric-fields').replaceChildren();
    for (const [field,title,min,max] of numericFields) {
        const label = document.createElement('label'); label.textContent = title;
        const input = document.createElement('input'); input.type = 'number'; input.min = min; input.max = max; input.step = 1; input.required = true;
        input.value = field === 'executeThreshold' ? Math.round(mob[field] * 100) : mob[field];
        input.id = 'mob-' + field;
        input.oninput = () => { mob[field] = input.value === '' ? null : Number(input.value) / (field === 'executeThreshold' ? 100 : 1); if (field === 'hp') mob.maxHp = mob.hp; if (field === 'speed') mob.baseSpeed = mob.speed; markDirty(); };
        label.append(input); el('mob-numeric-fields').append(label);
    }
    for (const field of ['isFlying','isRanged','isMiniBoss','aoeCleave']) {
        el('mob-' + field).checked = mob[field]; el('mob-' + field).onchange = event => { mob[field] = event.target.checked; markDirty(); };
    }
    const special = { goblin_rider:'Dismount on death', orc_wildling:'Accelerate near pack', headhunter:'Execute defenders', wulf:'Wolf dodge' };
    el('mob-behavior').textContent = special[selectedMob] ? 'Unique type mechanic: ' + special[selectedMob] + '. This is tied to the original type. Configurable traits below work for all types and their copies.' : 'Flying, attack type and group attacks use the flags above. Configure additional abilities below.';
    renderTraits();
}
function renderTraits() {
    const mob = draft.enemies[selectedMob];
    mob.traits ||= {};
    const previous = el('trait-choice').value;
    el('trait-choice').replaceChildren(); el('mob-traits').replaceChildren();
    for (const [id,definition] of Object.entries(ENEMY_TRAITS.definitions)) {
        if (!Object.hasOwn(mob.traits,id)) el('trait-choice').add(new Option(definition.icon + ' ' + definition.label,id));
    }
    if ([...el('trait-choice').options].some(option => option.value === previous)) el('trait-choice').value = previous;
    el('add-trait').disabled = !el('trait-choice').options.length;
    el('trait-choice').disabled = !el('trait-choice').options.length;
    if (!el('trait-choice').options.length) el('trait-choice').add(new Option('All traits have been added',''));
    if (!Object.keys(mob.traits).length) {
        const empty = document.createElement('p'); empty.className = 'trait-empty muted'; empty.textContent = 'This enemy has no additional traits yet.'; el('mob-traits').append(empty);
    }
    for (const [id,config] of Object.entries(mob.traits)) {
        const definition = ENEMY_TRAITS.definitions[id];
        const card = document.createElement('section'); card.className = 'trait-card'; card.dataset.trait = id;
        const heading = document.createElement('div'); heading.className = 'section-heading';
        const title = document.createElement('h4'); title.textContent = definition.icon + ' ' + definition.label;
        const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = 'Delete'; remove.className = 'danger-outline'; remove.setAttribute('aria-label','Remove trait “' + definition.label + '»');
        remove.onclick = () => { delete mob.traits[id]; markDirty(); renderTraits(); };
        heading.append(title,remove);
        const hint = document.createElement('p'); hint.className = 'muted'; hint.textContent = definition.hint;
        const fields = document.createElement('div'); fields.className = 'catalog-form';
        for (const [key,field] of Object.entries(definition.fields)) {
            const label = document.createElement('label'); label.textContent = field.label;
            const input = document.createElement(field.kind === 'enemy' ? 'select' : 'input'); input.id = 'trait-' + id + '-' + key;
            input.setAttribute('aria-label',field.label);
            if (field.kind === 'enemy') {
                for (const [enemyId,enemy] of Object.entries(draft.enemies)) input.add(new Option(enemy.name,enemyId));
                input.value = config[key];
            } else if (field.kind === 'boolean') {
                input.type = 'checkbox'; input.checked = config[key]; label.className = 'trait-flag';
            } else {
                input.type = 'number'; input.min = field.min; input.max = field.max; input.step = 1; input.required = true; input.value = config[key];
            }
            input.addEventListener(field.kind === 'number' ? 'input' : 'change',() => {
                config[key] = field.kind === 'boolean' ? input.checked : field.kind === 'number' ? (input.value === '' ? null : Number(input.value)) : input.value;
                markDirty();
            });
            label.append(input); fields.append(label);
        }
        card.append(heading,hint,fields); el('mob-traits').append(card);
    }
}
el('add-trait').onclick = () => {
    const id = el('trait-choice').value;
    if (!id || !draft) return;
    draft.enemies[selectedMob].traits[id] = ENEMY_TRAITS.defaults(id);
    if (id === 'summoning' && !draft.enemies.crow) draft.enemies[selectedMob].traits[id].type = Object.keys(draft.enemies)[0];
    markDirty(); renderTraits(); el('mob-traits').querySelector('[data-trait="' + id + '"] input, [data-trait="' + id + '"] select')?.focus();
};
function renderWave() {
    const wave = draft.presetWaves[selectedWave];
    el('entry-title').textContent = wave.title; el('entry-subtitle').textContent = 'Scenario · position ' + (selectedWave + 1) + ' of ' + draft.presetWaves.length;
    el('delete-entry').disabled = draft.presetWaves.length <= 1;
    el('wave-number').value = wave.waveNum; el('wave-title').value = wave.title; el('wave-description').value = wave.desc;
    el('wave-number').oninput = event => { wave.waveNum = event.target.value === '' ? null : Number(event.target.value); markDirty(); };
    el('wave-title').oninput = event => { wave.title = event.target.value; markDirty(); };
    el('wave-description').oninput = event => { wave.desc = event.target.value; markDirty(); };
    el('wave-groups').replaceChildren();
    wave.enemies.forEach((group,index) => {
        const row = document.createElement('div'); row.className = 'wave-group'; row.dataset.group = index;
        const typeLabel = document.createElement('label'); typeLabel.textContent = 'Enemy';
        const select = document.createElement('select'); for (const [id,mob] of Object.entries(draft.enemies)) select.add(new Option(mob.name,id)); select.value = group.type;
        select.onchange = () => { group.type = select.value; markDirty(); }; typeLabel.append(select); row.append(typeLabel);
        for (const [field,title,min,max] of [['count','Count',1,200],['offsetDelay','Delay, turns',0,100]]) {
            const label = document.createElement('label'); label.textContent = title;
            const input = document.createElement('input'); input.type = 'number'; input.min = min; input.max = max; input.step = 1; input.required = true; input.value = group[field];
            input.dataset.groupField = field; input.oninput = () => { group[field] = input.value === '' ? null : Number(input.value); markDirty(); };
            label.append(input); row.append(label);
        }
        const actions = document.createElement('div'); actions.className = 'group-actions';
        const duplicate = document.createElement('button'); duplicate.textContent = 'Copy'; duplicate.disabled = wave.enemies.length >= 30;
        duplicate.onclick = () => { wave.enemies.splice(index + 1,0,clone(group)); markDirty(); renderWave(); };
        const remove = document.createElement('button'); remove.textContent = '✕'; remove.setAttribute('aria-label','Remove group ' + (index + 1)); remove.disabled = wave.enemies.length <= 1;
        remove.onclick = () => { wave.enemies.splice(index,1); markDirty(); renderWave(); };
        actions.append(duplicate,remove); row.append(actions); el('wave-groups').append(row);
    });
    el('add-group').disabled = wave.enemies.length >= 30;
    el('move-wave-up').disabled = selectedWave === 0; el('move-wave-down').disabled = selectedWave === draft.presetWaves.length - 1;
}
function refreshSummary() {
    if (!draft) return;
    if (section === 'towers') {
        const catalog = window.TOWER_DRAFT_CATALOG;
        if (!catalog) return;
        const tower = catalog.getTowerById(selectedTower);
        if (!tower) return;
        el('entry-title').textContent = tower.name;
        el('tower-preview-name').textContent = tower.name;
        el('tower-token').textContent = tower.icon || '🏰';
        el('tower-token').style.backgroundColor = tower.color || '#8d6e63';
        el('tower-preview-stats').textContent = tower.cost + ' G · ' + (tower.damageRange || tower.progressionLabel) + ' · range ' + (tower.range || 3);
        el('tower-preview-progression').textContent = (tower.hiddenFromPlayers ? '🚫 Hidden from players | ' : '👁️ Available to players | ') + (tower.progressionLabel || '');
        const entry = el('entry-list').querySelector('[data-entry="' + selectedTower + '"]');
        if (entry) {
            entry.querySelector('.entry-name').textContent = tower.name;
            entry.querySelector('.muted').textContent = (tower.hiddenFromPlayers ? '🚫 Hidden · ' : '') + tower.cost + ' G · ' + (tower.dmgType === 'magic' ? 'magic' : 'physical');
        }
        return;
    }
    if (section === 'mobs') {
        const mob = draft.enemies[selectedMob];
        el('entry-title').textContent = mob.name; el('mob-preview-name').textContent = mob.name;
        el('mob-token').textContent = mob.shortName; el('mob-token').style.backgroundColor = mob.color;
        el('mob-preview-stats').textContent = '♥ ' + mob.hp + ' · speed ' + mob.speed + ' · reward ' + mob.reward + ' G';
        el('mob-trait-summary').textContent = Object.keys(mob.traits || {}).length ? 'Traits: ' + Object.keys(mob.traits).map(id => ENEMY_TRAITS.definitions[id].icon + ' ' + ENEMY_TRAITS.definitions[id].label).join(' · ') : '＋ Configure traits';
        const entry = el('entry-list').querySelector('[data-entry="' + selectedMob + '"]');
        if (entry) { entry.querySelector('.entry-name').textContent = mob.name; entry.querySelector('.muted').textContent = '♥ ' + mob.hp + ' · ' + mob.reward + ' G'; }
    } else {
        const wave = draft.presetWaves[selectedWave];
        const total = wave.enemies.reduce((sum,g) => sum + Number(g.count || 0),0);
        el('entry-title').textContent = wave.title; el('wave-total').textContent = total;
        el('wave-reward').textContent = wave.enemies.reduce((sum,g) => sum + Number(g.count || 0) * Number(draft.enemies[g.type]?.reward || 0),0) + ' G';
        const lastDelay = Math.max(...wave.enemies.map(g => Number(g.offsetDelay || 0)));
        el('wave-delay').textContent = lastDelay ? _tr('turn ') + lastDelay : _tr('immediately');
        const entry = el('entry-list').querySelector('[data-entry="' + selectedWave + '"]');
        if (entry) { entry.querySelector('.entry-name').textContent = wave.title; entry.querySelector('.muted').textContent = '№ ' + wave.waveNum + ' · ' + total + ' enemies'; }
    }
}
function addMob(source) {
    if (Object.keys(draft.enemies).length >= 100) { notify('Limit: 100 enemy types',true); return; }
    let n = 1; while (draft.enemies['custom_' + n]) n++;
    const id = 'custom_' + n;
    draft.enemies[id] = source ? clone(source) : { name:'New enemy',shortName:'Enemy',color:'#388e3c',description:'',hp:40,maxHp:40,speed:1,baseSpeed:1,initiative:10,armor:0,magicRes:0,reward:5,meleeDmg:3,rangedDmg:6,range:4,livesTaken:1,dodgeChance:0,healPower:25,executeThreshold:0,isFlying:false,isRanged:false,isMiniBoss:false,aoeCleave:false,traits:{} };
    if (source) draft.enemies[id].name += ' — copy';
    selectedMob = id; markDirty(); render();
}
function addWave(source) {
    if (draft.presetWaves.length >= 200) { notify('Limit: 200 waves',true); return; }
    const number = Math.max(...draft.presetWaves.map(w => Number(w.waveNum || 0))) + 1;
    if (number > 10000) { notify('Maximum wave number: 10000',true); return; }
    const wave = source ? clone(source) : { title:'New wave',desc:'',enemies:[{type:Object.keys(draft.enemies)[0],count:1,offsetDelay:0}] };
    wave.waveNum = number; if (source) wave.title += ' — copy';
    draft.presetWaves.push(wave); selectedWave = draft.presetWaves.length - 1; markDirty(); render();
}
el('add-entry').onclick = () => section === 'mobs' ? addMob() : addWave();
el('clone-entry').onclick = () => section === 'mobs' ? addMob(draft.enemies[selectedMob]) : addWave(draft.presetWaves[selectedWave]);
el('delete-entry').onclick = () => {
    if (section === 'mobs') {
        if (builtinIds.includes(selectedMob)) return;
        if (Object.values(draft.enemies).some(mob => mob.traits?.summoning?.type === selectedMob)) { notify('This enemy is used by a summoner. Change the type in the summoner\'s settings first.',true); return; }
        if (draft.presetWaves.some(w => w.enemies.some(g => g.type === selectedMob))) { notify('This enemy is used in waves. Replace or remove the corresponding groups first.',true); return; }
        requestConfirmation('Delete enemy type?',draft.enemies[selectedMob].name + ' will be removed from the catalog after saving.',() => { delete draft.enemies[selectedMob]; selectedMob = Object.keys(draft.enemies)[0]; markDirty(); render(); });
    } else if (draft.presetWaves.length > 1) {
        requestConfirmation('Delete scenario?',draft.presetWaves[selectedWave].title + ' will be removed from the catalog after saving.',() => { draft.presetWaves.splice(selectedWave,1); selectedWave = Math.max(0,selectedWave - 1); markDirty(); render(); });
    }
};
el('add-group').onclick = () => { draft.presetWaves[selectedWave].enemies.push({type:selectedMob || Object.keys(draft.enemies)[0],count:1,offsetDelay:0}); markDirty(); renderWave(); refreshSummary(); };
function moveWave(delta) {
    const next = selectedWave + delta;
    if (next < 0 || next >= draft.presetWaves.length) return;
    [draft.presetWaves[selectedWave],draft.presetWaves[next]] = [draft.presetWaves[next],draft.presetWaves[selectedWave]];
    selectedWave = next; markDirty(); render();
}
el('move-wave-up').onclick = () => moveWave(-1); el('move-wave-down').onclick = () => moveWave(1);
connectEditor(); controls();


let selectedTowerLevel = 0;

function renderTower() {
    const catalog = window.TOWER_DRAFT_CATALOG;
    if (!catalog) return;
    const tower = catalog.getTowerById(selectedTower) || catalog.TOWERS[0];
    if (!tower) return;
    selectedTower = tower.id;
    
    // Header & Titles
    el('entry-title').textContent = tower.name;
    el('entry-subtitle').textContent = (tower.progressionLabel || '') + ' · ' + tower.id;
    
    const isRuTower = (typeof window !== 'undefined' && window.KR_I18N && window.KR_I18N.getLang() === 'ru');
    // Main Form
    el('tower-name').value = isRuTower ? (_tr(tower.name) || tower.name || '') : (tower.name || '');
    el('tower-name').oninput = e => { tower.name = e.target.value; markDirty(); };
    
    el('tower-shortName').value = tower.icon || tower.shortName || '';
    el('tower-shortName').oninput = e => { tower.icon = e.target.value; markDirty(); };
    
    el('tower-color').value = tower.color || '#8d6e63';
    el('tower-color').oninput = e => { tower.color = e.target.value; markDirty(); };
    
    el('tower-description').value = isRuTower ? (_tr(tower.description) || tower.description || '') : (tower.description || '');
    el('tower-description').oninput = e => { tower.description = e.target.value; markDirty(); };
    
    // Flags
    el('tower-hiddenFromPlayers').checked = !!tower.hiddenFromPlayers;
    el('tower-hiddenFromPlayers').onchange = e => {
        tower.hiddenFromPlayers = e.target.checked;
        saveTowerCatalog();
        markDirty();
        renderList();
        refreshSummary();
    };
    
    el('tower-isBarracks').checked = tower.archetype === 'barracks';
    el('tower-isBarracks').onchange = e => {
        tower.archetype = e.target.checked ? 'barracks' : 'magic';
        markDirty();
        renderTowerLevel();
        refreshSummary();
    };
    
    el('tower-isSingleProgression').checked = tower.progressionType === 'single';
    el('tower-isSingleProgression').onchange = e => {
        tower.progressionType = e.target.checked ? 'single' : 'branch';
        tower.progressionLabel = tower.progressionType === 'single' ? '1 direct line (I ➔ IV)' : 'Branches at level IV';
        markDirty();
        renderTower();
    };

    // Level tabs
    const levelTabs = el('tower-level-tabs');
    levelTabs.replaceChildren();
    
    const levels = Array.isArray(tower.levels) ? tower.levels : [];
    if (selectedTowerLevel >= levels.length) selectedTowerLevel = 0;
    
    levels.forEach((lvlObj, idx) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'level-tab-btn';
        const label = lvlObj.branchName ? (lvlObj.lvl + ' (' + lvlObj.branchName + ')') : ('Level ' + lvlObj.lvl);
        btn.textContent = label;
        btn.setAttribute('aria-pressed', String(idx === selectedTowerLevel));
        btn.onclick = () => {
            selectedTowerLevel = idx;
            renderTower();
        };
        levelTabs.append(btn);
    });

    renderTowerLevel();
    renderTowerEffects();
    refreshSummary();
}

function renderTowerLevel() {
    const catalog = window.TOWER_DRAFT_CATALOG;
    if (!catalog) return;
    const tower = catalog.getTowerById(selectedTower);
    if (!tower || !tower.levels || !tower.levels[selectedTowerLevel]) return;
    
    const lvlObj = tower.levels[selectedTowerLevel];
    const fieldsContainer = el('tower-level-fields');
    fieldsContainer.replaceChildren();

    const isBarracks = tower.archetype === 'barracks';

    // Helper to create input field
    function createField(title, value, type, onchange, min, max, spanTwo = false) {
        const label = document.createElement('label');
        if (spanTwo) label.className = 'span-two';
        label.textContent = title;
        const input = document.createElement('input');
        input.type = type;
        if (min !== undefined) input.min = min;
        if (max !== undefined) input.max = max;
        input.value = value != null ? value : '';
        input.oninput = () => {
            onchange(type === 'number' ? (input.value === '' ? 0 : Number(input.value)) : input.value);
            markDirty();
        };
        label.append(input);
        fieldsContainer.append(label);
        return input;
    }

    const isRuLvl = (typeof window !== 'undefined' && window.KR_I18N && window.KR_I18N.getLang() === 'ru');
    // 1. Level Title
    createField('Level name', isRuLvl ? (_tr(lvlObj.name) || lvlObj.name || '') : (lvlObj.name || ''), 'text', val => {
        lvlObj.name = val;
    }, undefined, undefined, true);

    // 2. Cost
    createField('Build / upgrade cost (G)', lvlObj.cost || 70, 'number', val => {
        lvlObj.cost = val;
        if (selectedTowerLevel === 0) tower.cost = val;
    }, 10, 2000);

    // 3. Range
    createField('Range (cells)', lvlObj.range || tower.range || 3, 'number', val => {
        lvlObj.range = val;
        if (selectedTowerLevel === 0) tower.range = val;
    }, 1, 15);

    // 4. Initiative
    createField('Initiative', lvlObj.initiative || tower.initiative || 12, 'number', val => {
        lvlObj.initiative = val;
    }, 1, 100);

    // 5. Combat Damage OR Soldier stats
    if (!isBarracks) {
        // Range / Magic / Artillery
        createField('Min. damage', lvlObj.minDmg || 4, 'number', val => {
            lvlObj.minDmg = val;
            updateTowerDamageSummary(tower);
        }, 1, 1000);

        createField('Max. damage', lvlObj.maxDmg || 18, 'number', val => {
            lvlObj.maxDmg = val;
            updateTowerDamageSummary(tower);
        }, 1, 1000);

        // Damage Type selector
        const dmgLabel = document.createElement('label');
        dmgLabel.textContent = 'Damage type';
        const dmgSelect = document.createElement('select');
        [
            ['phys', 'Physical'],
            ['magic', 'Magic'],
            ['pure', 'True']
        ].forEach(([key, name]) => {
            const opt = document.createElement('option');
            opt.value = key;
            opt.textContent = name;
            if (lvlObj.dmgType === key || (!lvlObj.dmgType && tower.dmgType === key)) opt.selected = true;
            dmgSelect.append(opt);
        });
        dmgSelect.onchange = () => {
            lvlObj.dmgType = dmgSelect.value;
            tower.dmgType = dmgSelect.value;
            markDirty();
            refreshSummary();
        };
        dmgLabel.append(dmgSelect);
        fieldsContainer.append(dmgLabel);
    } else {
        // BARRACKS ONLY: Soldier stats
        createField('Soldier melee damage', lvlObj.soldierDmg || lvlObj.dmg || 4, 'number', val => {
            lvlObj.soldierDmg = val;
            updateTowerDamageSummary(tower);
        }, 1, 500);

        createField('Garrison soldier HP', lvlObj.soldierHp || lvlObj.hp || 40, 'number', val => {
            lvlObj.soldierHp = val;
            updateTowerBarracksSummary(tower);
        }, 10, 2000);

        createField('Soldier armor, %', lvlObj.soldierArmor != null ? lvlObj.soldierArmor : 5, 'number', val => {
            lvlObj.soldierArmor = val;
            updateTowerBarracksSummary(tower);
        }, 0, 100);

        createField('Soldier count', lvlObj.soldierCount || 3, 'number', val => {
            lvlObj.soldierCount = val;
        }, 1, 10);

        createField('Respawn (turns)', lvlObj.respawnTurns || 2, 'number', val => {
            lvlObj.respawnTurns = val;
        }, 1, 10);
    }

    // Special mechanics
    if (tower.id === 'dwarf_outpost' || lvlObj.goldPerRound != null) {
        createField('💰 Gold mined per turn (G)', lvlObj.goldPerRound || 4, 'number', val => {
            lvlObj.goldPerRound = val;
        }, 0, 100);
    }
    if (tower.id === 'necro_tower' || lvlObj.skeletonLimit != null) {
        createField('💀 Skeleton limit on map', lvlObj.skeletonLimit || 2, 'number', val => {
            lvlObj.skeletonLimit = val;
        }, 1, 20);
    }
}

function updateTowerDamageSummary(tower) {
    if (!tower.levels || !tower.levels.length) return;
    const min = tower.levels[0].minDmg || tower.levels[0].soldierDmg || 4;
    const last = tower.levels[tower.levels.length - 1];
    const max = last.maxDmg || last.soldierDmg || 18;
    tower.damageRange = min + ' – ' + max;
    refreshSummary();
}

function updateTowerBarracksSummary(tower) {
    if (!tower.levels || !tower.levels.length) return;
    const minHp = tower.levels[0].soldierHp || 40;
    const last = tower.levels[tower.levels.length - 1];
    const maxHp = last.soldierHp || 150;
    tower.hpRange = minHp + ' – ' + maxHp + ' HP';
    const minArmor = tower.levels[0].soldierArmor != null ? tower.levels[0].soldierArmor : 5;
    const maxArmor = last.soldierArmor != null ? last.soldierArmor : 20;
    tower.armorRange = minArmor + '% – ' + maxArmor + '%';
    refreshSummary();
}

function renderTowerEffects() {
    const catalog = window.TOWER_DRAFT_CATALOG;
    if (!catalog) return;
    const tower = catalog.getTowerById(selectedTower);
    if (!tower) return;

    const effectsContainer = el('tower-effects-list');
    effectsContainer.replaceChildren();

    // Hook up Add effect button
    el('add-tower-effect').onclick = () => {
        tower.effects ||= [];
        tower.effects.push({
            name: 'New upgrade',
            icon: '⚡',
            cost: 140,
            cooldown: 3,
            tag: 'Combat ability',
            desc: 'Describe what this upgrade does.'
        });
        markDirty();
        renderTowerEffects();
    };

    if (!tower.effects || !tower.effects.length) {
        const empty = document.createElement('p');
        empty.className = 'trait-empty muted';
        empty.textContent = 'This tower has no level IV upgrades yet. Click “＋ Ability” above to add one.';
        effectsContainer.append(empty);
        return;
    }

    tower.effects.forEach((eff, idx) => {
        const card = document.createElement('section');
        card.className = 'trait-card tower-card-effect';

        const heading = document.createElement('div');
        heading.className = 'section-heading';

        const title = document.createElement('h4');
        const iconSpan = document.createElement('span');
        iconSpan.textContent = (eff.icon || '⚡') + ' ';
        const nameSpan = document.createElement('span');
        nameSpan.textContent = eff.name || 'Unnamed upgrade';
        
        const cdBadge = document.createElement('span');
        cdBadge.className = 'tower-badge-tag ' + (eff.cooldown ? 'badge-danger' : 'badge-gold');
        cdBadge.style.marginLeft = '8px';
        cdBadge.textContent = eff.cooldown ? ('CD: ' + eff.cooldown + ' rounds') : 'Passive';
        
        title.append(iconSpan, nameSpan, cdBadge);

        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'danger-outline';
        removeBtn.textContent = 'Delete';
        removeBtn.onclick = () => {
            tower.effects.splice(idx, 1);
            markDirty();
            renderTowerEffects();
        };

        heading.append(title, removeBtn);

        const form = document.createElement('div');
        form.className = 'catalog-form';

        const isRuEff = (typeof window !== 'undefined' && window.KR_I18N && window.KR_I18N.getLang() === 'ru');
        // 1. Ability Name
        const nameLabel = document.createElement('label');
        nameLabel.textContent = 'Ability name';
        const nameInput = document.createElement('input');
        nameInput.value = isRuEff ? (_tr(eff.name) || eff.name || '') : (eff.name || '');
        nameInput.oninput = () => {
            eff.name = nameInput.value;
            nameSpan.textContent = nameInput.value || 'Unnamed upgrade';
            markDirty();
        };
        nameLabel.append(nameInput);

        // 2. Icon
        const iconLabel = document.createElement('label');
        iconLabel.textContent = 'Icon';
        const iconInput = document.createElement('input');
        iconInput.value = eff.icon || '⚡';
        iconInput.maxLength = 6;
        iconInput.oninput = () => {
            eff.icon = iconInput.value;
            iconSpan.textContent = (iconInput.value || '⚡') + ' ';
            markDirty();
        };
        iconLabel.append(iconInput);

        // 3. Cost
        const costLabel = document.createElement('label');
        costLabel.textContent = 'Cost (G)';
        const costInput = document.createElement('input');
        costInput.type = 'number';
        costInput.min = 0;
        costInput.max = 2000;
        costInput.value = eff.cost != null ? eff.cost : 140;
        costInput.oninput = () => {
            eff.cost = Number(costInput.value);
            markDirty();
        };
        costLabel.append(costInput);

        // 4. Cooldown (КД в раундах)
        const cdLabel = document.createElement('label');
        cdLabel.textContent = 'Cooldown (CD), turns (0 = passive)';
        const cdInput = document.createElement('input');
        cdInput.type = 'number';
        cdInput.min = 0;
        cdInput.max = 30;
        cdInput.value = eff.cooldown != null ? eff.cooldown : 0;
        cdInput.oninput = () => {
            eff.cooldown = Number(cdInput.value);
            cdBadge.className = 'tower-badge-tag ' + (eff.cooldown ? 'badge-danger' : 'badge-gold');
            cdBadge.textContent = eff.cooldown ? ('CD: ' + eff.cooldown + ' rounds') : 'Passive';
            markDirty();
        };
        cdLabel.append(cdInput);

        // 5. Category Tag
        const tagLabel = document.createElement('label');
        tagLabel.className = 'span-two';
        tagLabel.textContent = 'Effect label / tag';
        const tagInput = document.createElement('input');
        tagInput.value = isRuEff ? (_tr(eff.tag) || eff.tag || '') : (eff.tag || '');
        tagInput.placeholder = 'For example: Stun, True DoT, Group healing...';
        tagInput.oninput = () => {
            eff.tag = tagInput.value;
            markDirty();
        };
        tagLabel.append(tagInput);

        // 6. Description
        const descLabel = document.createElement('label');
        descLabel.className = 'span-two';
        descLabel.textContent = 'Combat effect description';
        const descArea = document.createElement('textarea');
        descArea.rows = 2;
        descArea.value = isRuEff ? (_tr(eff.desc) || eff.desc || '') : (eff.desc || '');
        descArea.oninput = () => {
            eff.desc = descArea.value;
            markDirty();
        };
        descLabel.append(descArea);

        form.append(nameLabel, iconLabel, costLabel, cdLabel, tagLabel, descLabel);
        card.append(heading, form);
        effectsContainer.append(card);
    });
}

function saveTowerCatalog() {
    try {
        if (window.TOWER_DRAFT_CATALOG) {
            localStorage.setItem('kr_tower_catalog_custom', JSON.stringify(window.TOWER_DRAFT_CATALOG.TOWERS));
            // Keep in-memory TOWER_CATALOG_DATA updated
            if (window.TOWER_CATALOG_DATA && window.TOWER_CATALOG_DATA.TOWERS) {
                window.TOWER_DRAFT_CATALOG.TOWERS.forEach(t => {
                    if (window.TOWER_CATALOG_DATA.TOWERS[t.id]) {
                        window.TOWER_CATALOG_DATA.TOWERS[t.id].hiddenFromPlayers = !!t.hiddenFromPlayers;
                    }
                });
            }
        }
    } catch (e) {
        console.error('saveTowerCatalog error:', e);
    }
}

function loadSavedTowerCatalog() {
    try {
        const raw = localStorage.getItem('kr_tower_catalog_custom');
        if (raw && window.TOWER_DRAFT_CATALOG) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                for (const item of parsed) {
                    const existing = window.TOWER_DRAFT_CATALOG.getTowerById(item.id);
                    if (existing) {
                        Object.assign(existing, item);
                    }
                }
            }
        }
    } catch (e) {}
}
loadSavedTowerCatalog();


if (typeof window !== 'undefined') {
    window.addEventListener('kr6:langchange', () => {
        if (typeof render === 'function') render();
        if (typeof controls === 'function') controls();
    });
}
