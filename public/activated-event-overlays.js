'use strict';
/* global ACTIVATED_EVENT_RULES */
const ACTIVATED_EVENT_OVERLAYS = (() => {
    const tr=text=>window.KR_I18N ? window.KR_I18N.t(text) : text;
    const symbols={goldenGoblin:'💰',goblinTower:'🏚',ritualTotem:'🔮',banner:'🚩',sandstorm:'🌪',bombardment:'🎯',chainLightning:'⚡',frost:'❄',necroticMist:'☠️'};
    function render(grid,state,preview){
        if(!grid || !state)return;
        const cells=Array.from(grid.querySelectorAll('.cell'));
        for(const cell of cells){cell.classList.remove('event-zone-storm','event-zone-warning','event-zone-preview');cell.querySelectorAll('.event-map-marker').forEach(el=>el.remove());}
        for(const entry of [...(state.activeEvents || []),...(preview ? [{...preview,preview:true}] : [])]){
            const config=entry.config || entry,kind=config.kind;
            const source=(state.enemies || []).find(enemy=>String(enemy.id)===String(entry.entityId ?? config.sourceId));
            let areas=kind==='bombardment' ? config.areas || [] : Number.isFinite(config.x) && Number.isFinite(config.y) ? [{x:config.x,y:config.y}] : [];
            if(source && ['goldenGoblin','goblinTower','ritualTotem','banner'].includes(kind))areas=[source];
            if(kind==='frost')areas=(config.playerNames || []).map(name=>state.players?.[name]).filter(Boolean);
            if(kind==='chainLightning' && typeof ACTIVATED_EVENT_RULES!=='undefined')areas=ACTIVATED_EVENT_RULES.chain(state,config).map(item=>item.unit);
            const radius=['frost','chainLightning','goldenGoblin','goblinTower','ritualTotem'].includes(kind) ? 0 : config.radius || 0;
            for(const cell of cells){const x=Number(cell.dataset.x),y=Number(cell.dataset.y),inside=areas.some(point=>Math.hypot(point.x-x,point.y-y)<=radius);
                if(inside){if(entry.preview || kind==='banner')cell.classList.add('event-zone-preview');else if(kind==='sandstorm' || kind==='necroticMist')cell.classList.add('event-zone-storm');else if(['bombardment','chainLightning'].includes(kind))cell.classList.add('event-zone-warning');}
                if(areas.some(point=>point.x===x && point.y===y)){const marker=document.createElement('span');marker.className='event-map-marker';marker.textContent=(symbols[kind] || '✦')+(kind==='chainLightning' ? String(areas.findIndex(point=>point.x===x && point.y===y)+1) : '');marker.title=tr(config.title || kind)+(source ? ' · HP '+source.hp+'/'+source.maxHp : '');cell.append(marker);}
            }
        }
        const parent=grid.closest('.map-panel') || grid.parentElement?.parentElement;if(!parent)return;
        let summary=grid.id==='p-grid' ? document.getElementById('player-active-event-summary') : parent.querySelector('.activated-event-summary');if(!summary){summary=document.createElement('div');summary.className='activated-event-summary';summary.setAttribute('aria-live','polite');parent.append(summary);}summary.replaceChildren();
        for(const entry of state.activeEvents || []){const config=entry.config || entry,el=document.createElement('span');const end=entry.expiresRound ?? entry.endRound ?? entry.triggerRound ?? entry.dueRound;el.textContent=(symbols[config.kind] || '✦')+' '+tr(config.title || config.kind)+(end!==undefined ? ' · '+tr('Rounds remaining')+': '+Math.max(0,end-(state.roundCounter || 0)) : '')+(entry.nextRound!==undefined ? ' · '+tr('Next trigger in rounds')+': '+Math.max(0,entry.nextRound-(state.roundCounter || 0)) : '');summary.append(el);}
        summary.hidden=!summary.children.length;
    }
    return {render};
})();
if(typeof window!=='undefined')window.ACTIVATED_EVENT_OVERLAYS=ACTIVATED_EVENT_OVERLAYS;
