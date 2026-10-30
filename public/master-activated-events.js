'use strict';
/* global ACTIVATED_EVENT_RULES, GAME_DATA, sendMaster, socket */

// Event drafts stay local; only confirmed activations enter the shared world.
const MASTER_ACTIVATED_EVENTS = (() => {
    const names = { frost:'Frost', goldenGoblin:'Golden goblin', sandstorm:'Sandstorm', goblinTower:'Goblin tower', bombardment:'Artillery bombardment', ritualTotem:'Ritual totem', banner:'Leader’s banner', chainLightning:'Chain lightning' };
    const tr = text => window.KR_I18N ? window.KR_I18N.t(text) : text;
    const node = (tag, text, cls) => { const el=document.createElement(tag); if(text !== undefined)el.textContent=tr(text); if(cls)el.className=cls; return el; };
    let state, draft, modal, form, fields, error, apply, picker=null, request=null, sequence=0;
    const finishing=new Map();
    function button(text, action) { const el=node('button',text); el.type='button'; el.onclick=action; return el; }
    function field(key, label, options={}) {
        const wrap=node('label',label), el=node(options.values ? 'select' : 'input');
        el.setAttribute('aria-label',tr(label));
        if(options.values)for(const [value,text] of Object.entries(options.values)){const option=node('option',text);option.value=value;el.append(option);}
        else {el.type=options.type || 'number';if(el.type==='number'){el.min=options.min ?? 0;el.max=options.max ?? 1000000;el.step=1;}}
        el.value=draft[key] ?? options.value ?? ''; el.required=options.required !== false;
        el.oninput=preview;wrap.append(el);fields[key]=el;form.append(wrap);return el;
    }
    function collect() {
        const config={...draft};
        for(const [key,el] of Object.entries(fields))config[key]=el.type==='number' ? Number(el.value) : el.value;
        if(fields.target){config.target=JSON.parse(fields.target.value || 'null');}
        if(config.kind==='frost'){
            const scope=fields.scope.value; delete config.scope;
            const heroes=Object.values(state.players || {}).filter(hero=>hero.hp>0 && !hero.deathTimer);
            config.playerNames=heroes.filter(hero=>scope==='all' || scope==='area' && Math.hypot(hero.x-config.x,hero.y-config.y)<=config.radius || scope==='selected' && Array.from(form.querySelectorAll('[data-event-player]')).some(el=>el.dataset.eventPlayer===hero.name && el.checked)).map(hero=>hero.name);
            config.results={};form.querySelectorAll('[data-event-result]').forEach(el=>{if(config.playerNames.includes(el.dataset.eventResult) && el.value)config.results[el.dataset.eventResult]=el.value;});
        }
        return config;
    }
    function preview() {
        if(!form)return;
        let config;try{config=collect();}catch{return;}
        if(config.kind==='frost')form.querySelectorAll('[data-event-hero-row]').forEach(row=>{row.classList.toggle('event-target-excluded',!config.playerNames.includes(row.dataset.eventHeroRow));});
        const summary=document.getElementById('activated-event-preview');
        if(summary){
            if(config.kind==='frost')summary.textContent=tr('Selected heroes')+': '+config.playerNames.length;
            else if(config.kind==='chainLightning'){const chain=ACTIVATED_EVENT_RULES.chain(state,config);summary.textContent=tr('Affected targets')+': '+chain.length+' · '+chain.map(item=>item.unit.heroName || item.unit.name || item.id).join(' → ');}
            else if(config.kind==='bombardment'){const targets=new Set();for(const area of config.areas || [])for(const item of ACTIVATED_EVENT_RULES.targets(state,{...config,...area}))targets.add(item.kind+':'+item.id);summary.textContent=tr('Marked impact areas')+': '+(config.areas || []).length+' · '+tr('Affected targets')+': '+targets.size;}
            else if(config.kind==='sandstorm')summary.textContent=tr('Affected targets')+': '+ACTIVATED_EVENT_RULES.targets(state,config).length;
            else summary.textContent=tr('Preview on the tactical map');
        }
        if(apply)apply.disabled=!!request || config.kind==='frost' && (!config.playerNames.length || config.playerNames.some(name=>!config.results[name]));
        if(window.ACTIVATED_EVENT_OVERLAYS && state)window.ACTIVATED_EVENT_OVERLAYS.render(document.getElementById('game-grid'),state,config);
    }
    function close() { if(request)return; picker=null;document.getElementById('activated-event-picking').hidden=true; if(modal)modal.remove();modal=null;form=null; if(state && window.ACTIVATED_EVENT_OVERLAYS)window.ACTIVATED_EVENT_OVERLAYS.render(document.getElementById('game-grid'),state); }
    function chooseCell(mode) {
        draft=collect(); picker=mode;modal.close();
        const bar=document.getElementById('activated-event-picking');bar.hidden=false;bar.replaceChildren(node('span',mode==='areas' ? 'Choose impact areas on the map' : 'Choose a cell on the map'),button('Finish selection',finishSelection),button('Cancel',()=>{picker=null;bar.hidden=true;modal.showModal();}));
    }
    function suggestSpawn(){
        if(!['goblinTower','ritualTotem'].includes(draft.kind))return;
        const candidates=[];
        for(let y=0;y<(state.grid || []).length;y++)for(let x=0;x<state.grid[y].length;x++)if(['road','spawn'].includes(state.grid[y][x].type)){
            const queue=[{x,y}],seen=new Set();let connected=false;
            for(let i=0;i<queue.length;i++){const p=queue[i],key=p.x+','+p.y;if(seen.has(key))continue;seen.add(key);if(state.grid[p.y]?.[p.x]?.type==='castle'){connected=true;break;}for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]])if(['road','spawn','castle'].includes(state.grid[p.y+dy]?.[p.x+dx]?.type))queue.push({x:p.x+dx,y:p.y+dy});}
            if(connected)candidates.push({x,y});
        }
        candidates.sort((a,b)=>Math.hypot(a.x-draft.x,a.y-draft.y)-Math.hypot(b.x-draft.x,b.y-draft.y) || a.y-b.y || a.x-b.x);
        if(candidates.length){draft.spawnX=candidates[0].x;draft.spawnY=candidates[0].y;if(fields.spawnX)fields.spawnX.value=draft.spawnX;if(fields.spawnY)fields.spawnY.value=draft.spawnY;}
    }
    function finishSelection(){picker=null;document.getElementById('activated-event-picking').hidden=true;modal.showModal();preview();}
    function pickCell(x,y){
        if(!picker)return false;
        if(picker==='areas'){draft.areas ||= [];if(!draft.areas.some(area=>area.x===x && area.y===y))draft.areas.push({x,y});}
        else {const xKey=picker==='spawn' ? 'spawnX' : 'x', yKey=picker==='spawn' ? 'spawnY' : 'y';draft[xKey]=x;draft[yKey]=y;if(fields[xKey])fields[xKey].value=x;if(fields[yKey])fields[yKey].value=y;if(picker==='point')suggestSpawn();finishSelection();}
        preview();return true;
    }
    function open(source) {
        if(request)return;
        if(modal)close();
        draft=typeof source==='object' && source ? JSON.parse(JSON.stringify(source)) : ACTIVATED_EVENT_RULES.defaults(source || 'frost');
        delete draft.id;draft.results={};fields={};if(draft.spawnX===undefined)suggestSpawn();
        modal=node('dialog',undefined,'activated-event-dialog');modal.setAttribute('aria-label',tr('Activate event'));
        const header=node('div',undefined,'section-heading');header.append(node('h2',names[draft.kind] || draft.title),button('Close',close));
        form=node('form',undefined,'activated-event-form');modal.append(header,form);document.body.append(modal);
        field('title','Event title',{type:'text',value:names[draft.kind]});
        if(['frost','sandstorm','goldenGoblin','goblinTower','ritualTotem'].includes(draft.kind)){
            field('x','X coordinate',{max:(state?.gridWidth || 16)-1,value:0});field('y','Y coordinate',{max:(state?.gridHeight || 16)-1,value:0});form.append(button('Select cell on map',()=>chooseCell('point')));
        }
        if(['frost','sandstorm','bombardment','banner'].includes(draft.kind))field('radius','Radius',{max:40,min:1,value:2});
        if(['frost','sandstorm','goldenGoblin','banner'].includes(draft.kind))field('duration','Duration in rounds',{min:1,max:100});
        if(['frost','sandstorm','bombardment','chainLightning'].includes(draft.kind)){
            field('damage','Damage',{min:0});field('damageType','Damage type',{values:{physical:'Physical',magic:'Magic',true:'True damage'}});
        }
        if(draft.kind==='frost'){
            field('dc','Constitution check DC',{min:1,max:40});field('scope','Targets',{values:{selected:'Selected heroes',area:'Heroes in area',all:'All heroes'},value:'selected'});
            const help=node('p','Roll physical dice, then record every selected hero’s result.','muted');form.append(help);
            for(const hero of Object.values(state?.players || {}).filter(hero=>hero.hp>0 && !hero.deathTimer)){
                const row=node('div',undefined,'activated-event-hero');row.dataset.eventHeroRow=hero.name;
                const label=node('label',hero.heroName || hero.name),check=node('input');check.type='checkbox';check.dataset.eventPlayer=hero.name;check.checked=!draft.playerNames?.length || draft.playerNames.includes(hero.name);check.onchange=preview;label.prepend(check);
                const result=node('select');result.dataset.eventResult=hero.name;result.setAttribute('aria-label',(hero.heroName || hero.name)+' · '+tr('Check result'));
                for(const [value,title] of [['','Not recorded'],['pass','Passed'],['fail','Failed']]){const option=node('option',title);option.value=value;result.append(option);}result.onchange=preview;row.append(label,result);form.append(row);
            }
        }
        if(draft.kind==='goldenGoblin'){field('hp','HP',{min:1});field('speed','Speed',{min:1,max:40});field('reward','Gold reward',{min:0});}
        if(['goblinTower','ritualTotem'].includes(draft.kind)){
            field('hp','HP',{min:1});field('spawnX','Spawn X',{value:draft.x || 0,max:(state?.gridWidth || 16)-1});field('spawnY','Spawn Y',{value:draft.y || 0,max:(state?.gridHeight || 16)-1});form.append(button('Select reinforcement cell',()=>chooseCell('spawn')));
            if(draft.kind==='goblinTower'){field('interval','Spawn interval in rounds',{min:1,max:100});field('maxAlive','Maximum living summons',{min:1,max:200});field('count','Reinforcement count',{min:1,max:100});field('damage','Damage',{min:0});field('damageType','Damage type',{values:{physical:'Physical',magic:'Magic',true:'True damage'}});field('radius','Attack radius',{max:40,min:1});}
            else {field('delay','Rounds until ritual',{min:1,max:100});field('enemyType','Reinforcement type',{values:Object.fromEntries(Object.entries(GAME_DATA.enemies).map(([id,e])=>[id,e.name]))});field('count','Reinforcement count',{min:1,max:200});}
            field('summonReward','Summon gold reward',{min:0,value:0});
        }
        if(draft.kind==='bombardment'){
            field('delay','Warning rounds',{min:1,max:100});draft.areas ||= [];
            form.append(button('Mark impact areas',()=>chooseCell('areas')),button('Clear impact areas',()=>{draft.areas=[];preview();}));
        }
        if(draft.kind==='banner'){
            field('sourceId','Banner carrier',{values:Object.fromEntries((state?.enemies || []).filter(e=>e.hp>0 && !e.eventKind).map(e=>[e.id,e.name+' #'+e.id]))});
            const buff=field('buff','Bonus',{values:{damage:'Damage bonus, %',armor:'Armor bonus, percentage points',speed:'Speed bonus, cells'}});field('bonus','Bonus value',{min:1,max:100});buff.onchange=()=>{fields.bonus.value=buff.value==='speed' ? 1 : 20;preview();};
        }
        if(draft.kind==='chainLightning'){
            const units=[...Object.values(state?.players || {}).map(u=>({kind:'player',id:String(u.name),label:u.heroName || u.name,hp:u.hp})),...(state?.enemies || []).map(u=>({kind:'enemy',id:String(u.id),label:u.name+' #'+u.id,hp:u.hp})),...(state?.soldiers || []).filter(u=>!u.respawnTimer).map(u=>({kind:'soldier',id:String(u.id),label:u.name || 'Soldier',hp:u.hp}))].filter(u=>u.hp>0);
            const target=field('target','First target',{values:Object.fromEntries(units.map(u=>[JSON.stringify({kind:u.kind,id:u.id}),u.label]))});if(draft.target)target.value=JSON.stringify(draft.target);
            field('radius','Jump range',{min:1,max:60});field('count','Maximum targets',{min:1,max:100});field('delay','Warning rounds',{min:0,max:100});field('side','Affected side',{values:{all:'All creatures',heroes:'Heroes and allies',enemies:'Enemies'}});
        }
        const summary=node('p',undefined,'muted');summary.id='activated-event-preview';form.append(summary);
        error=node('p',undefined,'note-error');error.setAttribute('role','alert');error.hidden=true;form.append(error);
        const actions=node('div',undefined,'button-row');apply=node('button','Activate event','primary');apply.type='submit';actions.append(apply,button('Cancel',close));form.append(actions);
        form.onsubmit=event=>{event.preventDefault();if(request || !form.reportValidity())return;const config=collect();if(config.kind==='frost' && (!config.playerNames.length || config.playerNames.some(name=>!config.results[name]))){error.textContent=tr('Record a result for every selected hero.');error.hidden=false;return;}
            request='event-'+Date.now()+'-'+(++sequence);error.hidden=true;apply.disabled=true;if(!sendMaster({type:'MASTER_ACTIVATE_EVENT',config,requestId:request})){request=null;apply.disabled=false;}};
        modal.addEventListener('cancel',event=>{event.preventDefault();close();});modal.showModal();preview();
    }
    function render(next){
        state=next;
        const panel=document.getElementById('activated-events-panel');if(!panel)return;
        panel.replaceChildren(node('h2','Activated events'));
        const buttons=node('div',undefined,'event-template-buttons');for(const [kind,title] of Object.entries(names))buttons.append(button(title,()=>open(kind)));panel.append(buttons);
        for(const preset of next.sceneMaster?.eventPresets || [])panel.append(button(tr('Preset')+': '+preset.title,()=>open(preset)));
        const active=next.activeEvents || [];if(!active.length)panel.append(node('p','No active events.','muted'));
        for(const entry of active){const row=node('div',undefined,'activated-event-row'), config=entry.config || entry;row.append(node('strong',config.title || names[config.kind] || config.kind));const end=entry.expiresRound ?? entry.endRound ?? entry.triggerRound ?? entry.dueRound; if(end!==undefined)row.append(node('span',tr('Rounds remaining')+': '+Math.max(0,end-(next.roundCounter || 0))));if(entry.nextRound!==undefined)row.append(node('span',tr('Next trigger in rounds')+': '+Math.max(0,entry.nextRound-(next.roundCounter || 0))));const source=(next.enemies || []).find(enemy=>String(enemy.id)===String(entry.entityId ?? config.sourceId));if(source)row.append(node('span','HP '+source.hp+'/'+source.maxHp));const finish=button('End event',()=>{const id='finish-'+Date.now()+'-'+(++sequence);if(sendMaster({type:'MASTER_FINISH_EVENT',id:entry.id,requestId:id})){finishing.set(id,entry.id);finish.disabled=true;}});finish.disabled=Array.from(finishing.values()).includes(entry.id);row.append(finish);panel.append(row);}
        if(form)preview();
    }
    socket.addEventListener('message',event=>{let message;try{message=JSON.parse(event.data);}catch{return;}if(message.type!=='EVENT_RESULT')return;if(finishing.has(message.requestId)){finishing.delete(message.requestId);if(state)render(state);if(!message.ok){const notice=node('p',message.error || 'Could not end event.','note-error');notice.setAttribute('role','alert');document.getElementById('activated-events-panel').append(notice);}return;}if(message.requestId!==request)return;request=null;apply.disabled=false;if(message.ok)close();else{error.textContent=tr(message.error || 'Could not activate event.');error.hidden=false;}});
    socket.addEventListener('close',()=>{if(!request)return;request=null;if(apply)apply.disabled=false;if(error){error.textContent=tr('Connection lost. Reconnect before activating an event.');error.hidden=false;}});
    document.addEventListener('keydown',event=>{if(event.key==='Escape' && picker){event.preventDefault();picker=null;document.getElementById('activated-event-picking').hidden=true;modal.showModal();}});
    return {render,open,pickCell};
})();
if(typeof window!=='undefined')window.MASTER_ACTIVATED_EVENTS=MASTER_ACTIVATED_EVENTS;
