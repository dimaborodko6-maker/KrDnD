const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { game } = require('./helpers/game-harness.cjs');
const createEvents = require('../combat-events');
const latest = ws => ws.messages.findLast(message => message.type === 'STATE_UPDATE');

test('отдельные потеря ХП и лечение, координаты до удаления, актуальный мир после замены', () => {
    const enemy = { id: 7, hp: 10, x: 2, y: 3 };
    let state = { players: {}, enemies: [enemy], soldiers: [] };
    const events = createEvents(() => state);
    events.setHp(enemy, 2); events.setHp(enemy, 6); events.setHp(enemy, 0);
    state.enemies = [];
    const batch = events.drain();
    assert.deepEqual(batch.map(e => [e.kind, e.amount]), [['damage', 8], ['heal', 4], ['damage', 6]]);
    assert.ok(batch.every(e => e.targetKind === 'enemy' && e.targetId === '7' && e.x === 2 && e.y === 3));
    assert.deepEqual(events.drain(), []);
    const player = { hp: 5, x: 1, y: 1 };
    state = { players: { user: player }, enemies: [], soldiers: [] };
    events.setHp(player, 8); events.setHp(player, 8);
    assert.equal(events.drain()[0].targetId, 'user');
    events.setHp(player, 1); events.clear(); assert.deepEqual(events.drain(), []);
});

test('смертельный урон ограничен ХП, доставляется всем один раз, не воспроизводится при откате', () => {
    const g = game(); const { ws } = g.player(); const observer = g.player('ratchet').ws;
    g.enemy(77, 4, 2, { hp: 8, maxHp: 100, shieldHp: 5, traits: {} });
    g.send(ws, { type: 'PLAYER_ACTION', ability: 'ultimate', targetId: 77, dice: 1 });
    const batch = latest(ws).combatEvents;
    assert.equal(batch.length, 1); assert.equal(batch[0].amount, 8);
    assert.equal(batch[0].targetId, '77'); assert.equal(g.state.enemies.length, 0);
    assert.deepEqual(latest(observer).combatEvents, batch);
    assert.deepEqual(latest(g.master).combatEvents, batch);
    assert.equal(JSON.stringify(g.state).includes('combatEvents'), false);
    const historyId = latest(g.master).state.playerHistory[0].id;
    g.send(g.master, { type: 'MASTER_ROLLBACK_PLAYER', historyId });
    assert.equal(g.state.enemies[0].hp, 8);
    assert.deepEqual(latest(ws).combatEvents, []); assert.equal(latest(ws).combatReset, true);
    g.send(ws, { type: 'TOGGLE_READY' }); assert.deepEqual(latest(ws).combatEvents, []);
    const reconnect = g.connect();
    g.send(reconnect, { type: 'REGISTER_PLAYER', name: 'gerald' });
    assert.deepEqual(latest(reconnect).combatEvents, []);
});

test('щит без потери ХП не создаёт урон, лечение показывает только восстановленные ХП', () => {
    const g = game(); const { hero, ws } = g.player('ratchet', ['surgical_laser']);
    g.enemy(1, 4, 2, { shieldHp: 500, traits: {} });
    g.castAbility('ratchet', 'attack', 1, 1);
    assert.deepEqual(latest(ws).combatEvents, []);
    hero.hasAttackedThisRound = false; hero.hp = hero.maxHp - 2;
    g.castAbility('ratchet', 'spell_surgical_laser', 'self_ratchet', 6);
    assert.deepEqual(latest(ws).combatEvents.map(e => [e.kind, e.targetKind, e.amount]), [['heal', 'player', 2]]);
});

test('ошибка после урона откатывает мир и отбрасывает события команды', () => {
    const g = game(); const { ws } = g.player(); const enemy = g.enemy(1, 4, 2, { hp: 1 });
    Object.defineProperty(enemy, 'reward', { enumerable: false, get() { throw new Error('test failure after damage'); } });
    assert.throws(() => g.send(ws, { type: 'PLAYER_ACTION', ability: 'ultimate', targetId: 1, dice: 1 }));
    assert.equal(g.state.enemies[0].hp, 1);
    assert.deepEqual(latest(ws).combatEvents, []);
});

test('цифры различаются по стороне, размещаются внутри клетки, игнорируют дубликаты и очищаются', () => {
    class Element {
        constructor() { this.children = []; this.style = {}; this.offsetWidth = 46; this.offsetHeight = 24; }
        appendChild(child) { this.children.push(child); child.parent = this; }
        replaceChildren() { this.children = []; }
        addEventListener(name, listener) { this[name] = listener; }
        remove() { if (this.parent) this.parent.children = this.parent.children.filter(e => e !== this); }
        get firstElementChild() { return this.children[0]; }
    }
    const timers = [];
    const context = vm.createContext({ document: { createElement: () => new Element() }, setTimeout: fn => timers.push(fn) });
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/combat-text.js'), 'utf8'), context);
    const layer = new Element(); const ui = context.COMBAT_TEXT.install(layer, { random: () => 0.99 });
    const state = { gridWidth: 5, gridHeight: 5 };
    const events = [
        { id: 1, kind: 'damage', targetKind: 'enemy', amount: 12, x: 2, y: 3 },
        { id: 2, kind: 'heal', targetKind: 'soldier', amount: 5, x: 2, y: 3 }
    ];
    ui.show(events, state); ui.show(events, state);
    assert.equal(layer.children.length, 2);
    const [damage, heal] = layer.children.map(cell => cell.children[0]);
    assert.equal(damage.textContent, '◆ −12'); assert.match(damage.className, /combat-enemy combat-damage/);
    assert.equal(heal.textContent, '● +5'); assert.match(heal.className, /combat-ally combat-heal/);
    assert.equal(layer.children[0].style.left, '164px'); assert.equal(layer.children[0].style.top, '246px');
    assert.ok(parseFloat(damage.style.left) + damage.offsetWidth <= 78);
    assert.ok(parseFloat(damage.style.top) + damage.offsetHeight <= 78);
    assert.ok(parseFloat(damage.style.top) - 18 >= 2);
    assert.equal(heal.style.animationDelay, '90ms');
    damage.animationend(); assert.equal(layer.children.length, 1);
    timers.forEach(fn => fn()); assert.equal(layer.children.length, 0);
    ui.clear(); ui.show([{ ...events[0], id: 3 }], state); assert.equal(layer.children.length, 1);
    ui.clear(); assert.equal(layer.children.length, 0);
    ui.show([{ ...events[0], id: 4, x: 8 }], state); assert.equal(layer.children.length, 0);
});
