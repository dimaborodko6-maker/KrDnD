'use strict';
const ACTIVATED_EVENT_RULES = (() => {
    const kinds = { frost:'Frost', goldenGoblin:'Golden goblin', sandstorm:'Sandstorm', goblinTower:'Goblin tower', bombardment:'Bombardment', ritualTotem:'Ritual totem', banner:'Warlord banner', chainLightning:'Chain lightning' };
    const bases = {
        frost:{ damage:10, damageType:'magic', duration:2, dc:12, playerNames:[], results:{} },
        goldenGoblin:{ hp:20, speed:2, reward:50, duration:5 },
        sandstorm:{ radius:2, duration:3, damage:5, damageType:'physical', side:'all' },
        goblinTower:{ hp:80, radius:3, damage:5, damageType:'physical', interval:5, maxAlive:8, enemyType:'goblin', count:1, summonReward:0 },
        bombardment:{ radius:1, damage:15, damageType:'physical', delay:1, areas:[], side:'all' },
        ritualTotem:{ hp:40, delay:3, enemyType:'goblin', count:3, summonReward:0 },
        banner:{ radius:2, duration:3, buff:'damage', bonus:20 },
        chainLightning:{ damage:10, damageType:'magic', radius:2, count:4, side:'all', delay:0 }
    };
    const integer = (v,min,max,label) => { if (!Number.isSafeInteger(v) || v < min || v > max) throw new Error(label + ': invalid integer'); return v; };
    const alive = u => u.hp > 0 && !(u.deathTimer > 0) && !(u.respawnTimer > 0);
    const near = (a,b,r) => Math.hypot(a.x-b.x,a.y-b.y) <= r;
    function defaults(kind) { if (!Object.hasOwn(kinds,kind)) throw new Error('Unknown activated event'); return {kind,...JSON.parse(JSON.stringify(bases[kind]))}; }
    function units(state) { return [...Object.entries(state.players || {}).map(([id,unit])=>({kind:'player',id,unit})), ...(state.enemies || []).map(unit=>({kind:'enemy',id:String(unit.id),unit})), ...(state.soldiers || []).map(unit=>({kind:'soldier',id:String(unit.id),unit}))].filter(item=>alive(item.unit)); }
    function targets(state,c) {
        return units(state).filter(item=>(c.kind !== 'sandstorm' || !item.unit.eventStructure) && (c.side !== 'heroes' || item.kind !== 'enemy') && (c.side !== 'enemies' || item.kind === 'enemy') &&
            (!Array.isArray(c.playerNames) || item.kind === 'player' && c.playerNames.includes(item.id)) &&
            (c.x === undefined || near(item.unit,c,c.radius ?? 0)));
    }
    function chain(state,c) {
        const available=targets(state,{...c,x:undefined,playerNames:undefined});
        let next=available.find(item=>item.kind === c.target?.kind && item.id === String(c.target?.id));
        const result=[];
        while(next && result.length < c.count) {
            result.push(next);
            const previous=next;
            next=available.filter(item=>!result.includes(item) && near(item.unit,previous.unit,c.radius))
                .sort((a,b)=>Math.hypot(a.unit.x-previous.unit.x,a.unit.y-previous.unit.y)-Math.hypot(b.unit.x-previous.unit.x,b.unit.y-previous.unit.y) || (a.kind+':'+a.id).localeCompare(b.kind+':'+b.id))[0];
        }
        return result;
    }
    function normalize(input,state,data,options={}) {
        if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid event configuration');
        const base=defaults(input.kind);
        const allowed=new Set([...Object.keys(base),'title',...(['goldenGoblin','sandstorm','goblinTower','ritualTotem'].includes(input.kind) ? ['x','y'] : []),...(['goblinTower','ritualTotem'].includes(input.kind) ? ['spawnX','spawnY'] : []),...(input.kind === 'banner' ? ['sourceId'] : []),...(input.kind === 'chainLightning' ? ['target'] : [])]);
        const c={...base};
        for(const [key,value] of Object.entries(input)) if(allowed.has(key)) c[key]=value;
        c.title=c.title === undefined ? kinds[c.kind] : c.title;
        if (typeof c.title !== 'string' || !c.title.trim() || c.title.length > 120) throw new Error('Invalid event title');
        const cell=(x,y)=>{integer(x,0,state.grid[0].length-1,'X');integer(y,0,state.grid.length-1,'Y');};
        if (['goldenGoblin','sandstorm','goblinTower','ritualTotem'].includes(c.kind)) cell(c.x,c.y);
        for(const field of ['radius','duration','damage','hp','speed','reward','interval','maxAlive','count','summonReward','delay','bonus','dc']) {
            const max=field === 'delay' && c.kind === 'chainLightning' ? 1 : ['dc','radius','speed'].includes(field) ? 40 : field === 'count' ? 100 : ['duration','interval','delay'].includes(field) ? 1000 : 1000000;
            if(c[field] !== undefined) integer(c[field],['reward','summonReward','damage'].includes(field) || field === 'delay' && c.kind === 'chainLightning' ? 0 : 1,max,field);
        }
        if(c.damageType !== undefined && !['physical','magic','true'].includes(c.damageType)) throw new Error('Invalid damage type');
        if(c.side !== undefined && !['all','heroes','enemies'].includes(c.side)) throw new Error('Invalid event side');
        if(c.kind === 'frost' && !options.preset) {
            if(!Array.isArray(c.playerNames) || !c.playerNames.length || new Set(c.playerNames).size !== c.playerNames.length || c.playerNames.some(name=>!Object.hasOwn(state.players,name) || !alive(state.players[name]))) throw new Error('Select living heroes');
            if(!c.results || typeof c.results !== 'object' || c.playerNames.some(name=>!['pass','fail'].includes(c.results[name]))) throw new Error('Enter every saving throw result');
            c.playerNames=[...c.playerNames]; c.results={...c.results};
        }
        if(['goblinTower','ritualTotem'].includes(c.kind)) {
            if(state.grid[c.y][c.x].type !== 'empty' || !options.preset && (units(state).some(item=>item.unit.x === c.x && item.unit.y === c.y) || (state.mines || []).some(mine=>mine.x === c.x && mine.y === c.y))) throw new Error('Choose an empty unoccupied grass cell');
            if(typeof c.enemyType !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(c.enemyType) || options.strictReferences !== false && !Object.hasOwn(data.enemies,c.enemyType)) throw new Error('Unknown reinforcement type');
            cell(c.spawnX,c.spawnY);
            if(!['road','spawn'].includes(state.grid[c.spawnY][c.spawnX].type)) throw new Error('Reinforcements need a road or spawn cell');
            const seen=new Set(),queue=[{x:c.spawnX,y:c.spawnY}];
            let connected=false;
            for(let i=0;i<queue.length;i++) {
                const p=queue[i],key=p.x+','+p.y;
                if(seen.has(key)) continue;
                seen.add(key);
                if(state.grid[p.y]?.[p.x]?.type === 'castle') {connected=true;break;}
                for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
                    const next={x:p.x+dx,y:p.y+dy};
                    if(['road','spawn','castle'].includes(state.grid[next.y]?.[next.x]?.type) && !seen.has(next.x+','+next.y))queue.push(next);
                }
            }
            if(!connected) throw new Error('Reinforcement cell must connect to the castle');
        }
        if(c.kind === 'goldenGoblin' && (!['empty','road','spawn'].includes(state.grid[c.y][c.x].type) || !options.preset && units(state).some(item=>item.unit.x === c.x && item.unit.y === c.y))) throw new Error('Choose an unoccupied traversable cell');
        if(c.kind === 'bombardment') {
            if(!Array.isArray(c.areas) || !c.areas.length || c.areas.length > 20) throw new Error('Choose 1–20 impact cells');
            c.areas=c.areas.map(a=>{cell(a.x,a.y); return {x:a.x,y:a.y};});
        }
        if(c.kind === 'banner') {
            if(!['damage','armor','speed'].includes(c.buff)) throw new Error('Invalid banner bonus');
            integer(c.bonus,1,c.buff === 'speed' ? 40 : c.buff === 'armor' ? 100 : 300,'Banner bonus');
            if(!options.preset && !(state.enemies || []).some(u=>String(u.id) === String(c.sourceId) && alive(u) && !u.eventKind)) throw new Error('Choose a living enemy bearer');
            if(c.sourceId !== undefined) c.sourceId=String(c.sourceId);
        }
        if(c.kind === 'chainLightning' && !options.preset) {
            if(!c.target || !['player','enemy','soldier'].includes(c.target.kind)) throw new Error('Choose a lightning target');
            c.target={kind:c.target.kind,id:String(c.target.id)};
            if(!chain(state,c).length) throw new Error('Lightning target is unavailable');
        }
        if(options.preset) for(const key of ['playerNames','results','sourceId','target']) delete c[key];
        return c;
    }
    function heroSpeed(hero,round) {
        const speed=Math.max(0,(hero.speed || 0)+(hero.speedBonus || 0));
        return hero.frostSlowUntilRound !== undefined && round < hero.frostSlowUntilRound ? Math.min(1,speed) : speed;
    }
    function auraBonus(state,enemy,kind) {
        let bonus=0;
        if(enemy.eventKind) return 0;
        for(const event of state.activeEvents || []) {
            const c=event.config;
            if(event.kind !== 'banner' || c.buff !== kind || event.expiresRound < (state.roundCounter || 0) || String(enemy.id) === String(c.sourceId)) continue;
            const bearer=(state.enemies || []).find(u=>String(u.id) === String(c.sourceId) && alive(u) && !(u.stunTurns > 0) && !u.isPolymorphed);
            if(bearer && near(enemy,bearer,c.radius)) bonus=Math.max(bonus,c.bonus);
        }
        return bonus;
    }
    return {kinds,defaults,normalize,targets,chain,heroSpeed,auraBonus};
})();
if (typeof module !== 'undefined' && module.exports) module.exports=ACTIVATED_EVENT_RULES;
