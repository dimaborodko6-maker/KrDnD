'use strict';
const rules=require('./public/activated-event-rules');

module.exports=function createActivatedEvents(ctx) {
    const state=()=>ctx.getState(), round=()=>state().roundCounter || 0;
    const events=()=>state().activeEvents ||= [];
    const log=text=>ctx.log(text);
    const entity=event=>(state().enemies || []).find(unit=>String(unit.id) === String(event.entityId) && unit.hp > 0);
    const missingSource=event=>event.kind === 'banner' && !state().enemies.some(unit=>String(unit.id) === event.config.sourceId && unit.hp > 0);
    function hit(items,c) {
        for(const item of items) if(item.unit.hp > 0) ctx.damage(item.unit,c.damage,c.damageType);
        ctx.removeDeadEnemies();
    }
    function finish(id) {
        const event=events().find(e=>String(e.id) === String(id));
        if(!event) throw new Error('Active event not found');
        if(event.entityId !== undefined) state().enemies=state().enemies.filter(unit=>String(unit.id) !== String(event.entityId));
        state().activeEvents=events().filter(e=>e !== event);
        if(event.kind === 'frost') for(const name of event.config.playerNames) {
            const hero=state().players[name];
            if(!hero || hero.frostSlowUntilRound === undefined) continue;
            const remaining=Math.max(round(),...events().filter(other=>other.kind === 'frost' && other.config.playerNames.includes(name)).map(other=>other.expiresRound));
            if(remaining > round()) hero.frostSlowUntilRound=remaining;
            else delete hero.frostSlowUntilRound;
        }
        for(const hero of Object.values(state().players)) ctx.refreshBlocks(hero);
        log('Event ended: '+event.title);
    }
    function summon(event) {
        const c=event.config;
        const active=state().enemies.filter(u=>u.hp > 0 && u.eventSummoner === event.id).length;
        const amount=Math.min(c.count, Math.max(0,(c.maxAlive ?? c.count)-active), Math.max(0,1000-state().enemies.length-(state().pendingSpawns || []).length));
        for(let i=0;i<amount;i++) {
            const unit=ctx.createEnemy(c.enemyType,c.spawnX,c.spawnY);
            unit.reward=c.summonReward; unit.eventSummoner=event.id;
            state().enemies.push(unit);
        }
        if(amount) log(event.title+': reinforcements × '+amount);
    }
    function activate(input) {
        const c=rules.normalize(input,state(),ctx.getData());
        if(state().gamePeriod === 'preparation') throw new Error('Enable play to activate a combat event');
        if(events().length >= 50) throw new Error('Too many active events');
        if(['goldenGoblin','goblinTower','ritualTotem'].includes(c.kind) && state().enemies.length+(state().pendingSpawns || []).length >= 1000) throw new Error('Enemy limit reached');
        state().activatedEventSequence=(state().activatedEventSequence || 0)+1;
        const event={id:'event_'+state().activatedEventSequence,kind:c.kind,title:c.title,config:c,createdRound:round()};
        if(c.duration) event.expiresRound=round()+c.duration;
        if(c.kind === 'frost') {
            const failed=rules.targets(state(),{playerNames:c.playerNames}).filter(item=>c.results[item.id] === 'fail');
            hit(failed,c);
            for(const item of failed) if(item.unit.hp > 0 && !(item.unit.deathTimer > 0)) item.unit.frostSlowUntilRound=Math.max(item.unit.frostSlowUntilRound || 0,round()+c.duration);
            event.config={...c,playerNames:failed.filter(item=>item.unit.hp > 0 && !(item.unit.deathTimer > 0)).map(item=>item.id)};
            delete event.config.results;
            if(event.config.playerNames.length) events().push(event);
        } else if(c.kind === 'chainLightning' && !c.delay) hit(rules.chain(state(),c),c);
        else {
            if(['goldenGoblin','goblinTower','ritualTotem'].includes(c.kind)) {
                const proto=ctx.getData().enemies.goblin ? 'goblin' : Object.keys(ctx.getData().enemies)[0];
                const unit=ctx.createEnemy(proto,c.x,c.y);
                unit.type='event_'+c.kind;
                Object.assign(unit,{name:c.title,eventKind:c.kind,eventStructure:c.kind !== 'goldenGoblin',hp:c.hp,maxHp:c.hp,armor:0,magicRes:0,shieldHp:0,traits:{},speed:c.kind === 'goldenGoblin' ? c.speed : 0,baseSpeed:c.kind === 'goldenGoblin' ? c.speed : 0,reward:c.kind === 'goldenGoblin' ? c.reward : 0,meleeDmg:0,rangedDmg:0,isRanged:false,isFlying:false,livesTaken:0,dodgeChance:0});
                unit.eventId=event.id; event.entityId=unit.id; state().enemies.push(unit);
            }
            if(['bombardment','ritualTotem','chainLightning'].includes(c.kind)) event.nextRound=round()+c.delay;
            if(c.kind === 'goblinTower') event.nextRound=round()+c.interval;
            events().push(event);
        }
        log('Event activated: '+c.title);
        return event;
    }
    function beginRound() {
        for(const event of [...events()]) {
            const c=event.config;
            if(event.entityId !== undefined && !entity(event) || missingSource(event)) { finish(event.id); continue; }
            if(event.kind === 'sandstorm' || event.kind === 'necroticMist') hit(rules.targets(state(),c),c);
            if(event.kind === 'chainLightning' && round() >= event.nextRound) { hit(rules.chain(state(),c),c); finish(event.id); }
            if(event.kind === 'bombardment' && round() >= event.nextRound) {
                const affected=new Map();
                for(const area of c.areas) for(const item of rules.targets(state(),{...c,...area})) affected.set(item.kind+':'+item.id,item);
                hit([...affected.values()],c); finish(event.id);
            }
        }
    }
    function enemyRound() {
        for(const event of [...events()]) {
            const c=event.config, unit=entity(event);
            if(!['goblinTower','ritualTotem'].includes(event.kind)) continue;
            if(!unit) { finish(event.id); continue; }
            if(unit.stunTurns > 0 || unit.isPolymorphed) continue;
            if(event.kind === 'goblinTower') {
                const target=rules.targets(state(),{side:'heroes',x:unit.x,y:unit.y,radius:c.radius}).filter(item=>item.kind === 'player')
                    .sort((a,b)=>Math.hypot(a.unit.x-unit.x,a.unit.y-unit.y)-Math.hypot(b.unit.x-unit.x,b.unit.y-unit.y) || a.id.localeCompare(b.id))[0];
                if(target) hit([target],c);
            }
            if(round() >= event.nextRound) {
                summon(event);
                if(event.kind === 'ritualTotem') finish(event.id);
                else event.nextRound=round()+c.interval;
            }
        }
    }
    function endRound() {
        for(const event of [...events()]) if((event.expiresRound !== undefined && round() >= event.expiresRound) || (event.entityId !== undefined && !entity(event)) || missingSource(event)) finish(event.id);
        for(const hero of Object.values(state().players)) if(hero.frostSlowUntilRound !== undefined && round() >= hero.frostSlowUntilRound) delete hero.frostSlowUntilRound;
    }
    function moveSpecial(enemy) {
        if(enemy.eventStructure) return true;
        if(enemy.eventKind !== 'goldenGoblin') return false;
        if(enemy.hp <= 0 || enemy.stunTurns > 0) return true;
        const steps=enemy.slowTurns > 0 ? 1 : enemy.speed;
        for(let i=0;i<steps;i++) {
            const choices=[[0,1],[1,0],[0,-1],[-1,0]].map(([dx,dy])=>({x:enemy.x+dx,y:enemy.y+dy})).filter(p=>['empty','road','spawn'].includes(state().grid[p.y]?.[p.x]?.type) && !state().enemies.some(unit=>unit !== enemy && unit.eventStructure && unit.hp > 0 && unit.x === p.x && unit.y === p.y));
            if(!choices.length) break;
            Object.assign(enemy,choices[Math.min(choices.length-1,Math.floor((ctx.random || Math.random)()*choices.length))]);
            ctx.triggerMinesAt?.(enemy.x,enemy.y);
            if(enemy.hp <= 0) break;
            for(const hero of Object.values(state().players)) ctx.refreshBlocks(hero);
            const defenders=[...Object.values(state().players),...(state().soldiers || [])];
            const interceptor=defenders.find(unit=>unit.hp > 0 && !(unit.deathTimer > 0) && !(unit.respawnTimer > 0) &&
                Math.max(Math.abs(unit.x-enemy.x),Math.abs(unit.y-enemy.y)) <= 1 &&
                (unit.blockedEnemyIds || []).length < (unit.blockLimit ?? (unit.isGolem ? 3 : 1)));
            if(interceptor) {
                interceptor.blockedEnemyIds ||= [];
                if(!interceptor.blockedEnemyIds.includes(enemy.id)) interceptor.blockedEnemyIds.push(enemy.id);
            }
            if(defenders.some(unit=>unit.hp > 0 && !(unit.deathTimer > 0) && !(unit.respawnTimer > 0) &&
                (unit.blockedEnemyIds || []).includes(enemy.id) && Math.max(Math.abs(unit.x-enemy.x),Math.abs(unit.y-enemy.y)) <= 1)) break;
        }
        return true;
    }
    return {activate,finish,beginRound,enemyRound,endRound,moveSpecial};
};
