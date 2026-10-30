const { test } = require('node:test');
const assert = require('node:assert/strict');
const { game, data } = require('./helpers/game-harness.cjs');

const towers = {
    ...data.towers,
    dwarf_1: { name: 'Дворфы I', cost: 70, range: 2, next: ['dwarf_2'] },
    dwarf_2: { name: 'Дворфы II', cost: 110, range: 2 },
    necro_1: { name: 'Некромант I', cost: 80, range: 3, next: ['necro_2'] },
    necro_2: { name: 'Некромант II', cost: 130, range: 3 }
};

test('одиночный игрок или мастер меняет набор сразу без голосования', () => {
    const g = game({ gamePeriod: 'preparation', towers });
    const p1 = g.player('gerald');
    
    // Игрок один
    g.send(p1.ws, {
        type: 'PROPOSE_TOWER_ROSTER',
        proposedTypes: ['archer_1', 'barracks_1', 'dwarf_1', 'necro_1']
    });
    
    assert.equal(g.state.rosterVote, null);
    assert.deepEqual(Array.from(g.state.availableTowerTypes), ['archer_1', 'barracks_1', 'dwarf_1', 'necro_1']);
    
    // Мастер тоже может применить набор сразу
    g.send(g.master, {
        type: 'PROPOSE_TOWER_ROSTER',
        proposedTypes: ['archer_1', 'mage_1', 'bombard_1', 'barracks_1', 'dwarf_1']
    });
    assert.equal(g.state.rosterVote, null);
    assert.equal(g.state.availableTowerTypes.length, 5);
    assert.ok(g.state.availableTowerTypes.includes('dwarf_1'));
});

test('командное голосование: предложение запускает голосование, единогласие утверждает', () => {
    const g = game({ gamePeriod: 'preparation', towers });
    const p1 = g.player('gerald');
    const p2 = g.player('malik');
    
    g.send(p1.ws, {
        type: 'PROPOSE_TOWER_ROSTER',
        proposedTypes: ['archer_1', 'mage_1', 'bombard_1', 'dwarf_1', 'necro_1']
    });
    
    assert.ok(g.state.rosterVote);
    assert.equal(g.state.rosterVote.initiator, 'gerald');
    assert.equal(g.state.rosterVote.votes.gerald, true);
    
    // Малик голосует ЗА
    g.send(p2.ws, { type: 'VOTE_TOWER_ROSTER', vote: true });
    
    assert.equal(g.state.rosterVote, null);
    assert.ok(g.state.availableTowerTypes.includes('necro_1'));
    assert.ok(g.state.availableTowerTypes.includes('dwarf_1'));
});

test('командное голосование: голос ПРОТИВ отклоняет предложение', () => {
    const g = game({ gamePeriod: 'preparation', towers });
    const p1 = g.player('gerald');
    const p2 = g.player('malik');
    const initial = Array.from(g.state.availableTowerTypes);
    
    g.send(p1.ws, {
        type: 'PROPOSE_TOWER_ROSTER',
        proposedTypes: ['archer_1', 'mage_1', 'dwarf_1']
    });
    assert.ok(g.state.rosterVote);
    
    // Малик голосует ПРОТИВ
    g.send(p2.ws, { type: 'VOTE_TOWER_ROSTER', vote: false });
    
    assert.equal(g.state.rosterVote, null);
    assert.deepEqual(Array.from(g.state.availableTowerTypes), initial);
});

test('инициатор или мастер может отменить голосование за башни', () => {
    const g = game({ gamePeriod: 'preparation', towers });
    const p1 = g.player('gerald');
    g.player('malik');
    
    g.send(p1.ws, {
        type: 'PROPOSE_TOWER_ROSTER',
        proposedTypes: ['archer_1', 'mage_1', 'dwarf_1']
    });
    assert.ok(g.state.rosterVote);
    
    // Инициатор отменяет
    g.send(p1.ws, { type: 'CANCEL_TOWER_ROSTER_VOTE' });
    assert.equal(g.state.rosterVote, null);
});

test('мастер может принудительно утвердить арсенал в любой момент', () => {
    const g = game({ gamePeriod: 'preparation', towers });
    const p1 = g.player('gerald');
    g.player('malik');
    
    g.send(p1.ws, {
        type: 'PROPOSE_TOWER_ROSTER',
        proposedTypes: ['archer_1', 'dwarf_1']
    });
    assert.ok(g.state.rosterVote);
    
    g.send(g.master, {
        type: 'MASTER_FORCE_SET_ROSTER',
        proposedTypes: ['barracks_1', 'necro_1']
    });
    
    assert.equal(g.state.rosterVote, null);
    assert.deepEqual(Array.from(g.state.availableTowerTypes), ['barracks_1', 'necro_1']);
});

test('нельзя предложить набор без построенной башни', () => {
    const g = game({ gamePeriod: 'preparation', towers });
    const p1 = g.player('gerald');
    g.player('malik');
    
    g.tower('archer_1');
    
    // Пытаемся предложить набор без archer_1
    g.send(p1.ws, {
        type: 'PROPOSE_TOWER_ROSTER',
        proposedTypes: ['mage_1', 'bombard_1', 'barracks_1', 'dwarf_1']
    });
    
    assert.equal(p1.ws.messages.at(-1).type, 'COMMAND_ERROR');
    assert.equal(g.state.rosterVote, null);
});
