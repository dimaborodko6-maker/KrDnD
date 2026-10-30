'use strict';

// Просмотр развития использует те же определения и цены, что строительство на сервере.
const TOWER_PREPARATION = (() => {
    function getPaths(towers, base) {
        const paths = [];
        function visit(type, path) {
            if (!towers[type] || path.includes(type)) return;
            const current = [...path, type];
            const next = [].concat(towers[type].next || []).filter(id => towers[id] && !current.includes(id));
            if (!next.length) paths.push(current);
            else next.forEach(id => visit(id, current));
        }
        visit(base, []);
        return paths;
    }

    function getStats(tower) {
        const rows = tower.isBarracks ? [
            ['Soldier', tower.soldierCount], ['Soldier HP', tower.soldierHp],
            ['Soldier armor', tower.soldierArmor == null ? null : tower.soldierArmor + '%'],
            ['Soldier damage', tower.soldierDmg],
            ['Respawn', tower.respawnTurns == null ? null : tower.respawnTurns + ' turns'],
            ['Rally radius', tower.range == null ? null : tower.range + ' cells']
        ] : [
            ['Damage', tower.minDamage == null || tower.maxDamage == null ? null : tower.minDamage + '–' + tower.maxDamage],
            ['Damage type', tower.dmgType === 'magic' ? 'Magic' : tower.dmgType === 'phys' ? 'Physical' : tower.dmgType],
            ['Range', tower.range == null ? null : tower.range + ' cells'],
            ['Targets', tower.noAir ? 'Ground' : 'Ground and air']
        ];
        rows.push(['Initiative', tower.initiative]);
        return rows.filter(([, value]) => value != null);
    }

    function getPlanCost(towers, path, level, abilities) {
        const tower = towers[path[level]];
        return path.slice(0, level + 1).reduce((sum, type) => sum + (towers[type].cost || 0), 0) +
            (tower?.upgrades || []).filter(upgrade => abilities.has(upgrade.id))
                .reduce((sum, upgrade) => sum + upgrade.cost, 0);
    }

    function createMenu({ document, getState, getTowers, onToggle, canChange, onClose }) {
        const byId = id => document.getElementById(id);
        const root = byId('tower-preparation-menu');
        const content = byId('tower-preparation-content');
        const footer = byId('tower-preparation-footer');
        let view = 'roster', family = '', branch = 0, level = 0;
        const abilities = new Set();
        const element = (tag, className, text) => {
            const node = document.createElement(tag);
            node.className = className;
            if (text != null) node.textContent = text;
            return node;
        };
        const button = (text, className, action) => {
            const node = element('button', className, text);
            node.type = 'button';
            node.onclick = action;
            return node;
        };
        const icon = tower => String(tower.shortName || '🏰').replace(/[IVXLCDM\d]+$/u, '').trim() || '🏰';
        const levelLabel = index => ['I', 'II', 'III', 'IV'][index] || String(index + 1);

        function close() {
            if (root.hidden) return;
            root.hidden = true;
            if (root.open) root.close();
            onClose();
        }
        byId('tower-preparation-back').onclick = close;
        root.oncancel = event => { event.preventDefault(); close(); };
        byId('tower-preparation-roster-tab').onclick = () => { view = 'roster'; render(); content.scrollTop = 0; };
        byId('tower-preparation-plan-tab').onclick = () => { view = 'plan'; render(); content.scrollTop = 0; };

        function render() {
            const state = getState(), towers = getTowers();
            if (!state || state.gamePeriod !== 'preparation') {
                if (!root.hidden) close();
                return;
            }
            const bases = TOWER_RULES.getBaseTypes(towers);
            const selected = TOWER_RULES.getSelectedTypes(state, towers);
            const built = TOWER_RULES.getBuiltFamilies(state, towers);
            if (!bases.includes(family)) { family = bases[0] || ''; branch = 0; level = 0; }
            const paths = getPaths(towers, family);
            branch = Math.min(branch, Math.max(0, paths.length - 1));
            const path = paths[branch] || [];
            level = Math.min(level, Math.max(0, path.length - 1));
            content.replaceChildren();
            footer.replaceChildren();
            byId('tower-preparation-count').textContent = selected.length + '/' + TOWER_RULES.maxTypes;
            for (const name of ['roster', 'plan']) {
                const tab = byId('tower-preparation-' + name + '-tab');
                tab.setAttribute('aria-pressed', String(view === name));
            }

            function selectionButton(type) {
                const active = selected.includes(type);
                const node = button(active ? '✓ In roster · remove' : '+ Select type', 'tp-select', () => {
                    const currentState = getState(), currentTowers = getTowers();
                    if (currentState.gamePeriod !== 'preparation' || !canChange()) return;
                    const current = TOWER_RULES.getSelectedTypes(currentState, currentTowers);
                    const enabled = !current.includes(type);
                    if (enabled ? current.length >= TOWER_RULES.maxTypes : TOWER_RULES.getBuiltFamilies(currentState, currentTowers).has(type)) return;
                    onToggle(type, enabled);
                });
                node.dataset.towerType = type;
                node.setAttribute('aria-pressed', String(active));
                node.disabled = !canChange() || (active ? built.has(type) : selected.length >= TOWER_RULES.maxTypes);
                if (active && built.has(type)) node.textContent = '✓ In roster · on map';
                return node;
            }

            if (view === 'roster') {
                content.append(element('h2', 'tp-heading', 'Team tower roster'),
                    element('p', 'tp-help', 'Up to 5 types for the whole team. Any player can change the selection. All levels and specializations count as one type.'));
                const slots = element('div', 'tp-slots');
                for (let index = 0; index < TOWER_RULES.maxTypes; index++) {
                    const type = selected[index];
                    const slot = element('span', type ? 'tp-slot' : 'tp-slot tp-empty', type ? icon(towers[type]) : '+');
                    slot.setAttribute('aria-label', type ? towers[type].name : 'Empty slot');
                    slots.append(slot);
                }
                content.append(slots);
                for (const type of bases) {
                    const tower = towers[type];
                    const card = element('article', 'tp-tower');
                    const heading = element('div', 'tp-row');
                    heading.append(element('h3', 'tp-name', icon(tower) + ' ' + tower.name),
                        element('span', 'tp-price', tower.cost + ' G'));
                    const actions = element('div', 'tp-actions');
                    const explore = button('Progression and abilities →', 'tp-explore', () => {
                        family = type; branch = 0; level = 0; view = 'plan';
                        render(); content.scrollTop = 0;
                    });
                    explore.dataset.explore = type;
                    actions.append(explore, selectionButton(type));
                    card.append(heading, actions);
                    if (built.has(type)) card.append(element('p', 'tp-help', 'Demolish all towers of a type before removing it.'));
                    content.append(card);
                }
                footer.append(element('p', 'tp-help', canChange() ?
                    'Selection is free. Gold is spent when building.' : 'Disconnected. Roster changes are temporarily unavailable.'));
                return;
            }

            if (!path.length) {
                content.append(element('p', 'tp-help', 'No towers available.'));
                return;
            }
            const tower = towers[path[level]];
            content.append(element('h2', 'tp-heading', 'Tower progression'));
            const families = element('div', 'tp-families');
            for (const type of bases) {
                const choice = button(icon(towers[type]), 'tp-family', () => {
                    family = type; branch = 0; level = 0; render();
                });
                choice.dataset.family = type;
                choice.setAttribute('aria-label', towers[type].name);
                choice.setAttribute('aria-pressed', String(family === type));
                families.append(choice);
            }
            content.append(families);
            const levels = element('div', 'tp-levels');
            path.forEach((type, index) => {
                const choice = button('', 'tp-level', () => { level = index; render(); });
                choice.dataset.level = String(index);
                choice.append(element('span', '', levelLabel(index)), element('small', '', towers[type].cost + ' G'));
                choice.setAttribute('aria-pressed', String(level === index));
                levels.append(choice);
            });
            content.append(levels);
            if (paths.length > 1 && paths.some(other => other[level] !== path[level])) {
                const branches = element('div', 'tp-branches');
                paths.forEach((other, index) => {
                    const choice = button(towers[other[level] || other.at(-1)].name, 'tp-branch', () => { branch = index; render(); });
                    choice.dataset.branch = String(index);
                    choice.setAttribute('aria-pressed', String(branch === index));
                    branches.append(choice);
                });
                content.append(branches);
            }
            const detail = element('section', 'tp-detail');
            detail.append(element('h3', 'tp-name', tower.name));
            const cost = element('div', 'tp-row tp-cost');
            cost.append(element('span', 'tp-help', level ? 'Upgrade' : 'Build'), element('span', 'tp-price', tower.cost + ' G'));
            detail.append(cost);
            const stats = element('table', 'tp-stats');
            stats.setAttribute('aria-label', 'Final stats for selected level');
            const body = element('tbody', '');
            for (const [name, value] of getStats(tower)) {
                const row = element('tr', '');
                row.append(element('th', '', name), element('td', '', value));
                body.append(row);
            }
            stats.append(body);
            detail.append(stats);
            if (tower.description) detail.append(element('p', 'tp-help', tower.description));
            content.append(detail);
            if (tower.upgrades?.length) {
                content.append(element('h3', 'tp-section-label', 'Abilities · add to estimate'));
                for (const upgrade of tower.upgrades) {
                    const label = element('label', 'tp-ability');
                    const row = element('span', 'tp-row');
                    const input = element('input', '');
                    input.type = 'checkbox';
                    input.dataset.ability = upgrade.id;
                    input.checked = abilities.has(upgrade.id);
                    input.onchange = () => {
                        if (input.checked) abilities.add(upgrade.id);
                        else abilities.delete(upgrade.id);
                        render();
                    };
                    row.append(input, element('span', 'tp-ability-name', (upgrade.icon || '') + ' ' + upgrade.name),
                        element('span', 'tp-price', '+' + upgrade.cost + ' G'));
                    label.append(row, element('p', 'tp-help', upgrade.desc));
                    content.append(label);
                }
            } else if (level < path.length - 1) {
                content.append(element('p', 'tp-help', 'Select the next level to preview its stats and future abilities.'));
            }
            const total = element('div', 'tp-row');
            total.append(element('span', '', 'From scratch to ' + levelLabel(level) + ' level, with selected abilities'),
                element('strong', 'tp-price', getPlanCost(towers, path, level, abilities) + ' G'));
            footer.append(total, selectionButton(family), element('p', 'tp-help', 'Estimate for one tower. Previewing costs no gold.'));
        }

        return {
            open() {
                if (getState()?.gamePeriod !== 'preparation') return;
                root.hidden = false;
                render();
                if (root.showModal && !root.open) root.showModal();
            },
            close,
            refresh() { if (!root.hidden) render(); }
        };
    }

    return { getPaths, getStats, getPlanCost, createMenu };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = TOWER_PREPARATION;
else window.TOWER_PREPARATION = TOWER_PREPARATION;
