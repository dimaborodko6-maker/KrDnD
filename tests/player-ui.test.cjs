const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { game, clientSource, data } = require('./helpers/game-harness.cjs');

function playerUI(state, key = 'ratchet', gameData = data) {
    const elements = new Map();
    class Element {
        constructor() {
            this.children = []; this.style = { setProperty(name, value) { this[name] = value; } }; this.dataset = {}; this.value = ''; this.textContent = '';
            this.clientWidth = 600; this.clientHeight = 500;
            const classes = new Set();
            this.classList = { add: (...v) => v.forEach(x => classes.add(x)), remove: (...v) => v.forEach(x => classes.delete(x)),
                contains: v => classes.has(v), toggle(v, enabled) { if (enabled) classes.add(v); else classes.delete(v); } };
        }
        setAttribute(name, value) { this[name] = value; }
        append(...children) { this.children.push(...children); }
        appendChild(child) { this.children.push(child); }
        addEventListener() {}
        get offsetWidth() { return 46; }
        get offsetHeight() { return 24; }
        replaceChildren(...children) { this.children = children; }
        querySelector(selector) { return this.children.find(c => c.className === selector.slice(1)); }
        querySelectorAll(selector) {
            if (selector === '.health-token') return this.children.flatMap(child => [
                ...((child.className || '').includes('health-token') ? [child] : []), ...child.querySelectorAll(selector)]);
            return this.children;
        }
    }
    const document = {
        getElementById(id) { if (!elements.has(id)) { const element = new Element(); element.id = id; elements.set(id, element); } return elements.get(id); },
        createElement(tag) { const element = new Element(); element.tagName = tag.toUpperCase(); return element; },
        querySelectorAll(selector) {
            if (selector === '.ab-btn') return document.getElementById('ab-box').children;
            if (selector === '.mode-btn') return ['action', 'move', 'build', 'journal'].map(m => document.getElementById('mode-' + m));
            return [];
        }
    };
    const sent = [];
    class WebSocket { static OPEN = 1; readyState = 1; send(raw) { sent.push(JSON.parse(raw)); } }
    const context = { document, WebSocket, setTimeout() {}, ResizeObserver: class { observe() {} },
        location: { host: 'localhost', reload() {} }, GAME_DATA: gameData, TOWER_RULES: require('../public/tower-rules.js'),
        UNIT_STATUSES: { ...require('../public/unit-statuses.js'), install: () => ({ refresh() {} }) },
        BATTLE_ABILITY_RULES: require('../public/battle-ability-rules.js'),
        MAP_RANGE_CONTOURS: require('../public/map-range-contours.js'),
        localStorage: { getItem() { return null; }, setItem() {} },
        alert(message) { throw new Error(message); }, state, key };
    context.window = context;
    vm.createContext(context);
    vm.runInContext(require('node:fs').readFileSync(require('node:path').join(__dirname, '../public/combat-text.js'), 'utf8'), context);
    vm.runInContext(require('node:fs').readFileSync(require('node:path').join(__dirname, '../public/tower-roster-ui.js'), 'utf8'), context);
    vm.runInContext(require('node:fs').readFileSync(require('node:path').join(__dirname, '../public/tower-preparation.js'), 'utf8'), context);
    vm.runInContext(clientSource + `
        myId = key;
        character = { heroKey:key, skills:state.players[key].skills };
        activeHeroSkillsPool = GAME_DATA.heroes[key].skills;
        window.lastReceivedState = state;
        syncBattleTurnSelection(state);
        renderBattleAbilitiesButtons();
    `, context);
    return { ui: context, sent, element: id => document.getElementById(id),
        run: code => vm.runInContext(code, context) };
}

test('события сокета переживают перерисовку карты, масштабируются вместе с ней и очищаются при откате', () => {
    const g = game(); g.player('ratchet');
    const { element, run } = playerUI(g.state);
    run(`socket.onmessage({data:JSON.stringify({state, combatEvents:[
        {id:1,kind:'damage',targetKind:'enemy',amount:12,x:4,y:2}]})})`);
    const layer = element('combat-text-layer');
    assert.equal(layer.children.length, 1);
    const original = layer.children[0];
    run('renderGridAndUI(state); autoFitMap = false; currentZoomScale = .75; applyMapZoom()');
    assert.equal(layer.children[0], original);
    assert.equal(layer.style.transform, element('p-grid').style.transform);
    assert.equal(layer.style.transform, 'scale(0.75)');
    run('socket.onmessage({data:JSON.stringify({state,combatEvents:[],combatReset:true})})');
    assert.equal(layer.children.length, 0);
});

test('выбор способности и цели на карте ничего не отправляет до подтверждения; повторный клик не дублирует действие', () => {
    const g = game(); g.player('ratchet', ['surgical_laser']); g.enemy(1, 5, 2);
    const { ui, sent, element, run } = playerUI(g.state);
    ui.setBattleAbility('spell_surgical_laser');
    assert.equal(element('attack-main-btn').disabled, true);
    ui.cellClick(5, 2);
    assert.equal(sent.length, 0);
    assert.equal(run('selectedBattleTarget'), '1');
    assert.equal(element('attack-main-btn').disabled, false);
    ui.attack(); ui.attack();
    assert.equal(sent.length, 1);
    assert.equal(sent[0].type, 'PLAYER_ACTION');
    assert.equal(sent[0].ability, 'spell_surgical_laser');
    assert.equal(sent[0].targetId, 1);
    assert.equal(element('attack-main-btn').disabled, true);
});

test('несколько целей на клетке требуют отдельного выбора, недоступная клетка не перемещает героя', () => {
    const g = game(); g.player('ratchet'); g.enemy(1, 5, 2); g.enemy(2, 5, 2);
    const { ui, sent, element, run } = playerUI(g.state);
    ui.setBattleAbility('attack');
    ui.cellClick(5, 2);
    assert.equal(element('attack-main-btn').disabled, true);
    assert.equal(element('target-choices').children.length, 2);
    element('target-choices').children[1].onclick();
    assert.equal(run('selectedBattleTarget'), '2');
    ui.cellClick(15, 15); ui.attack();
    assert.equal(sent.length, 0);
    assert.equal(element('attack-main-btn').disabled, true);
});

test('журнал открывает пассивные способности и лог, не выполняет действия на карте и сохраняет выбранную цель', () => {
    const g = game(); g.player('ratchet'); g.enemy(1, 5, 2);
    const { ui, sent, element, run } = playerUI(g.state);
    ui.setBattleAbility('attack');
    ui.cellClick(5, 2);
    ui.setMapMode('journal');
    assert.equal(element('journal-controls').hidden, false);
    assert.equal(element('action-controls').hidden, true);
    assert.equal(element('tower-roster-controls').hidden, true);
    assert.equal(element('attack-main-btn').hidden, true);
    assert.equal(element('map-mode-hint').hidden, true);
    assert.equal(element('mode-journal')['aria-pressed'], 'true');
    ui.cellClick(6, 2); ui.cellClick(4, 1); ui.attack();
    assert.equal(sent.length, 0);
    assert.equal(run('selectedBattleTarget'), '1');
    ui.setMapMode('action');
    assert.equal(element('journal-controls').hidden, true);
    assert.equal(element('action-controls').hidden, false);
    assert.equal(element('attack-main-btn').hidden, false);
    assert.equal(element('attack-main-btn').disabled, false);
    assert.equal(element('target-choices').children[0]['aria-pressed'], 'true');
});

test('погибшая или ушедшая из радиуса цель сбрасывается, смена способности требует нового выбора', () => {
    const g = game(); g.player('ratchet', ['surgical_laser']); const enemy = g.enemy(1, 5, 2);
    const { ui, sent, element, run } = playerUI(g.state);
    ui.setBattleAbility('attack');
    ui.cellClick(5, 2);
    enemy.x = 15;
    ui.attack();
    assert.equal(sent.length, 0);
    assert.equal(run('selectedBattleTarget'), '');
    enemy.x = 5; ui.cellClick(5, 2);
    ui.setBattleAbility('spell_surgical_laser');
    assert.equal(run('selectedBattleTarget'), '');
    ui.cellClick(5, 2); enemy.hp = 0;
    run('updateBattleTargets(state)');
    assert.equal(element('attack-main-btn').disabled, true);
});

test('при входе способность не выбрана; повторный клик снимает выбор, цель и всю подсветку', () => {
    const g = game(); g.player('ratchet', ['surgical_laser']); g.enemy(1, 5, 2);
    const { ui, sent, element, run } = playerUI(g.state);
    const cell = element('cell-5-2'); cell.dataset = { x: '5', y: '2' };
    element('p-grid').appendChild(cell);
    assert.equal(run('activeAbility'), '');
    assert.equal(run('activeRangePreview'), null);
    assert.equal(run('battleTargets.length'), 0);
    ui.cellClick(5, 2); ui.attack();
    assert.equal(run('targetCellFocus'), null);
    assert.equal(sent.length, 0);
    assert.equal(element('attack-main-btn').disabled, true);
    for (const ability of ['attack', 'spell_surgical_laser', 'ultimate']) {
        const button = element('ab-box').children.find(b => b.dataset.ability === ability);
        button.onclick();
        assert.equal(run('activeAbility'), ability);
        assert.equal(cell.classList.contains('range-skill'), true);
        assert.match(element('p-grid').querySelector('.range-contours').innerHTML, /<path /);
        ui.cellClick(5, 2);
        button.onclick();
        assert.equal(run('activeAbility'), '');
        assert.equal(run('activeRangePreview'), null);
        assert.equal(run('selectedBattleTarget'), '');
        assert.equal(run('battleTargets.length'), 0);
        assert.equal(cell.classList.contains('range-skill'), false);
        assert.equal(cell.classList.contains('available-target'), false);
        assert.equal(cell.classList.contains('selected-target'), false);
        assert.equal(element('p-grid').querySelector('.range-contours').innerHTML, '');
        assert.ok(element('ab-box').children.every(b => b['aria-pressed'] === 'false'));
        assert.equal(element('attack-main-btn').disabled, true);
        ui.attack();
    }
    assert.equal(sent.length, 0);
});

test('контур объединяет соседние клетки без линии на общей стороне и замыкается по внешним границам', () => {
    const g=game(); g.player('ratchet');
    const {run}=playerUI(g.state);
    const path=run("getRangeContourPath(new Set(['1,1','2,1']), 4, 4)");
    assert.equal((path.match(/M/g)||[]).length,6);
    assert.doesNotMatch(path,/M163 81V163|M163 163V81/);
    assert.match(path,/M81 81H163/); assert.match(path,/M163 81H245/);
    assert.match(path,/M245 81V163/); assert.match(path,/M81 163V81/);
});

test('контур обрезан краем карты, а круглая область сохраняет ступенчатую внешнюю границу', () => {
    const g=game(); g.player('ratchet');
    const {run}=playerUI(g.state);
    const edge=run("getRangeContourPath(new Set(['0,0','1,0']), 2, 1)");
    assert.doesNotMatch(edge,/-/);
    assert.match(edge,/M0 0H81/); assert.match(edge,/M162 0V80/);
    const circle=run("getRangeContourPath(new Set(['1,0','0,1','1,1','2,1','1,2']), 3, 3)");
    assert.equal((circle.match(/M/g)||[]).length,12);
    assert.doesNotMatch(circle,/M81 81H163|M163 81V163|M163 163H81|M81 163V81/);
});

test('просмотр башни показывает круговой контур, закрытие убирает его и возвращает область выбранной способности', () => {
    const g=game(); g.player('ratchet');
    const tower=g.state.grid[1][4]; tower.type='mage_1';
    const {ui,element,run,sent}=playerUI(g.state);
    for(const [x,y] of [[4,1],[4,2],[5,2],[15,15]]) {
        const cell=element('cell-'+x+'-'+y); cell.dataset={x:String(x),y:String(y)};
        element('p-grid').appendChild(cell);
    }
    const markup=()=>element('p-grid').querySelector('.range-contours').innerHTML;
    ui.openTowerModal(4,1,tower);
    assert.match(markup(),/tone-support tower-range/);
    ui.previewTowerRange(4,1);
    assert.equal(element('tower-modal-backdrop').style.display,'none');
    assert.equal(element('range-preview-bar').style.display,'flex');
    assert.equal(element('cell-4-1').classList.contains('tower-preview-origin'),true);
    ui.closeTowerRangePreview(); ui.closeTowerModal();
    assert.equal(markup(),'');
    ui.setBattleAbility('attack');
    ui.openTowerModal(4,1,tower); ui.closeTowerModal();
    assert.equal(run('activeRangePreview.type'),'skill');
    assert.match(markup(),/cast-range/);
    assert.doesNotMatch(markup(),/tower-range/);
    assert.equal(sent.length,0);
});

test('обычные обновления сохраняют выбор, новый раунд, волна и возврат хода героям сбрасывают его', () => {
    const g = game(); g.player('ratchet', ['surgical_laser']); g.enemy(1, 5, 2);
    const { ui, element, run } = playerUI(g.state);
    const refresh = () => run('syncBattleTurnSelection(state); updateHeroAbilityRangePreview(); updateBattleTargets(state)');
    ui.setBattleAbility('spell_surgical_laser'); ui.selectBattleTarget('1');
    g.state.gold += 10; refresh();
    run('renderBattleAbilitiesButtons()');
    assert.equal(run('activeAbility'), 'spell_surgical_laser');
    assert.equal(run('selectedBattleTarget'), '1');
    g.state.roundCounter = (g.state.roundCounter || 0) + 1; refresh();
    assert.equal(run('activeAbility'), '');
    assert.equal(run('selectedBattleTarget'), '');
    assert.equal(run('activeRangePreview'), null);
    assert.equal(element('attack-main-btn').disabled, true);
    for (const changeTurn of [
        () => { g.state.wave++; },
        () => { g.state.phase = 'wave'; refresh(); g.state.phase = 'player'; },
        () => { g.state.gamePeriod = 'preparation'; }
    ]) {
        ui.setBattleAbility('attack'); changeTurn(); refresh();
        assert.equal(run('activeAbility'), '');
        assert.equal(run('battleTargets.length'), 0);
    }
});

test('выбранную способность можно снять и после появления перезарядки, затем она недоступна до готовности', () => {
    const g = game(); const { hero } = g.player('ratchet', ['surgical_laser']);
    const { ui, element, run } = playerUI(g.state);
    ui.setBattleAbility('spell_surgical_laser');
    hero.cooldowns = { spell_surgical_laser: 2 };
    run('updateBattleTargets(state)');
    const button = element('ab-box').children.find(b => b.dataset.ability === 'spell_surgical_laser');
    assert.equal(button.disabled, false);
    button.onclick();
    assert.equal(run('activeAbility'), '');
    assert.equal(button.disabled, true);
});

test('двойной лазер различает атакуемых врагов и лечащие цели, включая общую клетку', () => {
    const g = game(); g.player('ratchet', ['surgical_laser', 'nanite_cloud']);
    const { hero: ally } = g.player('gerald'); ally.x = 5; ally.y = 2;
    g.enemy(1, 5, 2); g.enemy(2, 6, 2);
    const { ui, element } = playerUI(g.state);
    for (const [x,y] of [[4,2],[5,2],[6,2],[4,3],[15,15]]) {
        const cell = element('cell-' + x + '-' + y); cell.dataset = { x:String(x), y:String(y) };
        element('p-grid').appendChild(cell);
    }
    ui.setBattleAbility('spell_surgical_laser');
    assert.equal(element('cell-4-2').classList.contains('target-heal'), true);
    assert.equal(element('cell-4-2').classList.contains('target-attack'), false);
    assert.equal(element('cell-5-2').classList.contains('target-heal'), true);
    assert.equal(element('cell-5-2').classList.contains('target-attack'), true);
    assert.equal(element('cell-6-2').classList.contains('target-attack'), true);
    assert.equal(element('cell-6-2').classList.contains('target-heal'), false);
    assert.equal(element('cell-4-3').classList.contains('range-skill'), true);
    assert.equal(element('cell-4-3').classList.contains('available-target'), false);
    assert.equal(element('cell-15-15').classList.contains('range-skill'), false);
    ui.setBattleAbility('spell_nanite_cloud');
    assert.equal(element('cell-4-2').classList.contains('target-heal'), true);
    assert.equal(element('cell-5-2').classList.contains('range-heal'), true);
    assert.equal(element('cell-5-2').classList.contains('target-attack'), false);
});

test('подтверждение учитывает ману, перезарядку, смерть героя и использованное действие', () => {
    const g = game(); const { hero } = g.player('ratchet', ['surgical_laser']); g.enemy(1, 5, 2);
    const { ui, sent, element, run } = playerUI(g.state);
    ui.setBattleAbility('spell_surgical_laser'); ui.cellClick(5, 2);
    for (const [field, value] of [['mana', 0], ['cooldowns', {spell_surgical_laser:2}], ['hasAttackedThisRound', true], ['hp', 0]]) {
        const previous = hero[field]; hero[field] = value;
        run('updateBattleTargets(state)'); ui.attack();
        assert.equal(element('attack-main-btn').disabled, true);
        assert.equal(sent.length, 0);
        hero[field] = previous;
        ui.cellClick(5, 2);
    }
});

for (const [key, ability, skills] of [['torghar','spell_ground_tremor',['ground_tremor']], ['ratchet','spell_nanite_cloud',['nanite_cloud']], ['torghar','ultimate',[]]]) {
    test(`${ability} (${key}): шаг цели скрыт, применение возможно сразу после выбора и только по подтверждению`, () => {
        const g=game(); g.player(key,skills); g.enemy(1,5,2);
        const {ui,element,sent,run}=playerUI(g.state,key);
        ui.setBattleAbility(ability);
        assert.equal(element('target-step').hidden,true);
        assert.equal(element('attack-main-btn').disabled,false);
        assert.equal(run('selectedBattleTarget'),'');
        ui.cellClick(5,2);
        assert.equal(run('targetCellFocus'),null);
        assert.equal(sent.length,0);
        ui.attack(); ui.attack();
        assert.equal(sent.length,1);
        assert.equal(sent[0].type,'PLAYER_ACTION');
        assert.equal(sent[0].ability,ability);
        assert.equal(sent[0].targetId,-1);
    });
}

test('подсветка табличек различает юнитов на общей клетке, меняется с целью и остаётся только в локальном интерфейсе', () => {
    const g=game(); g.player('ratchet',['surgical_laser']); const {hero:ally}=g.player('gerald'); ally.x=5;
    g.enemy(1,5,2); g.enemy(2,5,2);
    const before=structuredClone(g.state);
    const {ui,element,sent,run}=playerUI(g.state);
    const cell=element('cell-5-2'); cell.dataset={x:'5',y:'2'}; element('p-grid').appendChild(cell);
    const tokens=[['enemy','1'],['enemy','2'],['player','gerald']].map(([kind,id])=>{
        const token=element('token-'+kind+'-'+id); token.className='p-token health-token';
        token.dataset={unitKind:kind,unitId:id}; cell.appendChild(token); return token;
    });
    ui.setBattleAbility('attack');
    assert.equal(element('target-step').hidden,false);
    assert.ok(tokens.every(t=>!t.classList.contains('effect-attack')));
    ui.selectBattleTarget('1');
    assert.equal(tokens[0].classList.contains('effect-attack'),true);
    assert.equal(tokens[1].classList.contains('effect-attack'),false);
    ui.selectBattleTarget('2');
    assert.equal(tokens[0].classList.contains('effect-attack'),false);
    assert.equal(tokens[1].classList.contains('effect-attack'),true);
    ui.setBattleAbility('spell_surgical_laser'); ui.selectBattleTarget('player_gerald');
    assert.equal(tokens[1].classList.contains('effect-attack'),false);
    assert.equal(tokens[2].classList.contains('effect-heal'),true);
    ui.clearBattleTarget();
    assert.equal(tokens[2].classList.contains('effect-heal'),false);
    ui.selectBattleTarget('1'); ui.setBattleAbility('spell_surgical_laser');
    assert.ok(tokens.every(t=>!t.classList.contains('effect-attack')&&!t.classList.contains('effect-heal')));
    assert.equal(run('activeAbility'),'');
    assert.equal(sent.length,0);
    assert.deepEqual(structuredClone(g.state),before);
});

test('мины выбирают клетку только в режиме действия; перемещение и точка сбора обрабатываются отдельно', () => {
    const g = game(); g.player('bolin', ['mines']);
    g.state.grid[1][4] = {x:4,y:1,type:'barracks_1'};
    const { ui, sent, element, run } = playerUI(g.state, 'bolin');
    ui.setBattleAbility('spell_mines'); ui.cellClick(5, 2);
    assert.equal(run('selectedBattleTarget'), 'cell_5_2');
    assert.equal(sent.length, 0);
    ui.setMapMode('move'); ui.cellClick(5, 2);
    assert.equal(sent[0].type, 'MOVE_HERO');
    run("isSelectingRally = true; rallyTowerCoords = {x:4,y:1};");
    ui.cellClick(5, 2);
    assert.equal(sent[1].type, 'SET_RALLY_POINT');
});

test('лечащие способности показывают только подходящих союзников, Laser также врагов, Reboot — павших героев', () => {
    const g = game(); g.player('ratchet', ['surgical_laser', 'nanite_cloud', 'ambulance_rush']);
    const { hero: ally } = g.player('gerald'); ally.x = 5; ally.hp = 0; ally.deathTimer = 2;
    g.enemy(1, 5, 2);
    const { run } = playerUI(g.state);
    const ids = ability => Array.from(run(`getAvailableBattleTargets(state, '${ability}').map(t => t.id)`));
    assert.deepEqual(ids('spell_nanite_cloud'), []);
    assert.deepEqual(ids('spell_ambulance_rush'), ['self_ratchet']);
    assert.deepEqual(ids('spell_surgical_laser'), ['self_ratchet', '1']);
    ally.x = 15;
    assert.deepEqual(ids('ultimate'), ['self_ratchet', 'player_gerald']);
});

test('подсветка дальности атак и заклинаний совпадает с серверной геометрией', () => {
    const g = game(); const { hero } = g.player('zefira', ['blades']);
    g.enemy(1, 7, 5); // 3 по Чебышёву, больше 4 по Евклиду
    const { run } = playerUI(g.state, 'zefira');
    assert.equal(run("getAvailableBattleTargets(state, 'attack').length"), 0);
    assert.equal(run("getAvailableBattleTargets(state, 'ultimate').length"), 1);
    assert.equal(run("getAbilityRangeInfo('spell_blades', state.players.zefira).range"), 1);
});

test('подготовка разрешает дальние повторные перемещения, включая павшего героя; игра возвращает ограничения', () => {
    const g = game({ gamePeriod: 'preparation' }); const { hero } = g.player('ratchet');
    Object.assign(hero, { hp: 0, deathTimer: 2, hasMovedThisRound: true });
    const { ui, sent, element, run } = playerUI(g.state);
    ui.setMapMode('move');
    assert.match(element('map-mode-hint').textContent, /Free movement/);
    assert.equal(run('canMoveHeroTo(state, state.players.ratchet, 15, 15)'), true);
    ui.cellClick(15, 15); ui.cellClick(0, 0);
    assert.equal(sent.length, 2); assert.equal(sent[0].type, 'MOVE_HERO');
    assert.equal(run('canMoveHeroTo(state, state.players.ratchet, 4, 2)'), false);
    g.state.gamePeriod = 'game';
    ui.cellClick(15, 15); assert.equal(sent.length, 2);
    Object.assign(hero, { hp: hero.maxHp, deathTimer: 0, hasMovedThisRound: false });
    ui.cellClick(15, 15); assert.equal(sent.length, 2);
    ui.cellClick(5, 2); assert.equal(sent.length, 3);
});

test('подсветка перемещения следует периоду, а башни и текущая клетка недоступны', () => {
    const g = game({ gamePeriod: 'preparation' }); const { hero } = g.player('ratchet');
    const { ui, element } = playerUI(g.state);
    const grid = element('p-grid');
    for (const [x, y] of [[15, 15], [5, 2], [4, 2], [4, 1]]) {
        const cell = element('cell-' + x + '-' + y); cell.dataset = { x: String(x), y: String(y) };
        grid.appendChild(cell);
    }
    g.state.grid[1][4].type = 'archer_1';
    hero.hasMovedThisRound = true;
    ui.setMapMode('move');
    assert.equal(element('cell-15-15').classList.contains('available-move'), true);
    assert.equal(element('cell-4-2').classList.contains('available-move'), false);
    assert.equal(element('cell-4-1').classList.contains('available-move'), false);
    g.state.gamePeriod = 'game'; hero.hasMovedThisRound = false;
    ui.setMapMode('move');
    assert.equal(element('cell-15-15').classList.contains('available-move'), false);
    assert.equal(element('cell-5-2').classList.contains('available-move'), true);
});

test('кнопка сноса показывает полный возврат затрат в подготовке и стандартный в игре', () => {
    const g = game({ gamePeriod: 'preparation' }); g.player('ratchet');
    const cell = g.state.grid[1][4]; Object.assign(cell, { type: 'archer_3', investedGold: 400 });
    const { element, run } = playerUI(g.state);
    run('updateTowerDemolishButton(state.grid[1][4], state)');
    assert.match(element('tm-btn-demolish').innerText, /100%: \+400/);
    g.state.gamePeriod = 'game';
    run('updateTowerDemolishButton(state.grid[1][4], state)');
    const expected = Math.round(data.towers.archer_3.cost * 0.6);
    assert.ok(element('tm-btn-demolish').innerText.includes('60%: +' + expected));
});

test('игрок выбирает общий набор в режиме башен, шестой тип и изменение в игре заблокированы', () => {
    const towers = { ...data.towers, ice: { name: 'Лёд', cost: 80 }, fire: { name: 'Огонь', cost: 90 } };
    const g = game({ gamePeriod: 'preparation', towers }); const { ws } = g.player('ratchet');
    const { ui, sent, element, run } = playerUI(g.state, 'ratchet', g.gameData);
    ui.setMapMode('build');
    const choices = () => menuNodes(element('tower-preparation-content')).filter(node => node.dataset.towerType);
    assert.equal(element('tower-preparation-menu').hidden, false);
    assert.equal(element('tower-roster-controls').hidden, true);
    assert.equal(choices().length, 6);
    assert.equal(element('tower-preparation-count').textContent, '5/5');
    assert.equal(choices().find(button => button.dataset.towerType === 'fire').disabled, true);
    choices().find(button => button.dataset.towerType === 'ice').onclick();
    assert.equal(sent[0].type, 'SET_TOWER_TYPE'); assert.equal(sent[0].enabled, false);
    g.send(ws, sent[0]); run('renderBattleControls(state)');
    assert.equal(element('tower-preparation-count').textContent, '4/5');
    assert.equal(choices().find(button => button.dataset.towerType === 'fire').disabled, false);
    g.state.gamePeriod = 'game'; ui.setMapMode('build');
    const roster = element('player-tower-roster');
    assert.equal(element('tower-preparation-menu').hidden, true);
    assert.equal(element('tower-roster-controls').hidden, false);
    assert.ok(roster.children.every(button => button.disabled));
    ui.setMapMode('move'); assert.equal(element('tower-roster-controls').hidden, true);
});

function menuNodes(root) {
    return [root, ...root.children.flatMap(menuNodes)];
}

function menuText(root) {
    return menuNodes(root).map(node => node.textContent).join(' ');
}

test('подготовка открывает меню башен, возврат оставляет строительство на поле и обновления не открывают меню повторно', () => {
    const g = game({ gamePeriod: 'preparation' }); g.player('ratchet');
    const { ui, sent, element, run } = playerUI(g.state);
    ui.setMapMode('build');
    assert.equal(element('tower-preparation-menu').hidden, false);
    element('tower-preparation-back').onclick();
    assert.equal(element('tower-preparation-menu').hidden, true);
    assert.equal(run('mapMode'), 'build');
    run('renderBattleControls(state)');
    assert.equal(element('tower-preparation-menu').hidden, true);
    ui.openBuildModal(4, 1);
    assert.ok(element('bm-cards-list').children.length > 0);
    ui.setMapMode('build');
    assert.equal(element('tower-preparation-menu').hidden, false);
    element('tower-preparation-menu').oncancel({ preventDefault() {} });
    assert.equal(element('tower-preparation-menu').hidden, true);
    assert.equal(sent.length, 0);
});

test('развитие показывает итоговые характеристики, специализации и стоимость навыков без изменения мира', () => {
    const g = game({ gamePeriod: 'preparation' }); g.player('ratchet');
    const { ui, sent, element, run } = playerUI(g.state);
    const before = JSON.stringify(g.state);
    const content = element('tower-preparation-content');
    const find = (key, value) => menuNodes(content).find(node => node.dataset[key] === value);
    ui.setMapMode('build');
    find('explore', 'mage_1').onclick();
    find('level', '1').onclick();
    const stats = menuNodes(content).find(node => node.className === 'tp-stats');
    assert.match(menuText(stats), /16–24/);
    assert.doesNotMatch(menuText(stats), /8–12|→|undefined/);
    find('level', '3').onclick();
    find('branch', '1').onclick();
    assert.match(menuText(content), /Polymorph/);
    assert.match(menuText(content), /Stone Golem/);
    const checkbox = find('ability', 'sorcerer_golem');
    checkbox.checked = true; checkbox.onchange();
    assert.match(menuText(element('tower-preparation-footer')), /1000 G/);
    run('renderBattleControls(state)');
    assert.equal(find('ability', 'sorcerer_golem').checked, true);
    assert.match(menuText(content), /Sorcerer Mage IV/);
    assert.equal(JSON.stringify(g.state), before);
    assert.equal(sent.length, 0);
    g.state.gamePeriod = 'game'; run('renderBattleControls(state)');
    assert.equal(element('tower-preparation-menu').hidden, true);
});

test('новое меню блокирует удаление построенной ветки и отправку выбора при потере соединения', () => {
    const g = game({ gamePeriod: 'preparation' }); g.player('ratchet'); g.tower('archer_ranger');
    const { ui, sent, element, run } = playerUI(g.state);
    ui.setMapMode('build');
    const find = type => menuNodes(element('tower-preparation-content')).find(node => node.dataset.towerType === type);
    assert.equal(find('archer_1').disabled, true);
    find('archer_1').onclick();
    run('socket.readyState = 3; renderBattleControls(state)');
    assert.equal(find('mage_1').disabled, true);
    find('mage_1').onclick();
    assert.equal(sent.length, 0);
});

test('меню постройки показывает только выбранные типы и автоматически подхватывает новый тип из данных', () => {
    const towers = { ...data.towers, fire: { name: 'Огненная башня', shortName: '🔥', cost: 90, range: 3 } };
    const g = game({ gamePeriod: 'preparation', towers }); g.player('ratchet');
    g.state.availableTowerTypes = ['fire'];
    const { ui, sent, element } = playerUI(g.state, 'ratchet', g.gameData);
    ui.openBuildModal(4, 1);
    const cards = element('bm-cards-list').children;
    assert.equal(cards.length, 1); assert.ok(cards[0].innerHTML.includes('Огненная башня'));
    cards[0].onclick(); assert.equal(sent[0].towerType, 'fire');
});
