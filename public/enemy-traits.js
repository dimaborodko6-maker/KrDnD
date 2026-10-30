'use strict';
// Общая схема редактора и сервера. Отсутствие особенности означает, что она выключена.
const ENEMY_TRAITS = (() => {
    const number = (label, value, min, max) => ({ label, value, min, max, kind:'number' });
    const flag = (label, value) => ({ label, value, kind:'boolean' });
    const definitions = {
        regeneration:{ label:'Regeneration', icon:'💚', hint:'Restores a percentage of maximum HP at the start of a wave turn after taking no damage for a while.', fields:{
            percent:number('HP per turn, %',5,1,100), delay:number('Turns without damage before activation',1,0,20) } },
        shield:{ label:'Energy shield', icon:'🛡️', hint:'Absorbs damage after armor and resistance. Fully restores after a period without taking damage.', fields:{
            percent:number('Durability as % of maximum HP',35,1,300), recharge:flag('Regenerate shield',true), rechargeDelay:number('Turns without damage before activation',2,0,20) } },
        berserk:{ label:'Berserk', icon:'🔥', hint:'Triggers once at low health and lasts until death, even after healing.', fields:{
            threshold:number('HP threshold, %',40,1,99), damagePercent:number('Damage bonus, %',30,1,300), speedBonus:number('Speed bonus, cells',1,0,10) } },
        commander:{ label:'Commander aura', icon:'🚩', hint:'Boosts other enemies\' attacks within range. Multiple auras apply only the highest bonus.', fields:{
            radius:number('Radius, cells',2,1,16), damagePercent:number('Damage bonus, %',20,1,300) } },
        healing:{ label:'Healer', icon:'🌿', hint:'Heals the most wounded allies at the end of the turn. Stun and transformation disable this ability.', fields:{
            radius:number('Radius, cells',2,1,16), amount:number('Healing, HP',25,1,1000000), interval:number('Interval, turns',3,1,100), maxTargets:number('Maximum targets',100,1,100), healSelf:flag('Heal self',true) } },
        summoning:{ label:'Summoner', icon:'🦅', hint:'Summons in its own cell. Summoned units cannot summon. The limit is counted separately for each summoner.', fields:{
            type:{label:'Summoned type',value:'crow',kind:'enemy'}, count:number('Units per summon',1,1,20), interval:number('Interval, turns',3,1,100), maxAlive:number('Living summons limit',8,1,100), reward:number('Reward per summon, G',0,0,1000000), blockedStops:flag('Blocking interrupts summoning',true) } },
        deathExplosion:{ label:'Death explosion', icon:'💥', hint:'One physical hit against defenders within range. Does not damage the base or other enemies. Does not trigger when breaching the castle.', fields:{
            radius:number('Radius, cells',1,1,16), damage:number('Damage',10,1,1000000) } }
    };
    function defaults(id) { return Object.fromEntries(Object.entries(definitions[id].fields).map(([key,field]) => [key,field.value])); }
    function legacy(type, healPower = 25) {
        if (type === 'orc_shaman') return { healing:{...defaults('healing'),amount:healPower} };
        if (type === 'crowcaller') return { summoning:defaults('summoning') };
        return {};
    }
    function normalize(value, type, healPower) {
        if (value === undefined) return legacy(type,healPower);
        if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Traits: an object is required');
        const result = {};
        for (const [id,config] of Object.entries(value)) {
            if (!Object.hasOwn(definitions,id)) throw new Error('Unknown trait: ' + id);
            const definition = definitions[id];
            if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error(definition.label + ': parameters required');
            if (Object.keys(config).some(key => !Object.hasOwn(definition.fields,key))) throw new Error(definition.label + ': unknown parameter');
            result[id] = {};
            for (const [key,field] of Object.entries(definition.fields)) {
                const n = config[key] === undefined ? field.value : config[key];
                if (field.kind === 'number' && (!Number.isInteger(n) || n < field.min || n > field.max)) throw new Error(`${definition.label}, ${field.label}: an integer from ${field.min} to ${field.max}`);
                if (field.kind === 'boolean' && typeof n !== 'boolean') throw new Error(definition.label + ': invalid flag');
                if (field.kind === 'enemy' && (typeof n !== 'string' || !/^[a-z][a-z0-9_]{0,49}$/.test(n))) throw new Error('Summon: invalid enemy type');
                result[id][key] = n;
            }
        }
        return result;
    }
    return { definitions, defaults, legacy, normalize };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = ENEMY_TRAITS;
else window.ENEMY_TRAITS = ENEMY_TRAITS;
