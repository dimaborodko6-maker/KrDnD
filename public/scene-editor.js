var _tr = typeof _tr !== 'undefined' ? _tr : (text => (typeof window !== 'undefined' && window.KR_I18N ? window.KR_I18N.t(text) : text));
'use strict';
const sceneEl = id => document.getElementById(id);
const sceneClone = value => JSON.parse(JSON.stringify(value));
let library = [], libraryRevision = -1, sceneDraft = null, sceneDirty = false, sceneOnline = false, sceneSaving = false, sceneConflict = false;
let sceneSocket, selectedCell = null, noteEditor = null, noteForm = null, notePending = false, reloadRequested = false, sceneFit = false;
function sceneNotify(message, error = false) {
    sceneEl('scene-notice').textContent = message;
    sceneEl('scene-notice').hidden = !message;
    sceneEl('scene-notice').classList.toggle('error',error);
}
function sceneControls() {
    sceneEl('scene-fields').hidden = !sceneDraft;
    sceneEl('scene-fields').disabled = !sceneDraft || sceneSaving;
    sceneEl('scene-empty').hidden = !!sceneDraft;
    sceneEl('save-scene').disabled = !sceneDraft || !sceneDirty || !sceneOnline || sceneSaving || sceneConflict;
    sceneEl('reload-scenes').disabled = sceneSaving;
    sceneEl('capture-scene').disabled = !sceneOnline || sceneSaving;
    sceneEl('new-scene').disabled = libraryRevision < 0 || sceneSaving;
    sceneEl('delete-scene').disabled = !sceneDraft || !library.some(scene => scene.id === sceneDraft.id) || !sceneOnline || sceneConflict;
    sceneEl('scene-save-state').textContent = sceneSaving ? _tr('Saving…') : sceneConflict ? _tr('The library changed in another window') : sceneDirty ? _tr('You have unsaved changes') : libraryRevision < 0 ? _tr('Loading…') : _tr('Saved · version ')+libraryRevision;
    sceneEl('scene-save-state').classList.toggle('dirty',sceneDirty || sceneConflict);
}
function sceneSend(message) {
    if (!sceneOnline) { sceneNotify('Disconnected. Your changes remain in this window.',true); return false; }
    sceneSocket.send(JSON.stringify(message)); return true;
}
function sceneChanged() { sceneDirty = true; sceneControls(); }
function discardSceneChanges() { return !sceneDirty || confirm('Discard unsaved scene changes?'); }
function connectSceneEditor() {
    sceneSocket = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://')+location.host);
    window.KR_DIAGNOSTICS?.trackSocket(sceneSocket);
    sceneSocket.onopen = () => { sceneOnline = true; sceneEl('scene-connection').textContent = _tr('connected'); sceneSend({type:'REGISTER_SCENE_EDITOR'}); sceneControls(); };
    sceneSocket.onclose = () => { sceneOnline = false; sceneSaving = false; sceneEl('scene-connection').textContent = _tr('disconnected'); sceneNotify('Connection lost. Your draft remains in this window. Click “Load from server” to reconnect.',true); sceneControls(); };
    sceneSocket.onerror = () => sceneNotify('Could not connect to the server.',true);
    sceneSocket.onmessage = event => {
        const message = JSON.parse(event.data);
        if (message.type === 'COMMAND_ERROR') { sceneSaving = false; sceneNotify(message.message,true); sceneControls(); return; }
        if (message.type === 'CATALOG_UPDATE') { Object.assign(GAME_DATA,message.catalog); renderSceneChoices(); return; }
        if (message.type === 'SCENE_CAPTURED') {
            sceneDraft = message.scene; selectedCell = null; sceneDirty = true; sceneSaving = false; renderScene();
            sceneNotify('Current map copied to draft. The game state has not changed.'); return;
        }
        if (message.type !== 'SCENE_LIBRARY') return;
        if (sceneDirty && !reloadRequested && message.reason !== 'saved') {
            if (message.revision !== libraryRevision) { sceneConflict = true; sceneNotify('A new version was saved in another window. Your draft remains here. Load the library from the server before saving.',true); }
            sceneControls(); return;
        }
        library = message.scenes; libraryRevision = message.revision;
        const previousId = sceneDraft?.id;
        sceneDraft = sceneClone(library.find(scene => scene.id === previousId) || library[0] || null);
        sceneDirty = sceneSaving = sceneConflict = reloadRequested = false;
        selectedCell = null; renderScene();
        sceneNotify(message.reason === 'saved' ? 'Library saved. Open the scene from the GM dashboard.' : '');
    };
}
function renderSceneChoices() {
    const enemyChoice = sceneEl('scene-enemy-type'), selectedEnemy = enemyChoice.value;
    enemyChoice.replaceChildren();
    for (const [id,enemy] of Object.entries(GAME_DATA.enemies)) enemyChoice.add(new Option(enemy.name,id));
    if (Object.hasOwn(GAME_DATA.enemies,selectedEnemy)) enemyChoice.value = selectedEnemy;
    const waves = sceneEl('scene-wave-choice'), selectedWave = waves.value;
    waves.replaceChildren();
    GAME_DATA.presetWaves.forEach((wave,index) => waves.add(new Option(wave.title,index)));
    if (GAME_DATA.presetWaves[selectedWave]) waves.value = selectedWave;
    const brush = sceneEl('scene-brush'), selectedBrush = brush.value;
    brush.querySelectorAll('[data-scene-tower]').forEach(option => option.remove());
    for (const [id,tower] of Object.entries(GAME_DATA.towers)) {
        const option = new Option('Tower: '+tower.name,id); option.dataset.sceneTower = 'true'; brush.add(option);
    }
    brush.value = selectedBrush || 'inspect';
}
function sceneButton(label, action, danger = false) {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = label;
    if (danger) button.className = 'danger-outline'; button.onclick = action; return button;
}
function renderSceneList() {
    sceneEl('scene-count').textContent = library.length+'/100';
    sceneEl('scene-list').replaceChildren();
    for (const scene of library) {
        const button = sceneButton('',() => {
            if (sceneSaving || !discardSceneChanges()) return;
            sceneDraft = sceneClone(scene); sceneDirty = false; selectedCell = null; renderScene(); sceneNotify('');
        });
        button.className = 'scene-entry'; button.setAttribute('aria-pressed',String(sceneDraft?.id === scene.id));
        const title = document.createElement('strong'); title.textContent = scene.title;
        const detail = document.createElement('span'); detail.className = 'muted'; detail.textContent = scene.gridWidth+' × '+scene.gridHeight+' · waves: '+scene.waves.length+' · notes: '+scene.notes.length;
        button.append(title,detail); sceneEl('scene-list').append(button);
    }
    if (!library.length) sceneEl('scene-list').textContent = _tr('No saved scenes yet.');
}
function renderScene() {
    sceneControls(); renderSceneList();
    if (!sceneDraft) return;
    for (const [field,key] of [['title','title'],['description','description'],['objectives','objectives'],['gold','gold'],['base-hp','baseHp'],['width','gridWidth'],['height','gridHeight']]) sceneEl('scene-'+field).value = sceneDraft[key];
    sceneEl('scene-heading').textContent = sceneDraft.title;
    renderSceneRoster(); renderSceneMap(); renderSceneCell(); renderSceneWaves();
    if(typeof renderScenePlanning === 'function')renderScenePlanning();
}
function renderSceneRoster() {
    sceneEl('scene-tower-roster').replaceChildren();
    for (const type of TOWER_RULES.getBaseTypes(GAME_DATA.towers)) {
        const button = sceneButton(GAME_DATA.towers[type].name,() => {
            const types = sceneDraft.availableTowerTypes;
            if (types.includes(type)) {
                if (TOWER_RULES.getBuiltFamilies(sceneDraft,GAME_DATA.towers).has(type)) { sceneNotify('Remove all towers of this type from the map first.',true); return; }
                sceneDraft.availableTowerTypes = types.filter(value => value !== type);
            } else {
                if (types.length >= 5) { sceneNotify('You can select no more than 5 types.',true); return; }
                types.push(type);
            }
            sceneChanged(); renderSceneRoster();
        });
        button.setAttribute('aria-pressed',String(sceneDraft.availableTowerTypes.includes(type))); sceneEl('scene-tower-roster').append(button);
    }
}
function renderSceneMap() {
    const grid = sceneEl('scene-grid'); grid.replaceChildren();
    grid.style.gridTemplateColumns = 'repeat('+sceneDraft.gridWidth+',52px)'; grid.style.gridTemplateRows = 'repeat('+sceneDraft.gridHeight+',52px)';
    for (const row of sceneDraft.grid) for (const cell of row) {
        const button = sceneButton('',() => editSceneCell(cell.x,cell.y));
        button.className = 'cell '+cell.type+(selectedCell?.x === cell.x && selectedCell?.y === cell.y ? ' selected-cell' : '');
        button.setAttribute('aria-label','Cell '+cell.x+', '+cell.y); button.dataset.x = cell.x; button.dataset.y = cell.y;
        const coords = document.createElement('span'); coords.className = 'coords'; coords.textContent = cell.x+','+cell.y; button.append(coords);
        if (GAME_DATA.towers[cell.type]) { const name = document.createElement('span'); name.textContent = GAME_DATA.towers[cell.type].name; button.append(name); }
        const enemies = sceneDraft.enemies.filter(group => group.x === cell.x && group.y === cell.y);
        if (enemies.length) { const badge = document.createElement('span'); badge.className = 'scene-enemy-badge'; badge.textContent = '⚔ '+enemies.reduce((sum,group) => sum+group.count,0); button.append(badge); }
        const notes = sceneDraft.notes.filter(note => note.x === cell.x && note.y === cell.y);
        if (notes.length) { const badge = document.createElement('span'); badge.className = 'scene-note-badge'; badge.textContent = '✎ '+notes.length; button.append(badge); }
        grid.append(button);
    }
    applySceneFit();
}
function applySceneFit() {
    sceneEl('scene-grid').style.zoom = sceneFit ? Math.min(1,Math.max(.15,(sceneEl('scene-map-viewport').clientWidth-18)/(sceneDraft.gridWidth*54+16))) : 1;
}
function editSceneCell(x,y) {
    selectedCell = {x,y}; const brush = sceneEl('scene-brush').value;
    if (brush === 'note') { openDraftNote(null); return; }
    if (brush === 'enemy') { placeSceneEnemy(); return; }
    if (brush !== 'inspect') {
        if (Object.hasOwn(GAME_DATA.towers,brush)) {
            const family = TOWER_RULES.getFamily(GAME_DATA.towers,brush);
            if (!sceneDraft.availableTowerTypes.includes(family)) { sceneNotify('Add this tower type to the team roster first.',true); return; }
        }
        sceneDraft.grid[y][x] = {x,y,type:brush}; sceneChanged();
    }
    renderSceneMap(); renderSceneCell();
}
function placeSceneEnemy() {
    if (!selectedCell) { sceneNotify('Select a map cell first.',true); return; }
    if (!sceneEl('scene-enemy-count').reportValidity()) return;
    const type = sceneEl('scene-enemy-type').value, count = Number(sceneEl('scene-enemy-count').value);
    if (sceneDraft.enemies.reduce((sum,group) => sum+group.count,0)+count > 500) { sceneNotify('No more than 500 enemies per scene.',true); return; }
    const group = sceneDraft.enemies.find(group => group.x === selectedCell.x && group.y === selectedCell.y && group.type === type);
    if (group && group.count+count <= 200) group.count += count;
    else {
        if (sceneDraft.enemies.length >= 100) { sceneNotify('No more than 100 enemy groups.',true); return; }
        sceneDraft.enemies.push({type,count,...selectedCell});
    }
    sceneChanged(); renderSceneMap(); renderSceneCell();
}
function renderSceneCell() {
    const container = sceneEl('scene-cell-detail'); container.replaceChildren();
    sceneEl('scene-cell-title').textContent = selectedCell ? 'Cell '+selectedCell.x+', '+selectedCell.y : 'Select a cell';
    if (!selectedCell) return;
    const {x,y} = selectedCell;
    sceneDraft.enemies.forEach((group,index) => {
        if (group.x !== x || group.y !== y) return;
        const row = document.createElement('div'); row.className = 'scene-detail-entry';
        const name = document.createElement('p'); name.textContent = (GAME_DATA.enemies[group.type]?.name || group.type)+' × '+group.count;
        row.append(name,sceneButton('Remove group',() => { sceneDraft.enemies.splice(index,1); sceneChanged(); renderSceneMap(); renderSceneCell(); },true)); container.append(row);
    });
    for (const note of sceneDraft.notes.filter(note => note.x === x && note.y === y)) {
        const row = document.createElement('div'); row.className = 'scene-detail-entry';
        row.append(sceneButton('✎ '+note.title,() => openDraftNote(note))); container.append(row);
    }
    container.append(sceneButton('＋ Note in this cell',() => openDraftNote(null)));
}
function openDraftNote(note) {
    noteEditor = note ? sceneClone(note) : {id:sceneNewId(),...selectedCell,title:'New note'};
    noteForm = sceneNoteForm(sceneEl('scene-note-fields'),noteEditor); notePending = false;
    sceneEl('scene-note-title').textContent = _tr('Note · ')+noteEditor.x+', '+noteEditor.y;
    sceneEl('scene-note-delete').hidden = !note;
    sceneEl('scene-note-dialog').showModal();
}
function closeDraftNote() {
    if (notePending && !confirm('Discard note changes?')) return;
    notePending = false; sceneEl('scene-note-dialog').close();
}
sceneEl('scene-note-fields').oninput = () => { notePending = true; };
sceneEl('scene-note-form').onsubmit = event => {
    event.preventDefault(); if (!noteForm.valid()) return;
    const note = {...noteEditor,...noteForm.read()}, index = sceneDraft.notes.findIndex(item => item.id === note.id);
    if (index < 0 && sceneDraft.notes.length >= 200) { sceneNotify('No more than 200 notes per scene.',true); return; }
    if (index < 0) sceneDraft.notes.push(note); else sceneDraft.notes[index] = note;
    notePending = false; sceneEl('scene-note-dialog').close(); sceneChanged(); renderSceneMap(); renderSceneCell();
};
sceneEl('scene-note-close').onclick = closeDraftNote;
sceneEl('scene-note-dialog').addEventListener('cancel',event => { event.preventDefault(); closeDraftNote(); });
sceneEl('scene-note-delete').onclick = () => {
    if (!confirm('Delete note from draft?')) return;
    sceneDraft.notes = sceneDraft.notes.filter(note => note.id !== noteEditor.id); notePending = false;
    sceneEl('scene-note-dialog').close(); sceneChanged(); renderSceneMap(); renderSceneCell();
};
function renderSceneWaves() {
    sceneEl('scene-waves').replaceChildren();
    sceneDraft.waves.forEach((wave,index) => {
        const row = document.createElement('div'); row.className = 'scene-wave-row';
        const info = document.createElement('div'), title = document.createElement('strong'), summary = document.createElement('p');
        title.textContent = (index+1)+'. '+wave.title; summary.className = 'muted';
        summary.textContent = wave.enemies.map(group => (GAME_DATA.enemies[group.type]?.name || group.type)+' × '+group.count+(group.offsetDelay ? ' (in '+group.offsetDelay+' turns)' : '')).join(' · ');
        info.append(title,summary); const buttons = document.createElement('div'); buttons.className = 'button-row';
        for (const [label,delta] of [['↑',-1],['↓',1]]) {
            const button = sceneButton(label,() => { [sceneDraft.waves[index],sceneDraft.waves[index+delta]] = [sceneDraft.waves[index+delta],sceneDraft.waves[index]]; sceneChanged(); renderSceneWaves(); });
            button.disabled = index+delta < 0 || index+delta >= sceneDraft.waves.length; button.setAttribute('aria-label',label === '↑' ? 'Move wave up' : 'Move wave down'); buttons.append(button);
        }
        buttons.append(sceneButton('Remove',() => { sceneDraft.waves.splice(index,1); sceneChanged(); renderSceneWaves(); },true));
        row.append(info,buttons); sceneEl('scene-waves').append(row);
    });
    if (!sceneDraft.waves.length) sceneEl('scene-waves').textContent = 'No waves added. You can use only pre-placed enemies.';
}
for (const [field,key,numeric] of [['title','title'],['description','description'],['objectives','objectives'],['gold','gold',true],['base-hp','baseHp',true]]) {
    sceneEl('scene-'+field).oninput = event => { sceneDraft[key] = numeric ? (event.target.value === '' ? null : Number(event.target.value)) : event.target.value; sceneChanged(); if (key === 'title') sceneEl('scene-heading').textContent = sceneDraft.title; };
}
sceneEl('new-scene').onclick = () => {
    if (!discardSceneChanges()) return;
    sceneDraft = {id:sceneNewId(),title:'New scene',description:'',objectives:'',gold:300,baseHp:20,gridWidth:16,gridHeight:16,
        grid:Array.from({length:16},(_,y) => Array.from({length:16},(_,x) => ({x,y,type:'empty'}))),enemies:[],waves:[],notes:[],availableTowerTypes:TOWER_RULES.getBaseTypes(GAME_DATA.towers).slice(0,5)};
    selectedCell = null; sceneDirty = true; renderScene(); sceneNotify('Draft created. Add a map, enemies and notes.');
};
sceneEl('capture-scene').onclick = () => { if (discardSceneChanges() && sceneSend({type:'SCENE_CAPTURE'})) { sceneSaving = true; sceneControls(); } };
sceneEl('duplicate-scene').onclick = () => { sceneDraft = sceneClone(sceneDraft); sceneDraft.id = sceneNewId(); sceneDraft.title = (sceneDraft.title+' — copy').slice(0,160); sceneDirty = true; renderScene(); sceneNotify('Copy created. Save it to the library.'); };
sceneEl('delete-scene').onclick = () => {
    if (!confirm('Delete saved scene “'+sceneDraft.title+'”? The current game will continue unchanged.')) return;
    if (sceneSend({type:'SCENE_DELETE',sceneId:sceneDraft.id,revision:libraryRevision})) { sceneSaving = true; sceneControls(); }
};
sceneEl('save-scene').onclick = () => {
    if (sceneConflict || sceneSaving || !sceneDraft) return;
    if (![...sceneEl('scene-fields').querySelectorAll('input,textarea,select')].every(field => field.reportValidity())) return;
    try { sceneDraft.scenario=validateScenePlanning(sceneDraft.scenario); }
    catch(error) {sceneNotify(error.message,true);return;}
    if (sceneSend({type:'SCENE_SAVE',scene:sceneDraft,revision:libraryRevision})) { sceneSaving = true; sceneControls(); }
};
sceneEl('reload-scenes').onclick = () => {
    if (!discardSceneChanges()) return;
    reloadRequested = true;
    if (!sceneOnline) connectSceneEditor(); else sceneSend({type:'SCENE_GET_LIBRARY'});
};
sceneEl('resize-scene').onclick = () => {
    if (!sceneEl('scene-width').reportValidity() || !sceneEl('scene-height').reportValidity()) return;
    const width = Number(sceneEl('scene-width').value), height = Number(sceneEl('scene-height').value);
    if ((width < sceneDraft.gridWidth || height < sceneDraft.gridHeight) && !confirm('Shrink the map? Cells outside the new boundary will be removed from the draft.')) return;
    sceneDraft.grid = Array.from({length:height},(_,y) => Array.from({length:width},(_,x) => {
        const cell = sceneClone(sceneDraft.grid[y]?.[x] || {x,y,type:'empty'});
        if (cell.rallyPoint && (cell.rallyPoint.x >= width || cell.rallyPoint.y >= height)) delete cell.rallyPoint;
        return cell;
    }));
    sceneDraft.gridWidth = width; sceneDraft.gridHeight = height;
    sceneDraft.enemies = sceneDraft.enemies.filter(group => group.x < width && group.y < height);
    sceneDraft.notes = sceneDraft.notes.filter(note => note.x < width && note.y < height);
    selectedCell = null; sceneChanged(); renderScene();
};
sceneEl('add-scene-wave').onclick = () => {
    const wave = GAME_DATA.presetWaves[Number(sceneEl('scene-wave-choice').value)];
    if (!wave) return;
    if (sceneDraft.waves.length >= 200 || sceneDraft.waves.some(item => item.waveNum === wave.waveNum)) { sceneNotify('This wave has already been added, or the 200-wave limit has been reached.',true); return; }
    sceneDraft.waves.push(sceneClone(wave)); sceneChanged(); renderSceneWaves();
};
sceneEl('place-scene-enemy').onclick = placeSceneEnemy;
sceneEl('scene-fit').onclick = () => { sceneFit = !sceneFit; sceneEl('scene-fit').setAttribute('aria-pressed',String(sceneFit)); applySceneFit(); };
sceneEl('scene-brush').onchange = () => { sceneEl('scene-map-hint').textContent = sceneEl('scene-brush').value === 'inspect' ? 'Click a cell to see its contents.' : 'Select a map cell to apply the tool.'; };
window.addEventListener('beforeunload',event => { if (sceneDirty || notePending) { event.preventDefault(); event.returnValue = ''; } });
window.addEventListener('resize',() => { if (sceneDraft && sceneFit) applySceneFit(); });
sceneControls(); connectSceneEditor();
