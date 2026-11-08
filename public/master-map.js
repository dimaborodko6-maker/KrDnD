var _tr = typeof _tr !== 'undefined' ? _tr : (text => (typeof window !== 'undefined' && window.KR_I18N ? window.KR_I18N.t(text) : text));

        function escapeHTML(value) {
            return String(value ?? '').replace(/[&<>"']/g, function(c) {
                return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c];
            });
        }

        // АВАРИЙНЫЙ ЧЕРНЫЙ ЯЩИК: Сразу выведет ошибку на экран, если JS зависнет
        window.onerror = function(message, source, lineno, colno, error) {
            if (typeof message === 'string' && (message.indexOf('ResizeObserver') > -1 || message === 'Script error.')) {
                return false;
            }
            console.error(message, source, lineno, error);
            if (typeof masterNotice === 'function') masterNotice('UI error: ' + message, true);
            return false;
        };

        var socket = new WebSocket((location.protocol === "https:" ? "wss://" : "ws://") + location.host);
        window.KR_DIAGNOSTICS?.trackSocket(socket);
        var currentTool = "inspect"; 
        var selectedHeroToMove = null;
        
        socket.onopen = function() { 
            const masterToken = new URLSearchParams(window.location.search).get("token") || "";
            socket.send(JSON.stringify({ type: "REGISTER_MASTER", token: masterToken }));
            initPresetWavesDropdown(); 
            buildSpawnSelectAutomatically(); // АВТОМАТИКА: Генерируем список врагов при старте сессии
            initPresetWavesDropdown();
        };
        socket.onmessage = function(e) {
    const data = JSON.parse(e.data);
    if (data.type === 'COMMAND_ERROR') { masterNotice(data.message, true); return; }
    if (data.type === 'CATALOG_UPDATE') {
        const selectedWaveNum = masterWaves()[Number(document.getElementById('preset-wave-select').value)]?.waveNum;
        const selectedEnemy = document.getElementById('active-spawn-type').value;
        Object.assign(window.GAME_DATA,data.catalog);
        initPresetWavesDropdown(); buildSpawnSelectAutomatically();
        const index = masterWaves().findIndex(wave => wave.waveNum === selectedWaveNum);
        if (index >= 0) document.getElementById('preset-wave-select').value = index;
        if (GAME_DATA.enemies[selectedEnemy]) document.getElementById('active-spawn-type').value = selectedEnemy;
        if (lastState) updateUI(lastState);
        return;
    }
    if (data.state) updateUI(data.state);
};

        function masterWaves() { return lastState?.sceneMaster?.waves || GAME_DATA.presetWaves || []; }
        function initPresetWavesDropdown() {
            var sel = document.getElementById("preset-wave-select");
            if (!sel || !window.GAME_DATA || !window.GAME_DATA.presetWaves) return;
            sel.replaceChildren();
            for (var i = 0; i < masterWaves().length; i++) {
                var w = masterWaves()[i];
                sel.add(new Option(w.title,i));
            }
        }

        function startSelectedPresetWave() {
            if ((lastState?.enemies.length || lastState?.pendingSpawns?.length) && !confirm(_tr('There are active enemies or pending reinforcements. Add another wave to them?'))) return;
            var sel = document.getElementById("preset-wave-select");
            var waveIdx = sel ? sel.value : 0;
            socket.send(JSON.stringify({ type: "MASTER_START_PRESET_WAVE", waveIndex: waveIdx }));
        }
        
        // АВТОМАТИКА: Функция вытаскивает всех врагов из gamedata.js и строит выпадающее меню
        function buildSpawnSelectAutomatically() {
            var selectEl = document.getElementById("active-spawn-type");
            if (!selectEl || !window.GAME_DATA || !window.GAME_DATA.enemies) return;
            
            selectEl.replaceChildren();
            var enemyKeys = Object.keys(GAME_DATA.enemies);
            
            for (var i = 0; i < enemyKeys.length; i++) {
                var key = enemyKeys[i];
                var en = GAME_DATA.enemies[key];
                var armorText = en.armor > 0 ? " (Armor " + en.armor + "%)" : "";
                var resText = en.magicRes > 0 ? " (Magic resist " + en.magicRes + "%)" : "";
                var flyText = en.isFlying ? " 🦅 [Flying]" : "";
                
                selectEl.add(new Option(en.name + armorText + resText + flyText + ' [ Reward: ' + en.reward + '💰 ]',key));
            }
        }

        function changeActiveTool(toolKey) { 
            currentTool = toolKey; 
            var btns = document.querySelectorAll(".tool-btn");
            for (var i = 0; i < btns.length; i++) {
                btns[i].classList.remove("active");
                if (btns[i].id === "tool-" + toolKey) {
                    btns[i].classList.add("active");
                }
            }
        }
        
        var activeMasterTower = null;
        var activeMasterRangePreview = null;
        var lastState = null;
        var masterStatusIndex = new Map();

        function masterTokenContent(unit, label, kind, id) {
            const effects = UNIT_STATUSES.renderEdges(masterStatusIndex.get(unit) || [], kind, id, false);
            return '<span class="status-token-label">' + effects.left + '<span class="status-token-name">' + escapeHTML(label) + '</span>' +
                effects.right + '</span>';
        }

        function updateMasterGridRange() {
            var grid = document.getElementById('game-grid');
            if (!grid) return;
            var cells = grid.querySelectorAll('.cell');
            var rangeCells = new Set();
            cells.forEach(function(cEl) {
                var cx = parseInt(cEl.dataset.x);
                var cy = parseInt(cEl.dataset.y);
                cEl.classList.remove('range-tower');
                if (activeMasterRangePreview && activeMasterRangePreview.x !== undefined && activeMasterRangePreview.y !== undefined) {
                    var dx = cx - activeMasterRangePreview.x, dy = cy - activeMasterRangePreview.y;
                    var distance = activeMasterRangePreview.metric === 'chebyshev' ? Math.max(Math.abs(dx), Math.abs(dy)) : Math.hypot(dx, dy);
                    var inRange = distance <= (activeMasterRangePreview.range + 0.05);
                    if (inRange) { cEl.classList.add('range-tower'); rangeCells.add(cx + ',' + cy); }
                }
            });
            var columns = lastState?.gridWidth || lastState?.grid?.[0]?.length || 16;
            var rows = lastState?.gridHeight || lastState?.grid?.length || 16;
            var options = { padding: 8 };
            MAP_RANGE_CONTOURS.render(document, grid, [{ path: MAP_RANGE_CONTOURS.path(rangeCells, columns, rows, options),
                tone: 'support', classes: 'tower-range' }], columns, rows, options);
        }

        function onMasterQuickSelectChange() {
            var selType = document.getElementById('mtm-quick-select').value;
            var proto = window.GAME_DATA && GAME_DATA.towers && GAME_DATA.towers[selType];
            if (activeMasterTower && proto) {
                activeMasterRangePreview = {
                    x: activeMasterTower.x,
                    y: activeMasterTower.y,
                    range: proto.range || 2,
                    metric: 'euclidean'
                };
                updateMasterGridRange();
            }
        }

        function openMasterTowerModal(x, y, cell) {
            activeMasterTower = { x: x, y: y, cell: cell };
            var isSlot = (cell.type === 'slot');
            var proto = (window.GAME_DATA && GAME_DATA.towers) ? GAME_DATA.towers[cell.type] : null;

            if (isSlot) {
                document.getElementById('mtm-title').innerText = "🟨 " + _tr("Empty Tower Slot") + " (" + x + ", " + y + ")";
                document.getElementById('mtm-info').innerHTML = _tr("Nothing is built here yet. Select a tower below to place it instantly:");
            } else if (proto) {
                var pName = _tr(proto.name);
                var pShort = _tr(proto.shortName || "🏰");
                var pDesc = proto.description ? _tr(proto.description) : "";
                document.getElementById('mtm-title').innerText = pShort + " " + pName;
                var details = _tr("Cell:") + " (" + x + ", " + y + ")<br>" + _tr("Range:") + " " + proto.range + " " + _tr("cells") + "<br>";
                if (proto.isBarracks) {
                    details += _tr("Garrison:") + " " + (proto.soldierCount || 3) + " " + _tr("soldiers") + " (HP: " + proto.soldierHp + ", " + _tr("armor:") + " " + proto.soldierArmor + "%, " + _tr("damage:") + " " + proto.soldierDmg + ")";
                } else {
                    var dStr = (proto.minDamage !== undefined) ? (proto.minDamage + "-" + proto.maxDamage) : proto.damage;
                    details += _tr("Damage:") + " " + dStr + " (" + (proto.dmgType === 'magic' ? _tr('Magic') : _tr('Physical')) + ")";
                }
                if (pDesc) {
                    details += "<br><div style='color:#94a3b8; font-size:11px; margin-top:4px;'>" + escapeHTML(pDesc) + "</div>";
                }
                document.getElementById('mtm-info').innerHTML = details;
            }

            // Заполняем селект быстрого выбора
            var qSel = document.getElementById('mtm-quick-select');
            if (qSel && window.GAME_DATA && GAME_DATA.towers) {
                var html = "";
                for (var tKey in GAME_DATA.towers) {
                    var t = GAME_DATA.towers[tKey];
                    var selAttr = (tKey === cell.type) ? " selected" : "";
                    html += "<option value='" + tKey + "'" + selAttr + ">" + _tr(t.name) + " (" + _tr(t.shortName || "") + ")</option>";
                }
                qSel.innerHTML = html;
            }

            activeMasterRangePreview = {
                x: x,
                y: y,
                range: proto ? proto.range : (isSlot ? 3 : 2),
                metric: 'euclidean'
            };
            updateMasterGridRange();

            document.getElementById('master-tower-modal').style.display = 'flex';
        }

        function closeMasterTowerModal() {
            document.getElementById('master-tower-modal').style.display = 'none';
            activeMasterTower = null;
            activeMasterRangePreview = null;
            renderSelectedObject();
        }

        function masterChangeLevel(delta) {
            if (!activeMasterTower) return;
            socket.send(JSON.stringify({
                type: 'MASTER_CHANGE_TOWER_LEVEL',
                x: activeMasterTower.x,
                y: activeMasterTower.y,
                delta: delta
            }));
            closeMasterTowerModal();
        }

        function masterApplyQuickTower() {
            if (!activeMasterTower) return;
            var newType = document.getElementById('mtm-quick-select').value;
            socket.send(JSON.stringify({
                type: 'MASTER_SET_TOWER',
                x: activeMasterTower.x,
                y: activeMasterTower.y,
                towerType: newType
            }));
            closeMasterTowerModal();
        }

        function masterDemolishTower() {
            if (!activeMasterTower) return;
            if (confirm(_tr("Demolish this tower at (" + activeMasterTower.x + ", " + activeMasterTower.y + ") into an empty slot?"))) {
                socket.send(JSON.stringify({
                    type: 'MASTER_SET_TOWER',
                    x: activeMasterTower.x,
                    y: activeMasterTower.y,
                    towerType: 'slot'
                }));
                closeMasterTowerModal();
            }
        }

        function clickCell(x, y) {
            if (selectedHeroToMove) { 
                socket.send(JSON.stringify({ type: "MOVE_HERO", playerName: selectedHeroToMove, x: x, y: y })); 
                selectedHeroToMove = null; 
                return; 
            }
            if (currentTool === "spawn-click") {
                var eType = document.getElementById("active-spawn-type").value;
                socket.send(JSON.stringify({ type: "MASTER_SPAWN_ENEMY", enemyType: eType, x: x, y: y }));
                return;
            }
            if (currentTool === "erase-enemy") {
                // Если в клетке есть башня или слот башни, а врагов нет — открываем панель управления/строительства башни!
                var cell = (lastState && lastState.grid && lastState.grid[y]) ? lastState.grid[y][x] : null;
                var hasEnemies = (lastState && lastState.enemies) ? lastState.enemies.some(function(e) { return e.x === x && e.y === y; }) : false;
                if (!hasEnemies && cell && (cell.type in GAME_DATA.towers || cell.type === 'slot')) {
                    openMasterTowerModal(x, y, cell);
                    return;
                }

                socket.send(JSON.stringify({ type: "MASTER_ERASE_ENEMY", x: x, y: y }));
                return;
            }
            socket.send(JSON.stringify({ type: "MASTER_EDIT_CELL", x: x, y: y, cellType: currentTool }));
        }

        function godEdit(field, inputId, pName) {
            var val = document.getElementById(inputId).value;
            socket.send(JSON.stringify({ type: 'MASTER_GOD_EDIT', field: field, value: val, pName: pName }));
        }

        function godToggleBool(field, pName, currentVal) {
            var newVal = currentVal ? 'false' : 'true';
            socket.send(JSON.stringify({ type: 'MASTER_GOD_EDIT', field: field, value: newVal, pName: pName }));
        }

        function godToggleSkill(pName, skillKey) {
            socket.send(JSON.stringify({ type: 'MASTER_GOD_EDIT', field: 'toggleSkill', value: skillKey, pName: pName }));
        }

        function undoAction(logId) {
            socket.send(JSON.stringify({ type: 'MASTER_UNDO_ACTION', logId: logId }));
        }

        function masterResolveDemolish(approve) {
            if (approve) {
                socket.send(JSON.stringify({ type: 'MASTER_FORCE_DEMOLISH' }));
            } else {
                socket.send(JSON.stringify({ type: 'CANCEL_DEMOLISH' }));
            }
        }

        function masterResolveRoster(approve) {
            if (approve) {
                socket.send(JSON.stringify({ type: 'MASTER_FORCE_SET_ROSTER' }));
            } else {
                socket.send(JSON.stringify({ type: 'CANCEL_TOWER_ROSTER_VOTE' }));
            }
        }
        window.masterResolveRoster = masterResolveRoster;

        function updateUI(state) {
            lastState = state;
            masterStatusIndex = UNIT_STATUSES.buildIndex(state);
            if (document.activeElement !== document.getElementById('god-gold')) document.getElementById('god-gold').value = state.gold;
            if (document.activeElement !== document.getElementById('god-base-hp')) document.getElementById('god-base-hp').value = state.baseHp;
            
            var rvBanner = document.getElementById('master-roster-banner');
            if (rvBanner) {
                if (state.rosterVote) {
                    var rv = state.rosterVote;
                    var allPlayers = Object.keys(state.players);
                    var agreedCount = Object.keys(rv.votes || {}).filter(function(k) { return rv.votes[k] === true; }).length;
                    var proposedNames = (rv.proposedTypes || []).map(function(t) { return (GAME_DATA.towers[t]?.name || t); }).join(', ');
                    document.getElementById('master-roster-text').innerHTML = "Player <b>" + rv.initiator + "</b> proposed an arsenal: <b>" + proposedNames + "</b>. Approved: <b>" + agreedCount + " of " + allPlayers.length + "</b>";
                    rvBanner.style.display = 'flex';
                } else {
                    rvBanner.style.display = 'none';
                }
            }

            var dvBanner = document.getElementById('master-demolish-banner');
            if (dvBanner) {
                if (state.demolishVote) {
                    var dv = state.demolishVote;
                    var allP = Object.keys(state.players);
                    var agreed = Object.keys(dv.votes || {}).filter(function(k) { return dv.votes[k] === true; }).length;
                    document.getElementById('master-demolish-text').innerHTML = "Player <b>" + dv.initiator + "</b> requested demolition of <b>" + dv.towerName + "</b> at (" + dv.towerX + ", " + dv.towerY + "). Refund: <b>+" + dv.refundGold + "💰</b>. Approved: <b>" + agreed + " of " + allP.length + "</b>";
                    dvBanner.style.display = 'flex';
                } else {
                    dvBanner.style.display = 'none';
                }
            }

            var logBox = document.getElementById('log-box');
            var logHtml = "";
            var logs = state.log || state.actionLogs || [];
            for (var i = 0; i < logs.length; i++) {
                var l = logs[i];
                logHtml += "<div class='log-line'><span>" + escapeHTML(window.KR_I18N ? window.KR_I18N.t(l.text) : l.text) + "</span></div>";
            }
            logBox.innerHTML = logHtml;

            var debugBox = document.getElementById('debug-log-box');
            if (debugBox) {
                var dLogs = state.debugLogs || [];
                var isNearBottom = (debugBox.scrollHeight - debugBox.clientHeight) <= (debugBox.scrollTop + 40);
                debugBox.innerText = dLogs.length > 0 ? dLogs.join("\n") : "The log is empty. The server writes detailed traces of casts, filters and turns here...";
                if (isNearBottom) {
                    debugBox.scrollTop = debugBox.scrollHeight;
                }
            }
            
            var gw = state.gridWidth || (state.grid[0] ? state.grid[0].length : 16);
            var gh = state.gridHeight || state.grid.length;
            
            var mapWInput = document.getElementById('map-w-input');
            var mapHInput = document.getElementById('map-h-input');
            if (mapWInput && document.activeElement !== mapWInput) mapWInput.value = gw;
            if (mapHInput && document.activeElement !== mapHInput) mapHInput.value = gh;

            var moveWaveBtn = document.getElementById('btn-move-enemies');
            var playerKeys = Object.keys(state.players);
            var readyCount = playerKeys.filter(function(k) { return state.players[k].isReady; }).length;
            var totalCount = playerKeys.length;
            if (moveWaveBtn) {
                var countStr = totalCount > 0 ? " (Ready: " + readyCount + "/" + totalCount + ")" : "";
                moveWaveBtn.innerHTML = "➡️ WAVE TURN (Enemies move!) " + countStr;
                if (totalCount > 0 && readyCount === totalCount) {
                    moveWaveBtn.style.background = "#00e676";
                    moveWaveBtn.style.color = "#111";
                    moveWaveBtn.style.boxShadow = "0 0 14px rgba(0, 230, 118, 0.75)";
                } else {
                    moveWaveBtn.style.background = "#ffcc00";
                    moveWaveBtn.style.color = "#111";
                    moveWaveBtn.style.boxShadow = "none";
                }
            }

            var grid = document.getElementById('game-grid'); 
            grid.innerHTML = '';
            grid.style.gridTemplateColumns = "repeat(" + gw + ", 80px)";
            grid.style.gridTemplateRows = "repeat(" + gh + ", 80px)";
            
            for (var y = 0; y < gh; y++) {
                for (var x = 0; x < gw; x++) {
                    var cell = (state.grid[y] && state.grid[y][x]) ? state.grid[y][x] : { type: 'empty' }; 
                    var cellEl = document.createElement('button');
                    cellEl.type = 'button';
                    cellEl.setAttribute('aria-label', 'Cell ' + x + ', ' + y);
                    cellEl.dataset.x = x;
                    cellEl.dataset.y = y;
                    var cellClasses = "cell " + cell.type;

                    if (activeMasterRangePreview && activeMasterRangePreview.x !== undefined && activeMasterRangePreview.y !== undefined) {
                        var inRange = Math.hypot(x - activeMasterRangePreview.x, y - activeMasterRangePreview.y) <= (activeMasterRangePreview.range + 0.05);
                        if (inRange) cellClasses += " range-tower";
                    }

                    cellEl.className = cellClasses;
                    cellEl.setAttribute('onclick', "clickCell(" + x + ", " + y + ")");
                    cellEl.innerHTML = "<span class='coords'>" + x + "," + y + "</span>";
                    if ((state.mines || []).some(mine => mine.x === x && mine.y === y)) {
                        cellEl.innerHTML += "<span title='Bolin’s mine' style='position:absolute; bottom:1px; left:1px; font-size:12px; z-index:6; pointer-events:none;'>💣</span>";
                    }
                    
                    if (window.GAME_DATA && GAME_DATA.towers && cell.type in GAME_DATA.towers) {
                        var tow = GAME_DATA.towers[cell.type];
                        if (tow) cellEl.innerHTML += renderTowerMapBadge(tow);
                        // Dwarven Mine status
                        if (cell.type.startsWith('dwarf_')) {
                            var towerKey = x + ',' + y;
                            var dSoldiers = (state.soldiers || []).filter(function(s) { return s.towerKey === towerKey && s.hp > 0 && s.respawnTimer === 0; });
                            var inMineCount = dSoldiers.filter(function(s) { return s.inMine; }).length;
                            var hasDeepMine = (cell.upgrades || []).indexOf('dwarf_deep_mine') !== -1;
                            if (inMineCount > 0) {
                                cellEl.innerHTML += '<span class="dwarf-mine-badge" title="Dwarves in the mine face: ' + inMineCount + '/3 (+gold)">⛏️' + inMineCount + '/3</span>';
                            } else if (dSoldiers.length > 0) {
                                if (hasDeepMine) {
                                    cellEl.innerHTML += '<span class="dwarf-mine-badge deep-mine" title="All dwarves in combat, but Deep Vein continues producing income!">💰Vein</span>';
                                } else {
                                    cellEl.innerHTML += '<span class="dwarf-mine-badge mine-halted" title="All 3 dwarves entered combat on the road! Mining paused.">⛔Combat</span>';
                                }
                            }
                        }

                        // Court Mage Magic Resonance
                        if (cell.damageBuffTurns > 0 && cell.damageBuffMultiplier > 1) {
                            cellEl.classList.add('cell-magic-resonance');
                            cellEl.innerHTML += '<span class="resonance-buff-badge" title="Magic Resonance: damage increased by 25% (turns remaining: ' + cell.damageBuffTurns + ')">🔮+25% (' + cell.damageBuffTurns + 't)</span>';
                        }
                    }
                    
                    var cellEnemies = state.enemies.filter(function(e) { return e.x === x && e.y === y; });
                    for (var eIdx = 0; eIdx < Math.min(cellEnemies.length, 2); eIdx++) {
                        var enemy = cellEnemies[eIdx];
                        // АВТОМАТИКА РЕНДЕРА ФИШЕК: Тянет цвета и короткие имена прямо из gamedata.js
                        var enemyProto = GAME_DATA.enemies[enemy.type] || { color: "#2e7d32", shortName: enemy.name.substring(0,3) };
                        if (enemy.eventKind) enemyProto = { color: enemy.eventKind === 'goldenGoblin' ? '#a36b00' : '#69428c', shortName: { goldenGoblin:'💰', goblinTower:'🏚', ritualTotem:'🔮' }[enemy.eventKind] || enemy.name.substring(0,3) };
                        var isSheep = enemy.isPolymorphed || (enemy.polymorphTurns > 0);
                        var bgCol = isSheep ? "#ffffff" : enemyProto.color;
                        var txtCol = isSheep ? "#111111" : "#ffffff";
                        var borderStyle = isSheep ? "border: 1px dashed #ff9800; box-shadow: 0 0 5px #ffffff;" : "";
                        var label = enemyProto.shortName + '.❤' + enemy.hp;
                        cellEl.innerHTML += "<div class='token' style='background: " + bgCol + "; color: " + txtCol + "; " + borderStyle + " bottom: " + (2 + eIdx * 16) + "px; z-index: " + (10 + eIdx) + "; font-size: 12px; font-weight: bold;'>" + masterTokenContent(enemy, label, 'enemy', enemy.id) + "</div>";
                    }

                    if (cellEnemies.length > 2) {
                        cellEl.innerHTML += "<span class='stack-count'>+" + (cellEnemies.length - 2) + "</span>";
                    }
                    var cellSoldiers = (state.soldiers || []).filter(function(s) { return s.x === x && s.y === y && s.hp > 0 && s.respawnTimer === 0; });
                    for (var sIdx = 0; sIdx < Math.min(cellSoldiers.length, Math.max(0, 2 - cellEnemies.length)); sIdx++) {
                        var soldier = cellSoldiers[sIdx];
                        cellEl.innerHTML += "<div class='token soldier-token' style='bottom: " + (2 + (cellEnemies.length + sIdx) * 16) + "px; z-index: " + (20 + sIdx) + ";'>" + masterTokenContent(soldier, '❤' + soldier.hp, 'soldier', soldier.id) + "</div>";
                    }
                    
                    var heroIdx = 0;
                    var pKeys = Object.keys(state.players);
                    for (var pIdx = 0; pIdx < pKeys.length; pIdx++) {
                        var p = state.players[pKeys[pIdx]]; 
                        if (p.x === x && p.y === y && p.hp > 0) { 
                            cellEl.innerHTML += "<div class='token hero-token' style='top: " + (2 + heroIdx * 16) + "px;'>" + masterTokenContent(p, p.heroName.substring(0, 3), 'player', pKeys[pIdx]) + "</div>";
                            heroIdx++; 
                        } 
                    }

                    // Флаг точки сбора казармы
                    for (var ty = 0; ty < gh; ty++) {
                        for (var tx = 0; tx < gw; tx++) {
                            var tc = state.grid[ty] && state.grid[ty][tx];
                            if (tc && tc.rallyPoint && tc.rallyPoint.x === x && tc.rallyPoint.y === y && window.GAME_DATA && GAME_DATA.towers && tc.type in GAME_DATA.towers && GAME_DATA.towers[tc.type].isBarracks) {
                                cellEl.innerHTML += "<span title='Barracks rally point' style='position:absolute; top:2px; right:2px; font-size:10px; z-index:30; pointer-events:none; text-shadow:1px 1px 2px #000;'>🚩</span>";
                            }
                        }
                    }

                    // Necromancer Poison Mire
                    var poisonPuddle = state.poisonPuddles && state.poisonPuddles.find(function(pp) { return pp.x === x && pp.y === y; });
                    if (poisonPuddle) {
                        cellEl.classList.add('cell-poison-mire');
                        cellEl.innerHTML += '<div class="poison-mire-overlay" title="Poison Mire: 15 DoT damage (remaining: ' + poisonPuddle.turns + ' rounds)">' +
                            '<span class="mire-bubble-1"></span><span class="mire-bubble-2"></span><span class="mire-bubble-3"></span>' +
                            '<span class="mire-skull">☠️</span></div>';
                    }

                    // Magma Pool
                    var magmaPuddle = state.magmaPuddles && state.magmaPuddles.find(function(mp) { return mp.x === x && mp.y === y; });
                    if (magmaPuddle) {
                        cellEl.classList.add('cell-magma-pool');
                        cellEl.innerHTML += '<div class="magma-pool-overlay" title="Magma Pool: 15 fire damage (remaining: ' + magmaPuddle.turns + ' rounds)">' +
                            '<span class="magma-bubble-1">🔥</span><span class="magma-counter">' + magmaPuddle.turns + 't</span></div>';
                    }

                    // Oil Slick
                    var oilPuddle = state.oilPuddles && state.oilPuddles.find(function(op) { return op.x === x && op.y === y; });
                    if (oilPuddle) {
                        cellEl.classList.add('cell-oil-slick');
                        cellEl.innerHTML += '<div class="oil-slick-overlay" title="Oil Slick: Slows enemies (remaining: ' + oilPuddle.turns + ' rounds)">' +
                            '<span class="oil-bubble-1">🛢️</span><span class="oil-counter">' + oilPuddle.turns + 't</span></div>';
                    }

                    // Recent Combat FX
                    if (state.recentCombatFx && state.recentCombatFx.length > 0) {
                        state.recentCombatFx.forEach(function(fx) {
                            var isTargetCell = (fx.toX !== undefined && fx.toX === x && fx.toY === y) ||
                                               (fx.toX === undefined && fx.x !== undefined && fx.x === x && fx.y === y);
                            if (isTargetCell) {
                                var fxClass = 
                                    ['blast_keg', 'dwaarp_furnace', 'bertha_napalm', 'mecha_flame', 'solar_flare', 'supernova', 'trebuchet_pitch'].indexOf(fx.type) !== -1 ? 'combat-fx-fire' :
                                    ['bertha_missile', 'mecha_missile'].indexOf(fx.type) !== -1 ? 'combat-fx-rocket' :
                                    ['mecha_heavy', 'mecha_concussion', 'dwaarp_shockwave', 'dwaarp_drill', 'barbarian_axe', 'trebuchet_boulder', 'ballista_pierce', 'punishing_strike'].indexOf(fx.type) !== -1 ? 'combat-fx-shock' :
                                    ['ranger_roots', 'priestess_cleanse'].indexOf(fx.type) !== -1 ? 'combat-fx-nature' :
                                    ['radiant_smite', 'for_the_king', 'guard_taunt', 'champion_riposte', 'sharpshooter_mark'].indexOf(fx.type) !== -1 ? 'combat-fx-smite' :
                                    ['old_tome_shot', 'sharpshooter_snipe', 'royal_volley', 'ballista_anti_air'].indexOf(fx.type) !== -1 ? 'combat-fx-tome' :
                                    fx.type === 'dwarf_surprise' ? 'combat-fx-surprise' :
                                    fx.type === 'poison_mire' ? 'combat-fx-mire-cast' : 'combat-fx-blast';
                                var fxText = fx.text || '✨';
                                cellEl.innerHTML += '<div class="combat-fx-banner ' + fxClass + '">' + fxText + '</div>';
                            }
                        });
                    }

                    grid.appendChild(cellEl);
                }
            }

            updateMasterGridRange();
            if (typeof renderMasterPanels === 'function') {
                renderMasterPanels(state);
            } else {
                window.addEventListener('DOMContentLoaded', function() {
                    if (typeof renderMasterPanels === 'function') renderMasterPanels(lastState || state);
                }, { once: true });
            }
        }

        function kickPlayer(pName) {
            if (confirm(_tr("Really remove character [" + pName + "] from the tactical map?"))) {
                socket.send(JSON.stringify({ type: 'MASTER_KICK_PLAYER', playerName: pName }));
            }
        }

        function resetSessionConfirm(clearTowers) {
            var msg = clearTowers 
                ? "Clear all heroes and enemies AND DEMOLISH ALL TOWERS (return them to slots)? Roads will remain."
                : "Clear heroes and enemies for a new round? (Terrain and towers will remain.)";
            if (confirm(_tr(msg))) {
                socket.send(JSON.stringify({ type: 'MASTER_RESET_SESSION', clearTowers: !!clearTowers }));
            }
        }

        function resetFullMapConfirm() {
            if (confirm(_tr("WARNING! Completely erase EVERYTHING (roads, castle, spawns, towers, heroes)? The map will become empty grass."))) {
                socket.send(JSON.stringify({ type: 'MASTER_RESET_FULL' }));
            }
        }
        
        function resizeMapCustom() {
            var w = parseInt(document.getElementById('map-w-input').value) || 16;
            var h = parseInt(document.getElementById('map-h-input').value) || 16;
            if (w < 8 || w > 40 || h < 8 || h > 40) {
                alert(_tr("Map dimensions must be between 8 and 40 cells!"));
                return;
            }
            if (confirm(_tr("Resize map to " + w + " × " + h + "? Existing terrain will be preserved."))) {
                socket.send(JSON.stringify({ type: 'MASTER_RESIZE_MAP', width: w, height: h }));
            }
        }

        function setMapPreset(w, h) {
            document.getElementById('map-w-input').value = w;
            document.getElementById('map-h-input').value = h;
            if (confirm(_tr("Apply map size " + w + " × " + h + "?"))) {
                socket.send(JSON.stringify({ type: 'MASTER_RESIZE_MAP', width: w, height: h }));
            }
        }
        
        function moveEnemies() { socket.send(JSON.stringify({ type: 'MASTER_MOVE_ENEMIES' })); }

        function copyDebugLogToClipboard() {
            var pre = document.getElementById('debug-log-box');
            var text = pre ? pre.innerText : "";
            if (!text || text.indexOf("Log is empty") === 0) {
                alert(_tr("The debug log is empty!"));
                return;
            }
            navigator.clipboard.writeText(text).then(function() {
                var btn = document.getElementById('btn-copy-debug-log');
                if (btn) {
                    var orig = btn.innerHTML;
                    btn.innerHTML = "✅ Copied to clipboard!";
                    btn.style.background = "#00e676";
                    setTimeout(function() {
                        btn.innerHTML = orig;
                        btn.style.background = "#00e5ff";
                    }, 1800);
                }
            }).catch(function(err) {
                alert(_tr("Clipboard copy error: " + err));
            });
        }

        function clearDebugLog() {
            socket.send(JSON.stringify({ type: 'CLEAR_DEBUG_LOG' }));
        }
    

if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') window.addEventListener('kr6:langchange', function() {
    if (typeof updateUI === 'function' && lastState) {
        try { updateUI(lastState); } catch(e) {}
    }
});
