const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const statuses = require('../public/unit-statuses.js');

function world() {
    const hero = { name:'hero', heroName:'Torghar', hp:100, maxHp:100, x:3, y:3, deathTimer:0, blockedEnemyIds:[1] };
    const enemy = { id:1, name:'Ogre', hp:100, maxHp:100, x:4, y:3, isFlying:false };
    const soldier = { id:'s1', name:'Ополченец', hp:40, maxHp:40, x:4, y:4, respawnTimer:0, blockedEnemyIds:[] };
    const state = { players:{hero}, enemies:[enemy], soldiers:[soldier] };
    return { state, hero, enemy, soldier };
}
const ids = list => list.map(status => status.id);

test('блокировка видна у обоих участников только при реальной связи, а не просто при соседстве', () => {
    const { state, hero, enemy, soldier } = world();
    let index = statuses.buildIndex(state);
    assert.deepEqual(ids(index.get(hero)), ['blocked']);
    assert.deepEqual(ids(index.get(enemy)), ['blocked']);
    assert.deepEqual(index.get(soldier), []);
    hero.blockedEnemyIds = [];
    index = statuses.buildIndex(state);
    assert.deepEqual(index.get(hero), []);
    assert.deepEqual(index.get(enemy), []);
});

test('мечи исчезают после смерти, отхода, удаления, возрождения или превращения врага в летающего', () => {
    for (const change of [
        w => w.hero.hp = 0,
        w => w.hero.deathTimer = 1,
        w => w.enemy.hp = 0,
        w => w.enemy.x = 8,
        w => w.state.enemies = [],
        w => w.enemy.isFlying = true
    ]) {
        const w = world(); change(w);
        const index = statuses.buildIndex(w.state);
        assert.equal((index.get(w.hero) || []).some(s => s.id === 'blocked'), false);
        assert.equal((index.get(w.enemy) || []).some(s => s.id === 'blocked'), false);
    }
});

test('солдаты и големы участвуют в блокировке, резерв гарнизона не удерживает врага', () => {
    const { state, hero, enemy, soldier } = world();
    hero.blockedEnemyIds = []; soldier.blockedEnemyIds = [1]; soldier.isGolem = true;
    let index = statuses.buildIndex(state);
    assert.deepEqual(ids(index.get(enemy)), ['blocked']);
    assert.deepEqual(ids(index.get(soldier)), ['blocked']);
    soldier.respawnTimer = 1;
    index = statuses.buildIndex(state);
    assert.deepEqual(index.get(enemy), []);
    assert.deepEqual(index.get(soldier), []);
});

test('несколько блокирующих юнитов и повторные ID дают один значок с полным списком участников', () => {
    const { state, hero, enemy, soldier } = world();
    hero.blockedEnemyIds = [1, 1, '1', 999]; soldier.blockedEnemyIds = [1];
    const index = statuses.buildIndex(state);
    assert.equal(index.get(hero).length, 1);
    assert.equal(index.get(enemy).length, 1);
    assert.match(index.get(enemy)[0].detail, /Torghar/);
    assert.match(index.get(enemy)[0].detail, /Ополченец/);
    assert.equal(index.get(hero)[0].detail.match(/Ogre/g).length, 1);
});

test('вредные статусы сосуществуют, истечение одного эффекта не удаляет другие и блокировку', () => {
    const { state, hero, enemy } = world();
    Object.assign(enemy, { bleedTurns:2, poisonTurns:3, paralysisTurns:1, stunTurns:1, slowTurns:2 });
    Object.assign(hero, { bleedTurns:2, poisonTurns:1, stunTurns:1 });
    const before = structuredClone(state);
    let index = statuses.buildIndex(state);
    assert.deepEqual(ids(index.get(enemy)), ['blocked','bleeding','poison','paralysis','stun','slow']);
    assert.deepEqual(ids(index.get(hero)), ['blocked','bleeding','poison','stun']);
    assert.deepEqual(state, before); // Отрисовка не уменьшает таймеры и не меняет боевые данные.
    enemy.paralysisTurns = 0; enemy.stunTurns = 0;
    index = statuses.buildIndex(state);
    assert.deepEqual(ids(index.get(enemy)), ['blocked','bleeding','poison','slow']);
    assert.equal(index.get(enemy).find(s => s.id === 'poison').remaining, 3);
});

test('баффы и барьеры не вытесняют дебаффы, истёкшие значения не отображаются', () => {
    const { hero } = world();
    Object.assign(hero, { poisonTurns:1, shieldHp:12, invulnerableRounds:2, parryRounds:1, naniteCloudRounds:3,
        slowTurns:0, bleedTurns:-1, shieldWallRounds:NaN, speedBonusRounds:2, speedBonus:0 });
    assert.deepEqual(ids(statuses.collect(hero)), ['poison','invulnerable','barrier','parry','regeneration']);
    assert.match(statuses.collect(hero).find(s => s.id === 'barrier').detail, /12 HP/);
});

test('компактный список ограничен, но полный список и подсказка сохраняют все эффекты', () => {
    const { state, enemy } = world();
    Object.assign(enemy, {bleedTurns:2, poisonTurns:1, stunTurns:1, slowTurns:2});
    const all = statuses.buildIndex(state).get(enemy);
    const compact = statuses.renderCompact(all, 'enemy', 1);
    assert.equal((compact.match(/class="unit-status-icon"/g) || []).length, 2);
    assert.match(compact, />\+3</);
    assert.match(compact, /Poison/); assert.match(compact, /Stun/); assert.match(compact, /Slow/);
    assert.equal((statuses.renderList(all).match(/<li /g) || []).length, 5);
    assert.doesNotMatch(statuses.renderCompact(all, 'enemy', 1, false), /<button/);
});

test('положительные эффекты слева, отрицательные и блокировка справа; переполнение считается отдельно', () => {
    const { state, hero } = world();
    Object.assign(hero, { shieldHp:12, vampirismTurns:2, poisonTurns:3, bleedTurns:1, stunTurns:1 });
    const effects = statuses.buildIndex(state).get(hero);
    const edges = statuses.renderEdges(effects, 'player', 'hero');
    assert.match(edges.left, /data-status="barrier"/);
    assert.match(edges.left, /data-status="vampirism"/);
    assert.doesNotMatch(edges.left, /data-status="blocked"|data-status="poison"|data-status="bleeding"/);
    assert.match(edges.right, /data-status="blocked"/);
    assert.match(edges.right, />\+3</);
    assert.match(edges.right, /Poison|Bleeding|Stun/);
    assert.doesNotMatch(edges.right, /data-status="barrier"|data-status="vampirism"/);
    const master = statuses.renderEdges(effects, 'player', 'hero', false);
    assert.doesNotMatch(master.left + master.right, /<button/);
});

test('имена и строки из состояния экранируются во всех представлениях', () => {
    const { state, hero, enemy } = world();
    hero.heroName = '<img src=x onerror="bad()">';
    const list = statuses.buildIndex(state).get(enemy);
    assert.doesNotMatch(statuses.renderCompact(list, 'enemy', '" onclick="bad()'), /<img|data-status-unit="" onclick=/);
    assert.doesNotMatch(statuses.renderList(list), /<img/);
    assert.match(statuses.renderList(list), /&lt;img/);
});

test('рендер игрока совмещает здоровье, имя и статусы без возвращения процентов на табличку', () => {
    const source = fs.readFileSync(require.resolve('../public/player-logic.js'), 'utf8');
    const helper = source.slice(source.indexOf('function renderHealthToken('), source.indexOf('window.renderGridAndUI ='));
    const { state, enemy } = world(); enemy.hp = 70; enemy.bleedTurns = 2;
    const context = { UNIT_STATUSES:statuses, escapeBattleText: s => String(s), enemy, effects:statuses.buildIndex(state).get(enemy) };
    vm.createContext(context);
    const html = vm.runInContext(helper + '\nrenderHealthToken(enemy, "Ogre", "enemy-tok", "", "#b71c1c", effects, "enemy", 1)', context);
    assert.match(html, /--hp-fill:70%/);
    assert.match(html, /data-status="blocked"/); assert.match(html, /data-status="bleeding"/);
    assert.doesNotMatch(html, />70%<|token-hp/);
    assert.match(html, /<span class="token-name">Ogre<\/span>/);
});
