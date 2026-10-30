'use strict';

/**
 * ИНТЕРАКТИВНЫЙ UI МОКАПА ВЫБОРА БАШЕН (TOWER DRAFT UI)
 * Предоставляет модальное окно и автономный виджет для игроков и мастера.
 * Включает:
 * - Переключение роли: Глазами Игрока / Глазами Мастера
 * - Скрытие башен мастером (hiddenFromPlayers)
 * - Бейджи: "1 прямая линия" и "Развилка на IV уровне"
 * - Характеристики по уровням (I-IV, мин/макс урон, ХП, броня, пассивный доход золота)
 * - Интерактивную симуляцию командного голосования за набор башен (rosterVote)
 */

const TOWER_DRAFT_UI = (() => {
    const STORAGE_KEY = 'kr_tower_draft_selection';
    const MAX_SLOTS = 5;

    // Внутреннее состояние
    let state = {
        selectedIds: ['dwarf_outpost', 'necro_tower', 'royal_mage', 'archer_tower', 'bombard_tower'],
        activeArchetype: 'all',
        searchQuery: '',
        inspectedTowerId: 'dwarf_outpost',
        viewerRole: 'player', // 'player' | 'master'
        simulatedVote: null,  // { initiator: 'Геральд', votes: { 'Геральд': true, 'Малик': null, 'Торгар': null } }
        onApplyCallback: null
    };

    // Загрузка сохранённого выбора
    function loadSavedDraft() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    state.selectedIds = parsed.slice(0, MAX_SLOTS);
                }
            }
        } catch (e) {
            console.warn('[TowerDraft] Could not read localStorage:', e);
        }
    }

    function saveDraftToStorage() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state.selectedIds));
        } catch (e) {}
    }

    function getOrCreateModalRoot() {
        let root = document.getElementById('tower-draft-modal-root');
        if (!root) {
            root = document.createElement('div');
            root.id = 'tower-draft-modal-root';
            document.body.appendChild(root);
        }
        return root;
    }

    function openModal({ onApply } = {}) {
        loadSavedDraft();
        state.onApplyCallback = onApply || null;
        if (!state.selectedIds.includes(state.inspectedTowerId)) {
            state.inspectedTowerId = state.selectedIds[0] || TOWER_DRAFT_CATALOG.TOWERS[0].id;
        }
        renderModal();
    }

    function closeModal() {
        const root = document.getElementById('tower-draft-modal-root');
        if (root) root.innerHTML = '';
    }

    function toggleSelectTower(towerId) {
        const idx = state.selectedIds.indexOf(towerId);
        if (idx >= 0) {
            state.selectedIds.splice(idx, 1);
        } else {
            if (state.selectedIds.length >= MAX_SLOTS) {
                alert(`Arsenal full! Maximum selected: ${MAX_SLOTS} towers. Remove one before adding another.`);
                return;
            }
            state.selectedIds.push(towerId);
        }
        state.inspectedTowerId = towerId;
        saveDraftToStorage();
        renderModal();
    }

    function applyPreset(presetId) {
        const preset = TOWER_DRAFT_CATALOG.PRESETS.find(p => p.id === presetId);
        if (preset) {
            state.selectedIds = [...preset.towers].slice(0, MAX_SLOTS);
            state.inspectedTowerId = state.selectedIds[0];
            saveDraftToStorage();
            renderModal();
        }
    }

    function toggleViewerRole() {
        state.viewerRole = state.viewerRole === 'player' ? 'master' : 'player';
        renderModal();
    }

    function toggleTowerHidden(towerId) {
        const tower = TOWER_DRAFT_CATALOG.getTowerById(towerId);
        if (tower) {
            tower.hiddenFromPlayers = !tower.hiddenFromPlayers;
            // Если игрок убрал скрытую башню из видимости
            if (tower.hiddenFromPlayers && state.viewerRole === 'player') {
                const idx = state.selectedIds.indexOf(towerId);
                if (idx >= 0) state.selectedIds.splice(idx, 1);
            }
            renderModal();
        }
    }

    function startVoteSimulation() {
        if (state.selectedIds.length === 0) {
            alert('Select at least one tower for the arsenal first!');
            return;
        }
        state.simulatedVote = {
            initiator: 'Gerald',
            proposedTypes: [...state.selectedIds],
            votes: {
                'Gerald': true,
                'Malik': null,
                'Torghar': null
            }
        };
        renderModal();
    }

    function simulateVoteAction(voter, agree) {
        if (!state.simulatedVote) return;
        if (agree === false) {
            alert(`❌ Player ${voter} voted AGAINST. The vote failed; the arsenal is unchanged.`);
            state.simulatedVote = null;
            renderModal();
            return;
        }
        state.simulatedVote.votes[voter] = true;
        const allAgreed = Object.values(state.simulatedVote.votes).every(v => v === true);
        if (allAgreed) {
            state.selectedIds = [...state.simulatedVote.proposedTypes];
            saveDraftToStorage();
            if (typeof state.onApplyCallback === 'function') {
                state.onApplyCallback([...state.selectedIds]);
            }
            alert(`🎉 The team unanimously approved an arsenal of ${state.selectedIds.length} towers!`);
            state.simulatedVote = null;
        }
        renderModal();
    }

    function masterForceApprove() {
        if (!state.simulatedVote) return;
        state.selectedIds = [...state.simulatedVote.proposedTypes];
        saveDraftToStorage();
        if (typeof state.onApplyCallback === 'function') {
            state.onApplyCallback([...state.selectedIds]);
        }
        alert('👑 The GM forced approval of the team arsenal!');
        state.simulatedVote = null;
        renderModal();
    }

    function cancelVote() {
        state.simulatedVote = null;
        renderModal();
    }

    /**
     * Основной рендер интерфейса
     */
    function renderModal() {
        const root = getOrCreateModalRoot();
        const catalog = TOWER_DRAFT_CATALOG;

        // Фильтрация башен
        let allTowers = catalog.TOWERS;
        if (state.viewerRole === 'player') {
            allTowers = allTowers.filter(t => !t.hiddenFromPlayers);
        }

        const filteredTowers = allTowers.filter(t => {
            if (state.activeArchetype !== 'all' && t.archetype !== state.activeArchetype) return false;
            if (state.searchQuery) {
                const q = state.searchQuery.toLowerCase();
                const matchName = t.name.toLowerCase().includes(q) || t.subtitle.toLowerCase().includes(q);
                const matchDesc = t.description.toLowerCase().includes(q);
                const matchEff = t.effects && t.effects.some(e => e.name.toLowerCase().includes(q) || e.desc.toLowerCase().includes(q));
                if (!matchName && !matchDesc && !matchEff) return false;
            }
            return true;
        });

        const selectedTowers = state.selectedIds
            .map(id => catalog.getTowerById(id))
            .filter(Boolean);

        const inspected = catalog.getTowerById(state.inspectedTowerId) || selectedTowers[0] || filteredTowers[0] || catalog.TOWERS[0];

        root.innerHTML = `
            <div class="draft-modal-backdrop" id="draft-backdrop">
                <div class="draft-window" onclick="event.stopPropagation()">
                    
                    <!-- Window header -->
                    <header class="draft-header">
                        <div class="draft-header-title">
                            <div>
                                <h2>
                                    <span>🏰 Pre-game Tower Arsenal</span>
                                    <span class="draft-badge-proto">PROTOTYPE</span>
                                </h2>
                                <p class="draft-header-desc">
                                    Preparation: choose 5 towers for the roster. Towers have either <b>1 direct line</b> and <b>branches at level IV</b>.
                                </p>
                            </div>
                        </div>
                        <div style="display:flex; align-items:center; gap:10px;">
                            <button class="draft-role-toggle ${state.viewerRole === 'master' ? 'master-active' : ''}" id="draft-toggle-role-btn">
                                ${state.viewerRole === 'master' ? '👑 Mode: GM (hidden towers visible)' : '👤 Mode: Player'}
                            </button>
                            <button class="draft-close-btn" id="draft-btn-close" title="Close">✕</button>
                        </div>
                    </header>

                    <!-- Selected arsenal slots -->
                    <section class="draft-slots-bar">
                        <div class="draft-slots-heading">
                            <div>
                                <strong>Team roster:</strong>
                                <span class="draft-slots-count">${state.selectedIds.length} / ${MAX_SLOTS}</span>
                            </div>
                            <div class="draft-presets-bar">
                                <span class="draft-preset-label">Presets:</span>
                                ${catalog.PRESETS.map(p => `
                                    <button class="draft-preset-chip" data-preset-id="${p.id}" title="${p.desc}">${p.name}</button>
                                `).join('')}
                            </div>
                        </div>

                        <!-- 5 arsenal slots -->
                        <div class="draft-slots-container">
                            ${Array.from({ length: MAX_SLOTS }).map((_, i) => {
                                const tower = selectedTowers[i];
                                if (tower) {
                                    return `
                                        <div class="draft-slot-card filled" data-inspect-id="${tower.id}">
                                            <span class="draft-slot-icon">${tower.icon}</span>
                                            <div class="draft-slot-info">
                                                <div class="draft-slot-name">${tower.name}</div>
                                                <div class="draft-slot-meta">
                                                    <span>${tower.cost} G</span> •
                                                    <span>${tower.damageRange || tower.progressionLabel}</span>
                                                </div>
                                            </div>
                                            <button class="draft-slot-remove" data-remove-id="${tower.id}" title="Remove from roster">✕</button>
                                        </div>
                                    `;
                                } else {
                                    return `
                                        <div class="draft-slot-card empty">
                                            <div class="draft-slot-empty">+ Empty slot ${i + 1}</div>
                                        </div>
                                    `;
                                }
                            }).join('')}
                        </div>
                    </section>

                    <!-- Catalog and details -->
                    <div class="draft-body">
                        
                        <!-- Filters and cards -->
                        <div class="draft-catalog-area">
                            <div class="draft-filter-bar">
                                <input type="search" class="draft-search-input" id="draft-search" placeholder="Search by name or abilities..." value="${state.searchQuery}">
                                <div class="draft-tabs">
                                    <button class="draft-tab-btn ${state.activeArchetype === 'all' ? 'active' : ''}" data-arch="all">All (${allTowers.length})</button>
                                    ${catalog.getArchetypeList().map(arch => `
                                        <button class="draft-tab-btn ${state.activeArchetype === arch.id ? 'active' : ''}" data-arch="${arch.id}">${arch.icon} ${arch.name}</button>
                                    `).join('')}
                                </div>
                            </div>

                            <div class="draft-grid">
                                ${filteredTowers.map(t => {
                                    const isSelected = state.selectedIds.includes(t.id);
                                    const isInspected = state.inspectedTowerId === t.id;
                                    const dmgInfo = catalog.DAMAGE_TYPES[t.dmgType] || { name: t.dmgType, icon: '⚔️' };
                                    const isSingle = t.progressionType === 'single';
                                    return `
                                        <div class="draft-card ${isSelected ? 'in-roster' : ''} ${isInspected ? 'active-preview' : ''} ${t.hiddenFromPlayers ? 'is-hidden-from-players' : ''}" data-card-id="${t.id}" style="position:relative;">
                                            <div class="draft-card-head">
                                                <div class="draft-card-icon">${t.icon}</div>
                                                <div class="draft-card-title-box">
                                                    <div style="display:flex; justify-content:space-between; align-items:center;">
                                                        <div class="draft-card-name">${t.name}</div>
                                                    </div>
                                                    <div class="draft-card-subtitle">${t.subtitle}</div>
                                                    <div style="margin-top:4px;">
                                                        <span class="draft-badge-progression ${isSingle ? 'single' : 'branch'}">
                                                            ${isSingle ? '⚡ 1 direct line' : '🌿 Branch at IV'}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>

                                            <div class="draft-card-stats">
                                                <div class="draft-stat-item">
                                                    <span class="draft-stat-label">Base cost</span>
                                                    <span class="draft-stat-val" style="color:#fbbf24;">${t.cost} G</span>
                                                </div>
                                                <div class="draft-stat-item">
                                                    <span class="draft-stat-label">Damage (min–max)</span>
                                                    <span class="draft-stat-val" style="color:#60a5fa;">${t.damageRange}</span>
                                                </div>
                                                <div class="draft-stat-item">
                                                    <span class="draft-stat-label">Damage type</span>
                                                    <span class="draft-stat-val" style="color:${dmgInfo.color || '#fff'}; font-weight:700;">${dmgInfo.icon} ${dmgInfo.name}</span>
                                                </div>
                                            </div>

                                            <div class="draft-effects-list">
                                                ${t.effects.slice(0, 2).map(eff => `
                                                    <div class="draft-effect-badge">
                                                        <div class="draft-effect-name">
                                                            ${eff.icon} ${eff.name}
                                                            ${eff.cooldown ? `<span class="draft-cooldown-badge">CD: ${eff.cooldown} rounds</span>` : ''}
                                                        </div>
                                                        <div class="draft-effect-desc">${eff.desc}</div>
                                                    </div>
                                                `).join('')}
                                            </div>

                                            ${state.viewerRole === 'master' ? `
                                                <label class="draft-master-checkbox-label" onclick="event.stopPropagation()">
                                                    <input type="checkbox" data-hidden-toggle-id="${t.id}" ${t.hiddenFromPlayers ? 'checked' : ''}>
                                                    <span>🚫 Disable (hide from players)</span>
                                                </label>
                                            ` : ''}

                                            <div class="draft-card-actions">
                                                <button class="draft-btn-select ${isSelected ? 'selected' : ''}" data-select-id="${t.id}">
                                                    ${isSelected ? '✓ Remove from roster' : '+ Add to arsenal'}
                                                </button>
                                                <button class="draft-btn-inspect" data-inspect-btn="${t.id}">Inspect →</button>
                                            </div>
                                        </div>
                                    `;
                                }).join('')}
                            </div>
                        </div>

                        <!-- Tower details and level I–IV table -->
                        <aside class="draft-detail-pane">
                            <div class="draft-detail-header">
                                <div class="draft-detail-icon">${inspected.icon}</div>
                                <div class="draft-detail-title-box">
                                    <h3>${inspected.name}</h3>
                                    <div class="draft-detail-subtitle">${inspected.subtitle}</div>
                                    <div style="margin-top:4px;">
                                        <span class="draft-badge-progression ${inspected.progressionType === 'single' ? 'single' : 'branch'}">
                                            ${inspected.progressionLabel}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <div class="draft-detail-section">
                                <div class="draft-detail-section-title">📜 Tower description</div>
                                <div class="draft-detail-desc">${inspected.description}</div>
                            </div>

                            <!-- Level I–IV progression -->
                            <div class="draft-detail-section">
                                <div class="draft-detail-section-title">📊 Stats by level (I – IV)</div>
                                <table class="draft-levels-table">
                                    <thead>
                                        <tr>
                                            <th>Lvl.</th>
                                            <th>Name</th>
                                            <th>Cost</th>
                                            <th>Damage / Details</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${inspected.levels ? inspected.levels.map(l => `
                                            <tr>
                                                <td><b style="color:#fbbf24;">${l.lvl}</b></td>
                                                <td>${l.name}</td>
                                                <td>${l.cost} G</td>
                                                <td>${l.dmg || l.hp ? (l.dmg ? l.dmg : `${l.hp} HP (${l.armor} armor)`) : l.gold || '—'}</td>
                                            </tr>
                                        `).join('') : `<tr><td colspan="4">Standard I–IV progression</td></tr>`}
                                    </tbody>
                                </table>
                            </div>

                            <div class="draft-detail-section">
                                <div class="draft-detail-section-title">⚡ Unique abilities and cooldowns</div>
                                ${inspected.effects.map(e => `
                                    <div style="margin-bottom: 8px; background:#0f172a; padding:6px 10px; border-radius:6px; border:1px solid #1e293b;">
                                        <div style="display:flex; justify-content:space-between; align-items:center;">
                                            <strong style="color: #38bdf8; font-size: 12px;">${e.icon} ${e.name}</strong>
                                            ${e.cooldown ? `<span class="draft-cooldown-badge">⏱️ Cooldown: ${e.cooldown} rounds</span>` : ''}
                                        </div>
                                        <div style="font-size: 10px; color: #fbbf24; margin-top: 2px;">${e.dndCheck}</div>
                                        <div style="font-size: 11px; color: #cbd5e1; margin-top: 3px;">${e.desc}</div>
                                    </div>
                                `).join('')}
                            </div>

                            <div class="draft-detail-section">
                                <div class="draft-detail-section-title">🤝 Tactical synergies</div>
                                <div class="draft-detail-desc">${inspected.synergy}</div>
                            </div>

                            <div class="draft-detail-section">
                                <div class="draft-detail-section-title">📈 Upgrade path</div>
                                <div class="draft-detail-desc" style="color: #94a3b8; font-size: 11px;">${inspected.evolutionPreview}</div>
                            </div>
                        </aside>

                    </div>

                    <!-- Team vote footer -->
                    <footer class="draft-footer">
                        <div class="draft-footer-hint">
                            💡 The arsenal can only be changed during the <b>preparation period</b>. Approval requires a unanimous team vote.
                        </div>
                        <div class="draft-footer-actions">
                            <button class="draft-btn-inspect" id="draft-btn-footer-close">Close</button>
                            <button class="draft-btn-apply" id="draft-btn-propose-vote">
                                <span>🗳️ Propose roster for team vote (${state.selectedIds.length}/${MAX_SLOTS})</span>
                            </button>
                        </div>
                    </footer>

                    <!-- Team vote dialog (when active) -->
                    ${state.simulatedVote ? `
                        <div class="draft-vote-overlay">
                            <div class="draft-vote-card">
                                <h3>🗳️ Team tower arsenal vote</h3>
                                <div class="draft-vote-meta">
                                    Proposer: <b style="color:#60a5fa;">${state.simulatedVote.initiator}</b> proposed the following 5-tower roster:
                                </div>
                                
                                <div class="draft-vote-towers-preview">
                                    ${state.simulatedVote.proposedTypes.map(id => {
                                        const t = catalog.getTowerById(id);
                                        return `<div class="draft-vote-tower-chip">${t?.icon || '🏰'} ${t?.name || id}</div>`;
                                    }).join('')}
                                </div>

                                <div class="draft-vote-tally">
                                    ${Object.entries(state.simulatedVote.votes).map(([player, vote]) => `
                                        <div class="draft-vote-player-row">
                                            <strong>${player}</strong>
                                            ${vote === true ? '<span style="color:#10b981;">✅ Approved</span>' : 
                                              vote === false ? '<span style="color:#ef4444;">❌ Rejected</span>' : 
                                              '<span style="color:#94a3b8;">⏳ Deciding...</span>'}
                                            ${vote === null ? `
                                                <div style="display:flex; gap:4px; margin-top:4px;">
                                                    <button class="draft-btn-vote-yes" data-vote-player="${player}" data-vote-val="true" style="padding:2px 8px; font-size:10px;">For</button>
                                                    <button class="draft-btn-vote-no" data-vote-player="${player}" data-vote-val="false" style="padding:2px 8px; font-size:10px;">Against</button>
                                                </div>
                                            ` : ''}
                                        </div>
                                    `).join('')}
                                </div>

                                <div class="draft-vote-btn-row">
                                    <button class="draft-btn-vote-cancel" id="draft-vote-cancel-btn">Cancel proposal</button>
                                </div>

                                <button class="draft-btn-master-force" id="draft-vote-force-master-btn">
                                    👑 Force arsenal approval (GM)
                                </button>
                            </div>
                        </div>
                    ` : ''}

                </div>
            </div>
        `;

        if (typeof window !== 'undefined' && window.KR_I18N && typeof window.KR_I18N.translateDOM === 'function') {
            window.KR_I18N.translateDOM(root, window.KR_I18N.getLang());
        }
        bindEvents(root);
    }

    /**
     * Привязка обработчиков событий
     */
    function bindEvents(root) {
        // Закрытие
        root.querySelector('#draft-btn-close')?.addEventListener('click', closeModal);
        root.querySelector('#draft-btn-footer-close')?.addEventListener('click', closeModal);
        root.querySelector('#draft-backdrop')?.addEventListener('click', e => {
            if (e.target.id === 'draft-backdrop') closeModal();
        });

        // Тумблер роли Мастер/Игрок
        root.querySelector('#draft-toggle-role-btn')?.addEventListener('click', toggleViewerRole);

        // Голосование
        root.querySelector('#draft-btn-propose-vote')?.addEventListener('click', startVoteSimulation);
        root.querySelector('#draft-vote-cancel-btn')?.addEventListener('click', cancelVote);
        root.querySelector('#draft-vote-force-master-btn')?.addEventListener('click', masterForceApprove);

        // Симуляция клика за игроков в голосовании
        root.querySelectorAll('[data-vote-player]').forEach(btn => {
            btn.addEventListener('click', () => {
                const player = btn.getAttribute('data-vote-player');
                const agree = btn.getAttribute('data-vote-val') === 'true';
                simulateVoteAction(player, agree);
            });
        });

        // Чекбоксы скрытия мастером
        root.querySelectorAll('[data-hidden-toggle-id]').forEach(chk => {
            chk.addEventListener('change', () => {
                const towerId = chk.getAttribute('data-hidden-toggle-id');
                toggleTowerHidden(towerId);
            });
        });

        // Поиск
        const searchInput = root.querySelector('#draft-search');
        if (searchInput) {
            searchInput.addEventListener('input', e => {
                state.searchQuery = e.target.value;
                renderModal();
                const input = document.querySelector('#draft-search');
                if (input) {
                    input.focus();
                    input.setSelectionRange(input.value.length, input.value.length);
                }
            });
        }

        // Вкладки архетипов
        root.querySelectorAll('.draft-tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                state.activeArchetype = btn.getAttribute('data-arch');
                renderModal();
            });
        });

        // Выбор пресетов
        root.querySelectorAll('.draft-preset-chip').forEach(btn => {
            btn.addEventListener('click', () => {
                applyPreset(btn.getAttribute('data-preset-id'));
            });
        });

        // Выбор / Снятие башни
        root.querySelectorAll('[data-select-id]').forEach(btn => {
            btn.addEventListener('click', e => {
                e.stopPropagation();
                toggleSelectTower(btn.getAttribute('data-select-id'));
            });
        });

        // Удаление из слота
        root.querySelectorAll('[data-remove-id]').forEach(btn => {
            btn.addEventListener('click', e => {
                e.stopPropagation();
                toggleSelectTower(btn.getAttribute('data-remove-id'));
            });
        });

        // Инспекция при клике на карточку
        root.querySelectorAll('[data-card-id]').forEach(card => {
            card.addEventListener('click', () => {
                state.inspectedTowerId = card.getAttribute('data-card-id');
                renderModal();
            });
        });

        // Инспекция при клике на слот
        root.querySelectorAll('[data-inspect-id]').forEach(slot => {
            slot.addEventListener('click', () => {
                state.inspectedTowerId = slot.getAttribute('data-inspect-id');
                renderModal();
            });
        });

        // Кнопка Осмотр
        root.querySelectorAll('[data-inspect-btn]').forEach(btn => {
            btn.addEventListener('click', e => {
                e.stopPropagation();
                state.inspectedTowerId = btn.getAttribute('data-inspect-btn');
                renderModal();
            });
        });
    }

    return {
        openModal,
        closeModal,
        renderModal,
        toggleViewerRole
    };
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = TOWER_DRAFT_UI;
} else {
    window.TOWER_DRAFT_UI = TOWER_DRAFT_UI;
}
