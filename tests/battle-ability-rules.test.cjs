const { test } = require('node:test');
const assert = require('node:assert/strict');
const rules = require('../public/battle-ability-rules.js');
const { game } = require('./helpers/game-harness.cjs');

test('дальность атаки, выбранной цели и способности без цели рассчитывается без ошибки инициализации', () => {
    assert.deepEqual(rules.rangeInfo('attack', { heroKey: 'gerald', range: 1 }),
        { range: 1, metric: 'chebyshev' });
    assert.deepEqual(rules.rangeInfo('attack', { heroKey: 'ratchet', range: 3 }),
        { range: 3, metric: 'euclidean' });
    assert.deepEqual(rules.rangeInfo('spell_surgical_laser', { heroKey: 'ratchet', range: 6 }),
        { range: 3, metric: 'euclidean' });
    assert.deepEqual(rules.rangeInfo('spell_nanite_cloud', { heroKey: 'ratchet', range: 6 }),
        { range: 2, metric: 'euclidean' });
    assert.deepEqual(rules.rangeInfo('ultimate', { heroKey: 'malik', range: 6 }),
        { range: 1, metric: 'chebyshev' });
    assert.equal(rules.rangeInfo('attack', null), null);
    assert.equal(rules.rangeInfo('', { heroKey: 'gerald' }), null);
});

for (const [heroKey, skill] of [['torghar','ground_tremor'], ['connor','slash'], ['connor','shatter'], ['malik','earthquake'], ['zefira','blades'], ['malik','ultimate']]) {
    test(`${skill}: предпросмотр и применение без цели задевают только врагов вокруг героя`, () => {
        const ability = skill === 'ultimate' ? skill : 'spell_' + skill;
        const g = game(); const { hero, ws } = g.player(heroKey, skill === 'ultimate' ? [] : [skill]);
        hero.x = 4; hero.y = 2;
        const a = g.enemy(1, 5, 2), b = g.enemy(2, 3, 1), distant = g.enemy(3, 7, 2);
        const before = structuredClone(g.state);
        const preview = rules.application(g.state, heroKey, ability, '3');
        assert.equal(preview.selection, 'none');
        assert.deepEqual(preview.effects.filter(e => e.kind === 'enemy').map(e => e.id), ['1','2']);
        assert.deepEqual(structuredClone(g.state), before);
        // Даже устаревший переданный ID не добавляет далёкого врага в круговую атаку.
        g.send(ws, { type:'PLAYER_ACTION', ability, targetId:3, dice:6 });
        assert.ok(a.hp < 1000 && b.hp < 1000);
        assert.equal(distant.hp, 1000);
        assert.equal(hero.hasAttackedThisRound, true);
        if (skill === 'blades') assert.equal(hero.shieldHp, 4);
    });
}

test('наниты применяются без цели и лечат тот же круг героев, солдат и големов, что показан в предпросмотре', () => {
    const g = game(); const { hero, ws } = g.player('ratchet', ['nanite_cloud']); hero.hp = 10;
    const { hero: ally } = g.player('gerald'); Object.assign(ally, {x:6,y:2,hp:10});
    const { hero: outside } = g.player('connor'); Object.assign(outside, {x:6,y:4,hp:10});
    const soldier = {id:7,x:4,y:3,hp:10,maxHp:40,respawnTimer:0};
    const reserve = {id:8,x:4,y:3,hp:10,maxHp:40,respawnTimer:1};
    g.state.soldiers.push(soldier,reserve);
    const preview = rules.application(g.state, 'ratchet', 'spell_nanite_cloud');
    assert.deepEqual(preview.effects.map(e => e.kind + ':' + e.id), ['player:ratchet','player:gerald','soldier:7']);
    assert.ok(preview.effects.every(e => e.tone === 'heal'));
    g.send(ws, {type:'PLAYER_ACTION', ability:'spell_nanite_cloud', targetId:-1, dice:8});
    assert.equal(hero.hp, 15); assert.equal(ally.hp,15); assert.equal(soldier.hp,15);
    assert.equal(outside.hp,10); assert.equal(reserve.hp,10);
    assert.equal(hero.naniteCloudRounds,3);
});

test('площадная атака по выбранному врагу учитывает соседей за пределами дальности выбора', () => {
    const g = game(); const { ws } = g.player('bolin', ['mortar']);
    const a = g.enemy(1,9,2), b = g.enemy(2,10,3), outside = g.enemy(3,11,2);
    assert.equal(rules.application(g.state,'bolin','spell_mortar').effects.length,0);
    const preview = rules.application(g.state,'bolin','spell_mortar','1');
    assert.deepEqual(preview.effects.map(e => e.id),['1','2']);
    g.send(ws,{type:'PLAYER_ACTION',ability:'spell_mortar',targetId:1,dice:6});
    assert.ok(a.hp < 1000 && b.hp < 1000); assert.equal(outside.hp,1000);
});

test('Inspire помогает всем живым героям, а крепость Торгара подсвечивает героя и спровоцированных врагов', () => {
    const g = game(); g.player('gerald',['inspire']); const { hero: ally } = g.player('torghar'); ally.x=15;
    const { hero: dead } = g.player('connor'); dead.hp=0;
    assert.deepEqual(rules.application(g.state,'gerald','spell_inspire').effects.map(e=>e.id),['gerald','torghar']);
    ally.x=4; g.enemy(1,6,4); g.enemy(2,7,2);
    const effects=rules.application(g.state,'torghar','ultimate').effects;
    assert.deepEqual(effects.map(e=>[e.id,e.tone]),[['torghar','support'],['1','attack']]);
});

test('переключение лазера между союзником и врагом меняет только личный предпросмотр; Reboot учитывает самолечение', () => {
    const g = game(); g.player('ratchet',['surgical_laser']); g.player('gerald'); g.enemy(1,5,2);
    const before=structuredClone(g.state);
    assert.deepEqual(rules.application(g.state,'ratchet','spell_surgical_laser','1').effects.map(e=>[e.kind,e.id,e.tone]),[['enemy','1','attack']]);
    assert.deepEqual(rules.application(g.state,'ratchet','spell_surgical_laser','player_gerald').effects.map(e=>[e.kind,e.id,e.tone]),[['player','gerald','heal']]);
    assert.deepEqual(rules.application(g.state,'ratchet','ultimate','player_gerald').effects.map(e=>e.id),['gerald','ratchet']);
    g.state.players.gerald.hp=0; g.state.players.gerald.deathTimer=2;
    assert.deepEqual(rules.application(g.state,'ratchet','ultimate','player_gerald').effects.map(e=>e.id),['gerald']);
    g.state.players.gerald=before.players.gerald;
    assert.deepEqual(structuredClone(g.state),before);
});

test('мина не задевает летунов, рывок подсвечивает щиты союзников и оглушаемых врагов на пути', () => {
    const g=game(); g.player('ratchet',['ambulance_rush']); const {hero:ally}=g.player('gerald'); ally.x=7;
    g.enemy(1,5,2); g.enemy(2,5,2,{isFlying:true}); g.enemy(3,5,5);
    assert.deepEqual(rules.application(g.state,'ratchet','spell_mines','cell_5_2').effects.map(e=>e.id),['1']);
    assert.deepEqual(rules.application(g.state,'ratchet','spell_ambulance_rush','player_gerald').effects.map(e=>[e.kind,e.id]),
        [['player','gerald'],['player','ratchet'],['enemy','1'],['enemy','2']]);
});

test('предпросмотр обычной атаки учитывает сплеш Foehammer и каждый пятый дальний выстрел Болина', () => {
    const g=game(); const {hero}=g.player('malik',['joehammer']);
    g.enemy(1,5,2); g.enemy(2,5,2); g.enemy(3,6,2);
    assert.deepEqual(rules.application(g.state,'malik','attack','1').effects.map(e=>e.id),['1','2']);
    const {hero:bolin}=g.player('bolin',['explosive']); bolin.x=2;
    assert.deepEqual(rules.application(g.state,'bolin','attack','1').effects.map(e=>e.id),['1']);
    bolin.bolinShotCount=4;
    assert.deepEqual(rules.application(g.state,'bolin','attack','1').effects.map(e=>e.id),['1','2','3']);
    assert.equal(bolin.bolinShotCount,4);
});

test('круговая способность с защитой героя применяется и без врагов на карте', () => {
    const g=game(); const {hero,ws}=g.player('zefira',['blades']);
    const preview=rules.application(g.state,'zefira','spell_blades');
    assert.deepEqual(preview.effects.map(e=>[e.id,e.tone]),[['zefira','support']]);
    g.send(ws,{type:'PLAYER_ACTION',ability:'spell_blades',targetId:-1,dice:8});
    assert.equal(hero.shieldHp,4);
    assert.equal(hero.hasAttackedThisRound,true);
});
