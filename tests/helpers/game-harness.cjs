const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const { createRequire } = require('node:module');
const root = path.resolve(__dirname, '../..');
const projectRequire = createRequire(path.join(root, 'server.js'));
const data = require(path.join(root, 'public/gamedata.js'));
const source = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const clientSource = fs.readFileSync(path.join(root, 'public/player-logic.js'), 'utf8');

function game({ gamePeriod = 'game', savedState = null, savedScenes = null, towers = null, random = 0.99 } = {}) {
    const math = Object.create(Math);
    math.random = typeof random === 'function' ? random : () => random;
    const httpServer = new EventEmitter();
    httpServer.listen = () => {};
    let tick = Date.now();
    class TestDate extends Date { static now() { return ++tick; } }
    const errors = [];
    const saveFile = process.env.KR_SAVE_FILE || path.join(root, 'gamestate_save.json');
    const scenesFile = process.env.KR_SCENES_FILE || path.join(path.dirname(saveFile), 'scenes.json');
    const fakeFs = {
        existsSync: file => (savedState !== null && file === saveFile) || (savedScenes !== null && file === scenesFile),
        readFileSync: file => JSON.stringify(file === scenesFile ? savedScenes : savedState),
        writeFileSync() { throw new Error('Test tried to write save'); }
    };
    const worldData = structuredClone(data);
    if (towers) worldData.towers = structuredClone(towers);
    const context = vm.createContext({
        __dirname: root, process, Buffer, Math: math, Date: TestDate,
        setTimeout: () => 0, clearTimeout() {},
        console: { log() {}, error(...args) { errors.push(args.join(' ')); } },
        require(id) {
            if (id === './game-logger') return { createGameLogger: () => ({
                file: 'test.log', write() {}, captureConsole() {}, captureProcess() {}
            }) };
            if (id === './public/gamedata.js') return worldData;
            if (id === 'http') return { createServer: () => httpServer };
            if (id === 'fs') return fakeFs;
            if (id === './game-catalog' || id === './scene-library') {
                const module = { exports:{} };
                vm.runInNewContext(fs.readFileSync(path.join(root, id + '.js'), 'utf8'), {
                    module, Buffer, require: name => name === 'node:fs' ? fakeFs : projectRequire(name)
                });
                return module.exports;
            }
            return projectRequire(id);
        }
    });
    vm.runInContext(source + `\nglobalThis.api = {
        get state() { return gameState; }, castAbility, moveEnemies, wss, applyDeathOrSurvival, resolveEnemyDeath, removeDeadEnemies,
        fireTowers(castleX = 15, castleY = 2) {
            towerCombat.fireRound(castleX, castleY);
        }
    };`, context);
    const api = context.api;
    if (gamePeriod !== null) api.state.gamePeriod = gamePeriod;
    api.state.gold = 10000;
    for (let x = 0; x < 16; x++) api.state.grid[2][x].type = x === 0 ? 'spawn' : x === 15 ? 'castle' : 'road';
    const send = (ws, msg) => {
        const before = errors.length;
        ws.emit('message', JSON.stringify(msg));
        if (errors.length > before) throw new Error(errors.slice(before).join('\n'));
    };
    function connect() {
        const ws = new EventEmitter();
        ws.readyState = 1;
        ws.messages = [];
        ws.send = raw => ws.messages.push(JSON.parse(raw));
        api.wss.emit('connection', ws);
        return ws;
    }
    const master = connect(); send(master, { type: 'REGISTER_MASTER' });
    function player(key = 'gerald', skills = [], name = key) {
        const ws = connect();
        send(ws, { type: 'REGISTER_PLAYER', name, heroName: data.heroes[key].heroName,
            stats: { str:14, dex:14, con:14, int:14, wis:14, cha:17 }, skills, sen:10 });
        const hero = api.state.players[name];
        if (!hero) throw new Error('Could not register ' + key);
        hero.x = 4; hero.y = 2;
        return { hero, ws };
    }
    function enemy(id = 1, x = 4, y = 2, extra = {}) {
        const enemy = { ...data.enemies.bandit, id, type: 'bandit', x, y,
            hp:1000, maxHp:1000, speed:0, stunTurns:0, slowTurns:0, bleedTurns:0, ...extra };
        api.state.enemies.push(enemy);
        return enemy;
    }
    function tower(type, x = 4, y = 1) { send(master, { type:'MASTER_SET_TOWER', towerType:type, x, y }); }
    return { ...api, get state() { return api.state; }, gameData: worldData, send, connect, master, player, enemy, tower, errors };
}

function targetUI(state, key, ability, name = key) {
    const ui = vm.createContext({ window:{}, BATTLE_ABILITY_RULES: require('../../public/battle-ability-rules.js'),
        activeAbility:ability, character:{heroKey:key}, myId:name, state, battleTargets:[], selectedBattleTarget:'', targetCellFocus:null,
        renderBattleControls() {}, updateGridRangeOverlay() {} });
    const ranges = clientSource.slice(clientSource.indexOf('function getAbilityRangeInfo('), clientSource.indexOf('function updateHeroAbilityRangePreview('));
    const dropdown = clientSource.slice(clientSource.indexOf('function updateBattleTargets('), clientSource.indexOf('function getAbilityManaCost('));
    vm.runInContext(ranges + '\n' + dropdown + '\nupdateBattleTargets(state);', ui);
    return { ids: Array.from(ui.battleTargets, target => target.id) };
}
module.exports = { game, targetUI, clientSource, data };
