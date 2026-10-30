var _tr = typeof _tr !== 'undefined' ? _tr : (text => (typeof window !== 'undefined' && window.KR_I18N ? window.KR_I18N.t(text) : text));
'use strict';
let masterSceneRevision = -1, masterSceneEntries = [], masterWavesSignature = '';
let liveNoteDraft = null, liveNoteForm = null, liveNoteRevision = 0, liveNoteDirty = false, liveNoteSaving = false;
const liveNoteDialog = document.createElement('dialog'); liveNoteDialog.id = 'live-note-dialog';
liveNoteDialog.innerHTML = '<form id="live-note-form"><div class="section-heading"><h2 id="live-note-title">GM Note</h2><button type="button" id="live-note-close" aria-label="Close">✕</button></div><p class="muted">Players receive only the title, coordinates and text of revealed notes. Secrets, checks and their outcomes remain with the GM.</p><div id="live-note-fields" class="scene-note-fields"></div><p id="live-note-error" role="status" class="note-error" hidden></p><div class="button-row"><button type="submit" class="primary">Save note</button><button type="button" id="live-note-delete" class="danger-outline">Delete</button></div></form>';
document.body.append(liveNoteDialog);
function renderMasterScene(state) {
    if(typeof renderMasterPlanning === 'function')renderMasterPlanning(state);
    const scene = state.sceneMaster;
    ui('active-scene-title').textContent = scene?.title || _tr('Current map · GM notes');
    ui('active-scene-description').textContent = scene?.description || '';
    ui('active-scene-objectives').textContent = scene?.objectives ? _tr('Scene objective: ')+scene.objectives : '';
    const list = ui('active-scene-notes'); list.replaceChildren();
    for (const note of scene?.notes || []) {
        const row = document.createElement('div'); row.className = 'scene-detail-entry';
        const name = document.createElement('strong'); name.textContent = note.title+' · '+note.x+', '+note.y;
        const status = document.createElement('p'); status.className = 'muted'; status.textContent = note.revealed ? 'Text revealed to players' : 'Hidden from players';
        const actions = document.createElement('div'); actions.className = 'button-row';
        actions.append(objectButton('Open note',() => openLiveSceneNote(note,note.x,note.y)),objectButton(note.revealed ? 'Hide from players' : 'Reveal text to players',() => {
            if (!note.revealed && !confirm('Show players the title, coordinates and text of note “'+note.title+'»?')) return;
            sendMaster({type:'MASTER_REVEAL_NOTE',noteId:note.id,revealed:!note.revealed,revision:lastState.sceneMaster.noteRevision || 0});
        }));
        row.append(name,status,actions); list.append(row);
        const cell = document.querySelector('.cell[data-x="'+note.x+'"][data-y="'+note.y+'"]');
        if (cell && !cell.querySelector('.map-note-marker')) {
            const marker = document.createElement('span'); marker.className = 'map-note-marker'; marker.textContent = '✎'; marker.title = 'GM notes'; cell.append(marker);
        }
    }
    if (!scene?.notes?.length) list.textContent = 'Select a map cell and click “＋ Note”.';
    const signature = JSON.stringify(masterWaves());
    if (signature !== masterWavesSignature) {
        const selectedNum = masterWaves()[Number(ui('preset-wave-select').value)]?.waveNum;
        masterWavesSignature = signature; initPresetWavesDropdown();
        const index = masterWaves().findIndex(wave => wave.waveNum === selectedNum);
        if (index >= 0) ui('preset-wave-select').value = index;
    }
}
function openLiveSceneNote(note,x,y) {
    liveNoteDraft = note ? JSON.parse(JSON.stringify(note)) : {id:sceneNewId(),x,y,title:'New note'};
    liveNoteRevision = lastState.sceneMaster?.noteRevision || 0; liveNoteDirty = liveNoteSaving = false;
    liveNoteForm = sceneNoteForm(ui('live-note-fields'),liveNoteDraft);
    ui('live-note-title').textContent = 'Note · '+x+', '+y;
    ui('live-note-delete').hidden = !note;
    ui('live-note-error').hidden = true;
    liveNoteDialog.showModal();
}
function closeLiveSceneNote() {
    if (liveNoteSaving || (liveNoteDirty && !confirm('Discard note changes?'))) return;
    liveNoteDirty = false; liveNoteDialog.close();
}
function lockLiveNote(saving) {
    liveNoteSaving = saving;
    liveNoteDialog.querySelectorAll('input,textarea,button').forEach(field => { field.disabled = saving; });
}
ui('live-note-fields').oninput = () => { liveNoteDirty = true; };
ui('live-note-close').onclick = closeLiveSceneNote;
liveNoteDialog.addEventListener('cancel',event => { event.preventDefault(); closeLiveSceneNote(); });
ui('live-note-form').onsubmit = event => {
    event.preventDefault(); if (liveNoteSaving || !liveNoteForm.valid()) return;
    if (sendMaster({type:'MASTER_SAVE_NOTE',note:{...liveNoteDraft,...liveNoteForm.read()},revision:liveNoteRevision})) lockLiveNote(true);
};
ui('live-note-delete').onclick = () => {
    if (!confirm('Delete this note from the current map?')) return;
    if (sendMaster({type:'MASTER_DELETE_NOTE',noteId:liveNoteDraft.id,revision:liveNoteRevision})) lockLiveNote(true);
};
ui('activate-scene').onclick = () => {
    const scene = masterSceneEntries.find(scene => scene.id === ui('master-scene-select').value);
    if (!scene || !confirm('Open scene “'+scene.title+'”? The current map, enemies, towers and resources will be replaced. Heroes will be preserved and restored during preparation.')) return;
    sendMaster({type:'MASTER_ACTIVATE_SCENE',sceneId:scene.id,revision:masterSceneRevision});
};
socket.addEventListener('message',event => {
    const message = JSON.parse(event.data);
    if (message.type === 'SCENE_LIBRARY') {
        masterSceneRevision = message.revision; masterSceneEntries = message.scenes;
        if(typeof updateAdventureLibrary === 'function')updateAdventureLibrary(message.adventures);
        const selected = ui('master-scene-select').value; ui('master-scene-select').replaceChildren();
        for (const scene of message.scenes) ui('master-scene-select').add(new Option(scene.title+' · '+scene.gridWidth+' × '+scene.gridHeight,scene.id));
        if (message.scenes.some(scene => scene.id === selected)) ui('master-scene-select').value = selected;
        if (!message.scenes.length) ui('master-scene-select').add(new Option(_tr('Save the scene in the editor first'),''));
        ui('master-scene-select').disabled = ui('activate-scene').disabled = !message.scenes.length;
    }
    if (message.type === 'NOTE_SAVED' && liveNoteSaving) { lockLiveNote(false); liveNoteDirty = false; liveNoteDialog.close(); masterNotice('Note saved.'); }
    if (message.type === 'COMMAND_ERROR' && liveNoteSaving) { lockLiveNote(false); ui('live-note-error').textContent = message.message; ui('live-note-error').hidden = false; }
});
socket.addEventListener('close',() => { ui('activate-scene').disabled = true; if (liveNoteSaving) { lockLiveNote(false); ui('live-note-error').textContent = 'Disconnected. Your changes remain in this window.'; ui('live-note-error').hidden = false; } });
window.addEventListener('beforeunload',event => { if (liveNoteDirty || liveNoteSaving) { event.preventDefault(); event.returnValue = ''; } });
