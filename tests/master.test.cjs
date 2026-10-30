const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const WebSocket = require('ws');
let server, port, master, player, tempDir;
const sockets = [];
function connect() {
    return new Promise((resolve, reject) => {
        const ws = new WebSocket('ws://127.0.0.1:' + port);
        const messages = [];
        ws.on('message', raw => messages.push(JSON.parse(raw)));
        ws.once('error', reject); ws.once('open', () => resolve({ ws, messages }));
        sockets.push(ws);
    });
}
function waitFor(client, predicate, from = 0) {
    return new Promise((resolve, reject) => {
        const deadline = Date.now() + 5000;
        const check = () => {
            const result = client.messages.slice(from).find(predicate);
            if (result) return resolve(result);
            if (Date.now() > deadline) return reject(new Error('Timeout waiting for message'));
            setTimeout(check, 10);
        }; check();
    });
}
async function send(client, msg, predicate = m => m.type === 'STATE_UPDATE') {
    const from = client.messages.length;
    client.ws.send(JSON.stringify(msg));
    return waitFor(client, predicate, from);
}
const stateMatching = predicate => m => m.type === 'STATE_UPDATE' && predicate(m.state);
before(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kr-master-'));
    server = spawn(process.execPath, ['server.js'], { cwd: path.resolve(__dirname, '..'),
        env: { ...process.env, PORT: '0', KR_SAVE_FILE: path.join(tempDir, 'save.json'), KR_LOG_FILE: path.join(tempDir, 'game.log') }, windowsHide: true });
    port = await new Promise((resolve, reject) => {
        let output = ''; const timeout = setTimeout(() => reject(new Error('Server start timeout: ' + output)), 6000);
        server.stdout.on('data', chunk => { output += chunk; const match = output.match(/localhost:(\d+)\/master/); if (match) { clearTimeout(timeout); resolve(Number(match[1])); } });
        server.once('error', reject);
    });
    master = await connect();
    await send(master, { type: 'REGISTER_MASTER' });
    await send(master, { type: 'MASTER_SET_GAME_PERIOD', gamePeriod: 'game' });
    player = await connect();
    await send(player, { type: 'REGISTER_PLAYER', name: 'Тест', heroName: 'Gerald Lightbringer', sen: 10,
        stats: { str:15, dex:12, con:14, int:10, wis:10, cha:12 }, skills:['fated','steel','vigor'] });
});
after(async () => {
    sockets.forEach(ws => ws.terminate());
    if (server && server.exitCode === null) await new Promise(resolve => { server.once('exit', resolve); server.kill(); });
    // Удаляем только явно созданные тестовые файлы; рекурсивного удаления нет.
    const save = path.join(tempDir, 'save.json'); if (fs.existsSync(save)) fs.unlinkSync(save);
    const log = path.join(tempDir, 'game.log'); if (fs.existsSync(log)) fs.unlinkSync(log);
    fs.rmdirSync(tempDir);
});
test('экран и ресурсы доступны', async () => {
    for (const file of ['master.html','master.css','master-layout.css','master-ui.js','master-map.js']) {
        const response = await fetch(`http://127.0.0.1:${port}/${file}`); assert.equal(response.status, 200);
    }
});
test('спавн группы, выдача золота и атомарное редактирование', async () => {
    let result = await send(master, { type:'MASTER_SPAWN_ENEMY', enemyType:'goblin', x:0, y:0, count:3 });
    assert.equal(result.state.enemies.length, 3);
    await send(master, { type:'MASTER_SPAWN_ENEMY', enemyType:'goblin', x:-1, y:0, count:1 }, m => m.type === 'COMMAND_ERROR');
    result = await send(master, { type:'MASTER_ADD_GOLD', amount:100 }); assert.equal(result.state.gold, 400);
    const values = { hp:35, maxHp:60, mana:25, maxMana:50, armor:25, speed:4, range:3, blockLimit:3,
        stats:{str:18,con:20,int:16}, hasMovedThisRound:true, hasAttackedThisRound:true, isReady:true };
    result = await send(master, { type:'MASTER_EDIT_HERO', playerName:'Тест', values });
    assert.equal(result.state.players['Тест'].hp, 35); assert.equal(result.state.players['Тест'].stats.con, 20);
    await send(master, { type:'MASTER_EDIT_HERO', playerName:'Тест', values:{hp:99999,armor:50} }, m => m.type === 'COMMAND_ERROR');
    result = await send(master, { type:'REGISTER_MASTER' }); assert.equal(result.state.players['Тест'].armor, 25);
    // Игроку недоступны команды мастера.
    player.ws.send(JSON.stringify({ type:'MASTER_ADD_GOLD', amount:1000 }));
    result = await send(player, { type:'TOGGLE_READY' }); assert.equal(result.state.gold, 400);
});
test('мастер переносит героя вне радиуса хода, сохраняя его параметры и флаги действий', async () => {
    const initial = await send(master, { type:'REGISTER_MASTER' });
    const hero = initial.state.players['Тест'];
    assert.equal(hero.hasMovedThisRound, true);
    const result = await send(master, { type:'MOVE_HERO', playerName:'Тест', x:0, y:0 });
    assert.deepEqual(result.state.players['Тест'], { ...hero, x:0, y:0 });
    assert.equal(result.state.playerHistory.length,0);
    assert.deepEqual(result.state.enemies,initial.state.enemies);
    await send(master, { type:'MOVE_HERO', playerName:'Тест', x:hero.x, y:hero.y });
});
test('откат восстанавливает мир и отменяет все последующие действия', async () => {
    await send(master, { type:'MASTER_EDIT_HERO', playerName:'Тест', values:{hasMovedThisRound:false,hasAttackedThisRound:false,isReady:false} });
    let from = master.messages.length;
    await send(player, { type:'MOVE_HERO', x:14, y:15 });
    let result = await waitFor(master, stateMatching(s => s.playerHistory?.length === 1), from);
    const id = result.state.playerHistory[0].id;
    assert.equal(result.state.players['Тест'].x, 14);
    await send(master, { type:'REGISTER_MASTER' });
    from = master.messages.length;
    await send(player, { type:'TOGGLE_READY' });
    result = await waitFor(master, stateMatching(s => s.playerHistory?.length === 2), from);
    assert.equal(result.state.players['Тест'].isReady, true);
    result = await send(master, { type:'MASTER_ROLLBACK_PLAYER', historyId:id });
    assert.equal(result.state.players['Тест'].x, 15);
    assert.equal(result.state.players['Тест'].hasMovedThisRound, false);
    assert.equal(result.state.players['Тест'].isReady, false);
    assert.equal(result.state.playerHistory.length, 0);
    await send(master, { type:'MASTER_ROLLBACK_PLAYER', historyId:id }, m => m.type === 'COMMAND_ERROR');
});
test('откат строительства восстанавливает золото, башню и солдат', async () => {
    await send(master, { type:'MASTER_EDIT_CELL', x:2,y:2,cellType:'slot' });
    const from = master.messages.length;
    await send(player, { type:'BUILD_TOWER', x:2,y:2,towerType:'barracks_1' });
    const built = await waitFor(master, stateMatching(s => s.playerHistory?.length === 1), from);
    assert.equal(built.state.grid[2][2].type, 'barracks_1'); assert.ok(built.state.soldiers.length);
    const result = await send(master, { type:'MASTER_ROLLBACK_PLAYER', historyId:built.state.playerHistory[0].id });
    assert.equal(result.state.grid[2][2].type, 'slot'); assert.equal(result.state.gold, 400); assert.equal(result.state.soldiers.length,0);
});
test('изменение мира мастером инвалидирует снимки; повторная регистрация сохраняет их', async () => {
    const from = master.messages.length;
    await send(player, { type:'MOVE_HERO', x:14,y:15 });
    await waitFor(master, stateMatching(s => s.playerHistory?.length === 1), from);
    let result = await send(master, { type:'REGISTER_MASTER' }); assert.equal(result.state.playerHistory.length,1);
    await send(master, { type:'MASTER_ADD_GOLD', amount:50 });
    result = await send(master, { type:'REGISTER_MASTER' }); assert.equal(result.state.playerHistory.length,0);
    const playerState = await send(player,{type:'TOGGLE_READY'});
    assert.equal(playerState.state.playerHistory, undefined);
});
test('невалидное сообщение не завершает сервер', async () => {
    const from = master.messages.length; master.ws.send('{broken');
    await waitFor(master, m => m.type === 'COMMAND_ERROR', from);
    const result = await send(master, { type:'REGISTER_MASTER' }); assert.ok(result.state);
});
test('откат заклинания восстанавливает ману, перезарядку, здоровье и эффекты цели', async () => {
    const caster = await connect();
    await send(caster, { type:'REGISTER_PLAYER', name:'Кастер', heroName:'Zefira (Mage Archer)', sen:16,
        stats:{str:10,dex:10,con:10,int:10,wis:10,cha:10}, skills:['hammer','blades','blink'] });
    const setup = await send(master, { type:'MASTER_SPAWN_ENEMY',enemyType:'orc_warrior',x:14,y:15 });
    const target = setup.state.enemies.at(-1);
    const before = setup.state.players['Кастер'];
    const from = master.messages.length;
    await send(caster, { type:'PLAYER_ACTION',ability:'spell_hammer',targetId:String(target.id),dice:3 });
    const cast = await waitFor(master, stateMatching(s => s.playerHistory?.length === 1), from);
    assert.ok(cast.state.players['Кастер'].mana < before.mana);
    assert.equal(cast.state.players['Кастер'].hasAttackedThisRound, true);
    const result = await send(master,{type:'MASTER_ROLLBACK_PLAYER',historyId:cast.state.playerHistory[0].id});
    assert.deepEqual(result.state.players['Кастер'],before);
    assert.deepEqual(result.state.enemies.find(e => e.id === target.id),target);
});
test('история не пересекает границу раунда', async () => {
    const from = master.messages.length;
    await send(player,{type:'TOGGLE_READY'});
    await waitFor(master,stateMatching(s=>s.playerHistory?.length > 0),from);
    const result = await send(master,{type:'MASTER_MOVE_ENEMIES'});
    assert.equal(result.state.playerHistory.length,0);
    assert.equal(result.state.phase,'player');
});
