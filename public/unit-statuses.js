'use strict';

// Представление действующих эффектов. Таймеры остаются под управлением боевого движка.
const UNIT_STATUSES = (() => {
    const definitions = [
        { id: 'bleeding', polarity: 'negative', icon: '🩸', label: 'Bleeding', turns: ['bleedTurns'] },
        { id: 'poison', polarity: 'negative', icon: '🌿', label: 'Poison', turns: ['poisonTurns'] },
        { id: 'paralysis', polarity: 'negative', icon: '⛓️', label: 'Paralysis', turns: ['paralysisTurns', 'paralyzeTurns'] },
        { id: 'stun', polarity: 'negative', icon: '💫', label: 'Stun', turns: ['stunTurns'] },
        { id: 'slow', polarity: 'negative', icon: '🐌', label: 'Slow', turns: ['slowTurns'] },
        { id: 'polymorph', polarity: 'negative', icon: '🐑', label: 'Sheep transformation', turns: ['polymorphTurns'], flag: 'isPolymorphed' },
        { id: 'invulnerable', polarity: 'positive', icon: '✨', label: 'Invulnerability', turns: ['invulnerableRounds'] },
        { id: 'barrier', polarity: 'positive', icon: '🛡️', label: 'Barrier', amount: 'shieldHp' },
        { id: 'retribution', polarity: 'positive', icon: '🔰', label: 'Retribution shield', amount: 'retributionShield' },
        { id: 'shield_wall', polarity: 'positive', icon: '🧱', label: 'Defensive stance', turns: ['shieldWallRounds'] },
        { id: 'parry', polarity: 'positive', icon: '🤺', label: 'Parry', turns: ['parryRounds'] },
        { id: 'haste', polarity: 'positive', icon: '💨', label: 'Haste', turns: ['speedBonusRounds'], requires: 'speedBonus' },
        { id: 'regeneration', polarity: 'positive', icon: '💚', label: 'Nanite Cloud', turns: ['naniteCloudRounds'] },
        { id: 'vampirism', polarity: 'positive', icon: '🧛', label: 'Life steal', turns: ['vampirismTurns', 'lifestealTurns'] }
    ];
    const positive = value => Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : 0;
    const alive = unit => positive(unit.hp) > 0 && !positive(unit.deathTimer) && !positive(unit.respawnTimer);
    const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
    const name = unit => unit.heroName || unit.name || (unit.isGolem ? 'Golem' : 'Soldier');

    function collect(unit, blockedPeers = [], round = 0, auraBonus = 0) {
        if (!unit || !alive(unit)) return [];
        const statuses = [];
        if (blockedPeers.length) statuses.push({ id: 'blocked', polarity: 'negative', icon: '⚔️', label: 'Blocking', remaining: null,
            detail: 'Blocking · combatants: ' + blockedPeers.map(peer => name(peer) + (peer.id != null ? ' #' + peer.id : '')).join(', ') });
        for (const definition of definitions) {
            const remaining = Math.max(0, ...(definition.turns || []).map(field => positive(unit[field])));
            const amount = definition.amount ? positive(unit[definition.amount]) : 0;
            if (!remaining && !amount && !unit[definition.flag]) continue;
            if (definition.requires && !positive(unit[definition.requires])) continue;
            const suffix = remaining ? ' · turns remaining: ' + remaining : amount ? ' · durability: ' + amount + ' HP' : '';
            statuses.push({ id: definition.id, polarity: definition.polarity, icon: definition.icon, label: definition.label, remaining: remaining || null,
                detail: definition.label + suffix });
        }
        const traits = unit.traits || {};
        const addTrait = (id,icon,label,detail) => statuses.push({id,polarity:id === 'shield_empty' ? 'negative' : 'positive',icon,label,remaining:null,detail:label + ' · ' + detail});
        if (traits.regeneration) addTrait('mob_regeneration','💚','Regeneration',traits.regeneration.percent + '% HP per turn; pause after damage: ' + traits.regeneration.delay);
        if (traits.shield && !(unit.shieldHp > 0)) addTrait('shield_empty','🛡️','Shield depleted',traits.shield.recharge ? 'restores after ' + traits.shield.rechargeDelay + ' turns without damage' : 'no regeneration');
        if (traits.berserk) addTrait('berserk','🔥',unit.rageActive ? 'Berserk: rage' : 'Berserk',unit.rageActive ? '+' + traits.berserk.damagePercent + '% damage, +' + traits.berserk.speedBonus + ' speed' : 'triggers at HP ≤ ' + traits.berserk.threshold + '%');
        if (traits.commander) addTrait('commander','🚩','Commander aura','+' + traits.commander.damagePercent + '% ally damage; radius ' + traits.commander.radius + '; auras do not stack');
        if (auraBonus > 0) addTrait('commanded','⚑','Under command','+' + auraBonus + '% damage');
        if (traits.healing) addTrait('healing','🌿','Healer',traits.healing.amount + ' HP; radius ' + traits.healing.radius + '; ready in: ' + Math.max(0,(unit.nextHealRound || 0)-round));
        if (traits.summoning && !(unit.summonGeneration > 0)) addTrait('summoning','🦅','Summoner',traits.summoning.count + ' units; limit ' + traits.summoning.maxAlive + '; ready in: ' + Math.max(0,(unit.nextSummonRound || 0)-round));
        if (traits.deathExplosion) addTrait('death_explosion','💥','Death explosion',traits.deathExplosion.damage + ' physical damage; radius ' + traits.deathExplosion.radius);
        return statuses;
    }

    function buildIndex(state) {
        const defenders = [...Object.values(state?.players || {}), ...(state?.soldiers || [])];
        const enemies = state?.enemies || [];
        const enemiesById = new Map(enemies.map(enemy => [String(enemy.id), enemy]));
        const links = new Map();
        for (const defender of defenders) {
            if (!alive(defender)) continue;
            for (const id of new Set((defender.blockedEnemyIds || []).map(String))) {
                const enemy = enemiesById.get(id);
                if (!enemy || !alive(enemy) || enemy.isFlying ||
                    !(Math.max(Math.abs(defender.x - enemy.x), Math.abs(defender.y - enemy.y)) <= 1)) continue;
                if (!links.has(defender)) links.set(defender, []);
                if (!links.has(enemy)) links.set(enemy, []);
                links.get(defender).push(enemy);
                links.get(enemy).push(defender);
            }
        }
        return new Map([...defenders, ...enemies].map(unit => {
            const auraBonus = enemies.includes(unit) && !unit.isPolymorphed ? Math.max(0,...enemies.filter(leader => leader !== unit && alive(leader) &&
                !(leader.stunTurns > 0) && !leader.isPolymorphed && leader.traits?.commander &&
                Math.hypot(leader.x-unit.x,leader.y-unit.y) <= leader.traits.commander.radius).map(leader => leader.traits.commander.damagePercent)) : 0;
            return [unit,collect(unit,links.get(unit) || [],state?.roundCounter || 0,auraBonus)];
        }));
    }

    function describe(statuses) {
        return statuses.map(status => status.icon + ' ' + status.detail).join('; ');
    }

    function renderCompact(statuses, kind, id, interactive = true, limit = 3) {
        if (!statuses.length) return '';
        // Счётчик занимает место одного значка; полный список доступен по нажатию.
        const visible = statuses.slice(0, statuses.length > limit ? limit - 1 : limit);
        const icons = visible.map(status => '<span class="unit-status-icon" data-status="' + escape(status.id) + '" aria-hidden="true">' + status.icon + '</span>').join('');
        const more = statuses.length - visible.length;
        const content = icons + (more ? '<span class="unit-status-more" aria-hidden="true">+' + more + '</span>' : '');
        const attributes = ' class="unit-status-trigger" title="' + escape(describe(statuses)) + '" aria-label="' + escape(describe(statuses)) + '"';
        return interactive ? '<button type="button"' + attributes + ' data-status-kind="' + escape(kind) + '" data-status-unit="' + escape(id) + '">' + content + '</button>' :
            '<span' + attributes + ' role="img">' + content + '</span>';
    }

    function renderEdges(statuses, kind, id, interactive = true) {
        const positive = statuses.filter(status => status.polarity === 'positive');
        const negative = statuses.filter(status => status.polarity !== 'positive');
        return {
            left: '<span class="unit-status-edge unit-status-positive">' + renderCompact(positive, kind, id, interactive, 2) + '</span>',
            right: '<span class="unit-status-edge unit-status-negative">' + renderCompact(negative, kind, id, interactive, 2) + '</span>'
        };
    }

    function renderList(statuses) {
        return statuses.length ? '<ul class="unit-status-list">' + statuses.map(status =>
            '<li data-status="' + escape(status.id) + '"><span aria-hidden="true">' + status.icon + '</span><span>' + escape(status.detail) + '</span></li>').join('') + '</ul>' :
            '<p class="unit-status-empty">No active statuses.</p>';
    }

    function install(getState) {
        const dialog = document.createElement('dialog');
        dialog.className = 'unit-status-dialog';
        dialog.setAttribute('aria-labelledby', 'unit-status-title');
        dialog.innerHTML = '<div class="unit-status-heading"><h2 id="unit-status-title"></h2><button type="button" class="unit-status-close" aria-label="Close statuses">✕</button></div><div class="unit-status-health"></div><div class="unit-status-content" aria-live="polite"></div>';
        document.body.appendChild(dialog);
        let selected = null;
        function refresh(state = getState()) {
            if (!selected) return;
            const unit = selected.kind === 'player' ? state?.players?.[selected.id] :
                (selected.kind === 'enemy' ? state?.enemies : state?.soldiers)?.find(unit => String(unit.id) === selected.id);
            dialog.querySelector('h2').textContent = unit ? name(unit) : 'Unit is no longer on the map';
            dialog.querySelector('.unit-status-health').textContent = unit ? 'HP ' + unit.hp + '/' + unit.maxHp : '';
            dialog.querySelector('.unit-status-content').innerHTML = renderList(unit ? buildIndex(state).get(unit) || [] : []);
        }
        document.addEventListener('click', event => {
            const trigger = event.target.closest('button.unit-status-trigger');
            if (!trigger) return;
            event.stopPropagation();
            selected = { kind: trigger.dataset.statusKind, id: trigger.dataset.statusUnit };
            refresh();
            if (!dialog.open) dialog.showModal();
        }, true);
        dialog.querySelector('.unit-status-close').addEventListener('click', () => dialog.close());
        dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
        dialog.addEventListener('close', () => { selected = null; });
        return { refresh };
    }
    return { collect, buildIndex, describe, renderCompact, renderEdges, renderList, install };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = UNIT_STATUSES;
else window.UNIT_STATUSES = UNIT_STATUSES;
