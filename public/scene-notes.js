'use strict';
function sceneNewId() {
    if (typeof window !== 'undefined' && window.crypto) {
        if (typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
        if (typeof window.crypto.getRandomValues === 'function') {
            return Array.from(window.crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');
        }
    }
    return 'id_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}
function sceneNoteForm(container, note = {}) {
    container.replaceChildren();
    const fields = {};
    for (const [key,title,max,multiline] of [
        ['title','Name',120,false],['text','Player text',4000,true],['secret','GM secret',4000,true],
        ['skill','Skill check or saving throw',100,false],['dc','Difficulty Class (DC)',40,false],
        ['success','On success · GM only',2000,true],['failure','On failure · GM only',2000,true]
    ]) {
        const label = document.createElement('label'); label.textContent = title;
        const input = document.createElement(multiline ? 'textarea' : 'input');
        input.name = key;
        if (key === 'dc') { input.type = 'number'; input.min = '1'; input.max = '40'; input.step = '1'; }
        else { input.maxLength = max; if (!multiline) input.type = 'text'; }
        if (multiline) input.rows = key === 'text' || key === 'secret' ? 3 : 2;
        input.required = key === 'title'; input.value = note[key] ?? '';
        fields[key] = input; label.append(input); container.append(label);
    }
    return {
        valid() { return Object.values(fields).every(field => field.reportValidity()); },
        read() { return Object.fromEntries(Object.entries(fields).map(([key,field]) => [key,key === 'dc' ? (field.value === '' ? null : Number(field.value)) : field.value])); }
    };
}
function renderRevealedSceneNotes(container, notes) {
    container.replaceChildren();
    for (const note of notes || []) {
        const article = document.createElement('article'); article.className = 'scene-note-card';
        const title = document.createElement('strong'); title.textContent = note.title+' · '+note.x+', '+note.y;
        const text = document.createElement('p'); text.textContent = note.text;
        article.append(title,text); container.append(article);
    }
    if (!notes?.length) container.textContent = 'The GM has not revealed any notes yet.';
}
function renderSceneProgress(container,progress) {
    container.replaceChildren();if(!progress)return;
    if(progress.outcome){const result=document.createElement('strong');result.textContent=SCENARIO_RULES.outcomes[progress.outcome];container.append(result);if(progress.text){const text=document.createElement('p');text.textContent=progress.text;container.append(text);}}
    for(const counter of progress.counters){const row=document.createElement('p');row.textContent=counter.title+': '+counter.value+' / '+counter.target;container.append(row);}
    for(const goal of progress.goals){const row=document.createElement('article');row.className='scene-note-card';const title=document.createElement('strong');title.textContent=goal.title+' · '+SCENARIO_RULES.statuses[goal.status];row.append(title);if(goal.description){const text=document.createElement('p');text.textContent=goal.description;row.append(text);}container.append(row);}
}
