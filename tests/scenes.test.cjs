const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const WebSocket = require('ws');
const { createSceneStore, validatePlayable, captureScene } = require('../scene-library');
const data = require('../public/gamedata');
const clone = value => JSON.parse(JSON.stringify(value));
function scene(id = 'bridge') {
    return {id,title:'Оборона моста',description:'СЕКРЕТ_ОПИСАНИЕ',objectives:'СЕКРЕТ_ЦЕЛЬ',gold:700,baseHp:35,gridWidth:8,gridHeight:8,
        grid:Array.from({length:8},(_,y) => Array.from({length:8},(_,x) => ({x,y,type:y === 2 ? x === 0 ? 'spawn' : x === 7 ? 'castle' : 'road' : 'empty'}))),
        enemies:[{type:'goblin',count:2,x:3,y:2}],waves:[{waveNum:81,title:'Reinforcement',desc:'СЕКРЕТ_ВОЛНА',enemies:[{type:'orc_warrior',count:3,offsetDelay:0}]}],
        notes:[{id:'trap',x:3,y:2,title:'Разрушенный мост',text:'Доски опасно скрипят.',secret:'СЕКРЕТ_ЛОВУШКА',skill:'Внимательность',dc:14,success:'СЕКРЕТ_УСПЕХ',failure:'СЕКРЕТ_ПРОВАЛ'}]};
}
test('готовые башни восстанавливают гарнизон и голема, герои не переносят временные боевые эффекты', () => {
    const { game } = require('./helpers/game-harness.cjs');
    const prepared = scene();
    prepared.grid[1][2]={x:2,y:1,type:'barracks_1'};
    prepared.grid[1][3]={x:3,y:1,type:'mage_sorcerer',upgrades:['sorcerer_golem']};
    const g = game({savedScenes:{version:1,revision:0,scenes:[prepared]}}), {hero} = g.player('connor',[]);
    Object.assign(hero,{armor:65,shieldWallRounds:2,shieldWallArmorBonus:25,blockLimitBeforeUltimate:2,blockLimit:9,
        hp:0,mana:0,invulnerableRounds:2,shieldHp:80,speedBonusRounds:2,speedBonus:4,blockedEnemyIds:[123]});
    g.send(g.master,{type:'MASTER_ACTIVATE_SCENE',sceneId:'bridge',revision:0});
    assert.equal(g.state.players.connor.armor,40); assert.equal(g.state.players.connor.blockLimit,2);
    assert.equal(g.state.players.connor.shieldHp,undefined); assert.equal(g.state.players.connor.speedBonus,undefined);
    assert.deepEqual(Array.from(g.state.players.connor.blockedEnemyIds),[]);
    assert.equal(g.state.players.connor.hp,hero.maxHp); assert.equal(g.state.gamePeriod,'preparation');
    assert.equal(g.state.soldiers.filter(soldier=>soldier.towerType==='barracks_1').length,data.towers.barracks_1.soldierCount || 3);
    assert.equal(g.state.soldiers.filter(soldier=>soldier.isGolem).length,1);
    assert.ok(g.state.grid[1][3].investedGold > data.towers.mage_sorcerer.cost);
});
function temporary(t) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(),'kr-scenes-'));
    t.after(() => { for (const name of fs.readdirSync(dir)) fs.unlinkSync(path.join(dir,name)); fs.rmdirSync(dir); });
    return dir;
}
test('библиотека сохраняет, копирует, удаляет и восстанавливает сцены; устаревшие записи и невалидные данные не меняют файл', t => {
    const file = path.join(temporary(t),'scenes.json'), store = createSceneStore(data,file);
    store.save(scene(),0); store.save(scene('copy'),1);
    assert.equal(store.read().scenes.length,2);
    const restored = createSceneStore(data,file); assert.equal(restored.get('bridge').notes[0].secret,'СЕКРЕТ_ЛОВУШКА');
    const before = fs.readFileSync(file,'utf8');
    assert.throws(() => restored.save(scene(),1),/another window/);
    for (const mutate of [s=>s.grid[0].pop(),s=>s.notes[0].x=8,s=>s.notes[0].dc=41,s=>s.notes.push(clone(s.notes[0])),
        s=>s.enemies[0].type='missing',s=>s.waves[0].enemies[0].type='missing',s=>s.gold=-1,s=>s.title=' ',s=>s.grid[0][0].type='missing']) {
        const invalid = scene(); mutate(invalid); assert.throws(() => restored.save(invalid,2));
        assert.equal(fs.readFileSync(file,'utf8'),before);
    }
    const read = restored.read(); read.scenes[0].title = 'Изменение копии'; assert.equal(restored.get('bridge').title,'Оборона моста');
    restored.delete('copy',2); assert.equal(createSceneStore(data,file).read().scenes.length,1);
});
test('ошибка записи оставляет библиотеку неизменной; незавершённый черновик можно сохранить, но нельзя запустить', t => {
    const store = createSceneStore(data,path.join(temporary(t),'missing','scenes.json'));
    assert.throws(() => store.save(scene(),0),/Could not save/); assert.equal(store.read().revision,0);
    const draft = scene(); draft.grid[2][4].type = 'empty';
    assert.throws(() => validatePlayable(draft,data),/road/);
    const good = scene(); good.enemies[0].y=0; assert.throws(() => validatePlayable(good,data),/Ground/);
    good.enemies=[]; good.grid[0][0].type='spawn'; assert.throws(() => validatePlayable(good,data),/road/);
    const saved = createSceneStore(data,path.join(temporary(t),'scenes.json')); saved.save(draft,0); assert.equal(saved.read().scenes.length,1);
});
test('снимок поля объединяет одинаковых врагов и не переносит боевые эффекты башен и раскрытие заметок', () => {
    const template = scene(), world = {...template,sceneMaster:{...template,notes:[{...template.notes[0],revealed:true}]}};
    world.enemies = Array.from({length:250},() => ({type:'goblin',x:3,y:2,hp:5}));
    world.grid[1][1] = {x:1,y:1,type:'archer_1',attackCooldown:99};
    const captured = captureScene(world,data,'captured');
    assert.deepEqual(captured.enemies.map(group => group.count),[200,50]);
    assert.equal(captured.notes[0].revealed,undefined); assert.equal(captured.grid[1][1].attackCooldown,undefined);
});
test('сцены изолированы от партии и игроков; открытие, заметки, волны и перезапуск работают через WebSocket', async t => {
    const dir = temporary(t), saveFile = path.join(dir,'save.json');
    let child, port; const connections = [];
    async function start() {
        child = spawn(process.execPath,['server.js'],{cwd:path.resolve(__dirname,'..'),windowsHide:true,
            env:{...process.env,PORT:'0',KR_SAVE_FILE:saveFile,KR_CATALOG_FILE:path.join(dir,'catalog.json'),KR_SCENES_FILE:path.join(dir,'scenes.json'),KR_LOG_FILE:path.join(dir,'game.log')}});
        port = await new Promise((resolve,reject) => {
            let output=''; const timer=setTimeout(() => reject(new Error('Start timeout: '+output)),6000);
            child.stdout.on('data',chunk => { output+=chunk; const match=output.match(/localhost:(\d+)\/master/); if(match){clearTimeout(timer);resolve(Number(match[1]));} });
            child.stderr.on('data',chunk=>{output+=chunk;}); child.once('error',reject);
        });
    }
    async function stop() { connections.forEach(client=>client.ws.terminate()); if(child?.exitCode===null) await new Promise(resolve=>{child.once('exit',resolve);child.kill();}); }
    t.after(stop); await start();
    async function connect() {
        const ws = new WebSocket('ws://127.0.0.1:'+port), messages=[];
        ws.on('message',raw=>messages.push(JSON.parse(raw)));
        await new Promise((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject);});
        const client={ws,messages};connections.push(client);return client;
    }
    function wait(client,predicate,from=0) { return new Promise((resolve,reject)=>{const until=Date.now()+5000;const poll=()=>{const message=client.messages.slice(from).find(predicate);if(message)return resolve(message);if(Date.now()>until)return reject(new Error('Message timeout'));setTimeout(poll,10);};poll();}); }
    async function send(client,message,type='STATE_UPDATE') { const from=client.messages.length;client.ws.send(JSON.stringify(message));return wait(client,value=>value.type===type,from); }
    const master=await connect(); await send(master,{type:'REGISTER_MASTER'});
    const player=await connect(); await send(player,{type:'REGISTER_PLAYER',name:'Тест',heroName:data.heroes.gerald.heroName,stats:{str:14,dex:14,con:14,int:14,wis:14,cha:17},skills:['fated','steel','vigor'],sen:10});
    const editor=await connect(), other=await connect();
    await send(editor,{type:'REGISTER_SCENE_EDITOR'},'SCENE_LIBRARY'); await send(other,{type:'REGISTER_SCENE_EDITOR'},'SCENE_LIBRARY');
    const worldBefore=await send(master,{type:'REGISTER_MASTER'}), playerBefore=player.messages.length;
    await send(editor,{type:'SCENE_SAVE',scene:scene(),revision:0},'SCENE_LIBRARY');
    assert.equal(player.messages.length,playerBefore,'сохранение черновика не отправляет обновления игрокам');
    const afterSave=await send(master,{type:'REGISTER_MASTER'}); assert.deepEqual(afterSave.state,worldBefore.state);
    assert.equal(editor.messages.some(message=>message.type==='STATE_UPDATE'),false,'редактор не получает живую партию');
    assert.equal(master.messages.findLast(message=>message.type==='SCENE_LIBRARY').scenes[0].notes,undefined,'пульт получает только краткий список библиотеки');
    await send(other,{type:'SCENE_SAVE',scene:scene('stale'),revision:0},'COMMAND_ERROR');
    await send(editor,{type:'MASTER_ACTIVATE_SCENE',sceneId:'bridge',revision:1},'COMMAND_ERROR');
    await send(player,{type:'SCENE_GET_LIBRARY'},'COMMAND_ERROR');
    await send(player,{type:'REGISTER_MASTER'},'COMMAND_ERROR');
    await send(player,{type:'MASTER_ACTIVATE_SCENE',sceneId:'bridge',revision:1},'COMMAND_ERROR');
    await send(master,{type:'MASTER_ACTIVATE_SCENE',sceneId:'bridge',revision:0},'COMMAND_ERROR');
    await send(master,{type:'MASTER_EDIT_HERO',playerName:'Тест',values:{hp:0,mana:0,deathTimer:2,isReady:true}});
    const pFrom=player.messages.length;
    const activated=await send(master,{type:'MASTER_ACTIVATE_SCENE',sceneId:'bridge',revision:1});
    assert.equal(activated.state.gold,700); assert.equal(activated.state.gridWidth,8); assert.equal(activated.state.enemies.length,2);
    assert.equal(activated.state.players['Тест'].hp,activated.state.players['Тест'].maxHp); assert.equal(activated.state.players['Тест'].x,0);
    assert.equal(activated.state.players['Тест'].y,2); assert.equal(activated.state.players['Тест'].isReady,false); assert.equal(activated.state.gamePeriod,'preparation');
    const visible=await wait(player,message=>message.type==='STATE_UPDATE',pFrom);
    assert.equal(visible.state.sceneMaster,undefined); assert.deepEqual(visible.state.revealedNotes,[]);
    assert.equal(JSON.stringify(player.messages).includes('СЕКРЕТ_'),false);
    await send(master,{type:'MASTER_REVEAL_NOTE',noteId:'trap',revealed:true,revision:0},'NOTE_SAVED');
    const revealed=await send(player,{type:'TOGGLE_READY'});
    assert.deepEqual(revealed.state.revealedNotes,[{id:'trap',x:3,y:2,title:'Разрушенный мост',text:'Доски опасно скрипят.'}]);
    await send(player,{type:'MASTER_REVEAL_NOTE',noteId:'trap',revealed:false,revision:1},'COMMAND_ERROR');
    await send(master,{type:'MASTER_SAVE_NOTE',revision:0,note:scene().notes[0]},'COMMAND_ERROR');
    await send(master,{type:'MASTER_SAVE_NOTE',revision:1,note:{...scene().notes[0],text:'Новый текст'}},'NOTE_SAVED');
    const changed=await send(player,{type:'TOGGLE_READY'}); assert.equal(changed.state.revealedNotes[0].text,'Новый текст');
    await send(master,{type:'MASTER_REVEAL_NOTE',noteId:'trap',revealed:false,revision:2},'NOTE_SAVED');
    const hidden=await send(player,{type:'TOGGLE_READY'}); assert.deepEqual(hidden.state.revealedNotes,[]);
    await send(master,{type:'MASTER_START_PRESET_WAVE',waveIndex:0});
    const wave=await send(master,{type:'REGISTER_MASTER'}); assert.equal(wave.state.wave,81); assert.equal(wave.state.enemies.filter(enemy=>enemy.type==='orc_warrior').length,1);
    assert.equal(wave.state.pendingSpawns.filter(enemy=>enemy.type==='orc_warrior').length,2);
    const capture=await send(editor,{type:'SCENE_CAPTURE'},'SCENE_CAPTURED'); assert.equal(capture.scene.waves[0].waveNum,81);
    assert.equal(capture.scene.notes[0].text,'Новый текст'); assert.equal(capture.scene.notes[0].revealed,undefined);
    const broken=scene('broken'); broken.grid[2][4].type='empty';
    await send(editor,{type:'SCENE_SAVE',scene:broken,revision:1},'SCENE_LIBRARY');
    await send(master,{type:'MASTER_ACTIVATE_SCENE',sceneId:'broken',revision:2},'COMMAND_ERROR');
    const still=await send(master,{type:'REGISTER_MASTER'}); assert.deepEqual(still.state,wave.state);
    assert.equal(JSON.stringify(player.messages).includes('СЕКРЕТ_'),false);
    for (const file of ['scene-editor.html','scene-editor.js','scene-editor.css','scene-notes.js','master-scenes.js']) assert.equal((await fetch('http://127.0.0.1:'+port+'/'+file)).status,200);
    // Дождаться сохранения конкретной активной сцены, а не фиксированной задержки.
    await new Promise((resolve,reject)=>{const until=Date.now()+3000;const poll=()=>{try{if(JSON.parse(fs.readFileSync(saveFile,'utf8')).sceneMaster?.notes[0]?.text==='Новый текст')return resolve();}catch{}if(Date.now()>until)return reject(new Error('Save timeout'));setTimeout(poll,20);};poll();});
    await stop(); await start();
    const restoredMaster=await connect(), restoredEditor=await connect();
    const restoredState=await send(restoredMaster,{type:'REGISTER_MASTER'});
    assert.equal(restoredState.state.sceneMaster.notes[0].secret,'СЕКРЕТ_ЛОВУШКА'); assert.equal(restoredState.state.players['Тест'].name,'Тест');
    const restoredLibrary=await send(restoredEditor,{type:'REGISTER_SCENE_EDITOR'},'SCENE_LIBRARY'); assert.equal(restoredLibrary.scenes.length,2);
    await send(restoredEditor,{type:'SCENE_DELETE',sceneId:'broken',revision:2},'SCENE_LIBRARY');
    const unchanged=await send(restoredMaster,{type:'REGISTER_MASTER'}); assert.equal(unchanged.state.sceneMaster.id,'bridge');
});
