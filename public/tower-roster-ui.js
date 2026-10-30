'use strict';
var _tr = typeof _tr !== 'undefined' ? _tr : (text => (typeof window !== 'undefined' && window.KR_I18N ? window.KR_I18N.t(text) : text));

function renderTowerMapBadge(tower) {
    const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
    const shortName = String(tower.shortName || '🏰').trim();
    const parts = shortName.match(/^(.*?)([IVXLCDM]+|\d+)$/u);
    const hasLevel = parts && parts[1].trim();
    const icon = hasLevel ? parts[1].trim() : shortName;
    const level = hasLevel ? parts[2] : '';
    return '<span class="map-tower-badge" role="img" aria-label="' + escape(tower.name || shortName) + '">' +
        '<span class="map-tower-icon" aria-hidden="true">' + escape(icon) + '</span>' +
        (level ? '<span class="map-tower-level" aria-hidden="true">' + escape(level) + '</span>' : '') + '</span>';
}

function renderTowerRoster(container, state, towers, onToggle) {
    const selected = TOWER_RULES.getSelectedTypes(state, towers);
    const built = TOWER_RULES.getBuiltFamilies(state, towers);
    container.replaceChildren();
    for (const type of TOWER_RULES.getBaseTypes(towers)) {
        const tower = towers[type], active = selected.includes(type);
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'tower-type-choice';
        button.dataset.towerType = type;
        button.setAttribute('aria-pressed', String(active));
        const title = document.createElement('strong');
        title.textContent = (active ? '✓ ' : '') + (tower.shortName || '') + ' ' + tower.name;
        const info = document.createElement('span');
        info.textContent = tower.cost + ' G' + _tr(' · all upgrades') + (built.has(type) ? _tr(' · on map') : '');
        button.append(title, info);
        button.disabled = state.gamePeriod !== 'preparation' || (active ? built.has(type) : selected.length >= TOWER_RULES.maxTypes);
        button.title = state.gamePeriod !== 'preparation' ? _tr('Roster can only be changed during preparation') :
            active && built.has(type) ? _tr('Demolish all towers of this type before removing it from the roster') :
            !active && selected.length >= TOWER_RULES.maxTypes ? _tr('Maximum 5 types selected. Remove another type first') :
            _tr(tower.description) || '';
        button.onclick = () => onToggle(type, !active);
        container.append(button);
    }
}
