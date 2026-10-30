'use strict';

// Один тип в наборе — базовая башня со всей цепочкой уровней и развилками next.
const TOWER_RULES = {
    maxTypes: 5,
    getBaseTypes(towers) {
        const upgrades = new Set();
        for (const tower of Object.values(towers)) {
            for (const type of [].concat(tower.next || [])) upgrades.add(type);
        }
        return Object.keys(towers).filter(type => !upgrades.has(type));
    },
    getFamily(towers, type) {
        for (const base of this.getBaseTypes(towers)) {
            const pending = [base], visited = new Set();
            while (pending.length) {
                const current = pending.pop();
                if (visited.has(current) || !towers[current]) continue;
                if (current === type) return base;
                visited.add(current);
                pending.push(...[].concat(towers[current].next || []));
            }
        }
        return null;
    },
    getSelectedTypes(state, towers) {
        const bases = this.getBaseTypes(towers);
        return Array.isArray(state.availableTowerTypes) ?
            bases.filter(type => state.availableTowerTypes.includes(type)).slice(0, this.maxTypes) : bases.slice(0, this.maxTypes);
    },
    getBuiltFamilies(state, towers) {
        return new Set((state.grid || []).flat().filter(cell => towers[cell.type])
            .map(cell => this.getFamily(towers, cell.type)).filter(Boolean));
    }
};

if (typeof module !== 'undefined' && module.exports) module.exports = TOWER_RULES;
else window.TOWER_RULES = TOWER_RULES;
