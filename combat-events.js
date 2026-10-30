'use strict';

// Одноразовые визуальные события: не входят в сохранение и историю мира.
module.exports = function createCombatEvents(getState) {
    let sequence = 0;
    let pending = [];
    return {
        setHp(unit, value) {
            const before = unit.hp;
            unit.hp = value;
            if (!Number.isFinite(before) || !Number.isFinite(value) || before === value) return;
            const state = getState();
            const player = Object.entries(state.players).find(([, ref]) => ref === unit);
            const targetKind = player ? 'player' : state.enemies.includes(unit) ? 'enemy' :
                (state.soldiers || []).includes(unit) ? 'soldier' : null;
            if (!targetKind || !Number.isFinite(unit.x) || !Number.isFinite(unit.y)) return;
            pending.push({ id: ++sequence, kind: value < before ? 'damage' : 'heal',
                targetKind, targetId: String(player ? player[0] : unit.id),
                x: unit.x, y: unit.y, amount: Math.abs(value - before) });
        },
        drain() { const events = pending; pending = []; return events; },
        clear() { pending = []; }
    };
};
