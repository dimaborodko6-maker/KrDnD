const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const WebSocket = require('ws');
const { createCatalogStore } = require('../game-catalog');
const base = require('../public/gamedata');
const clone = v => JSON.parse(JSON.stringify(v));
function temporary(t) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(),'kr-catalog-'));
    t.after(() => { for (const file of ['catalog.json','catalog.json.tmp','gamecatalog.json','save.json','game.log']) { const p = path.join(dir,file); if (fs.existsSync(p)) fs.unlinkSync(p); } fs.rmdirSync(dir); });
    return dir;
}
test('каталог сохраняется атомарно, восстанавливается и защищён от устаревшей записи', t => {
    const dir = temporary(t), file = path.join(dir,'catalog.json'), data = clone(base);
    const store = createCatalogStore(data,file);
    const draft = store.read(); draft.catalog.enemies.goblin.hp = 73;
    draft.catalog.presetWaves[0].enemies[0].count = 9;
    store.save(draft.catalog,draft.revision);
    assert.equal(data.enemies.goblin.hp,73);
    const restored = createCatalogStore(clone(base),file).read();
    assert.equal(restored.revision,1); assert.equal(restored.catalog.enemies.goblin.maxHp,73);
    assert.equal(restored.catalog.presetWaves[0].enemies[0].count,9);
    const saved = fs.readFileSync(file,'utf8');
    assert.throws(() => store.save(draft.catalog,0),/another window/);
    assert.equal(fs.readFileSync(file,'utf8'),saved);
});
test('некорректные параметры, удаление встроенного моба и неизвестный тип в волне отклоняются', t => {
    const dir = temporary(t), store = createCatalogStore(clone(base),path.join(dir,'catalog.json'));
    for (const mutate of [c=>c.enemies.goblin.hp=-1,c=>c.enemies.goblin.armor=null,c=>delete c.enemies.goblin,
        c=>c.presetWaves[0].enemies[0].type='missing',c=>c.presetWaves[0].enemies[0].count=201,
        c=>c.presetWaves[0].enemies[0].offsetDelay=-1,c=>c.presetWaves[1].waveNum=1,c=>c.enemies.goblin.color='javascript:1']) {
        const draft = store.read().catalog; mutate(draft); assert.throws(()=>store.save(draft,0));
        assert.equal(store.read().revision,0);
    }
    assert.equal(fs.existsSync(path.join(dir,'catalog.json')),false);
});
test('ошибка записи не меняет каталог в памяти', t => {
    const dir = temporary(t), data = clone(base), store = createCatalogStore(data,path.join(dir,'missing','catalog.json'));
    const draft = store.read().catalog; draft.enemies.goblin.hp=100;
    assert.throws(()=>store.save(draft,0),/Could not save/);
    assert.equal(store.read().revision,0); assert.equal(data.enemies.goblin.hp,base.enemies.goblin.hp);
});

test('редактор синхронизирует клиентов, не перехватывает мастера и новые волны используют сохранённые данные', async t => {
    const dir = temporary(t);
    const processServer = spawn(process.execPath,['server.js'],{cwd:path.resolve(__dirname,'..'),windowsHide:true,
        env:{...process.env,PORT:'0',KR_SAVE_FILE:path.join(dir,'save.json'),KR_CATALOG_FILE:path.join(dir,'gamecatalog.json'),KR_LOG_FILE:path.join(dir,'game.log')}});
    t.after(async()=>{ if(processServer.exitCode===null) await new Promise(resolve=>{processServer.once('exit',resolve);processServer.kill();}); });
    const port = await new Promise((resolve,reject)=>{ let log=''; const timer=setTimeout(()=>reject(new Error('Server did not start: '+log)),5000);
        processServer.stdout.on('data',s=>{log+=s;const m=log.match(/localhost:(\d+)\/master/);if(m){clearTimeout(timer);resolve(Number(m[1]));}}); processServer.once('error',reject); });
    const connections=[];
    t.after(()=>connections.forEach(c=>c.ws.terminate()));
    async function connect() {
        const ws = new WebSocket('ws://127.0.0.1:'+port), messages=[];
        ws.on('message',raw=>messages.push(JSON.parse(raw))); await new Promise((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject);});
        const client={ws,messages};connections.push(client);return client;
    }
    function wait(client,predicate,start=0) { return new Promise((resolve,reject)=>{const until=Date.now()+5000;const poll=()=>{const value=client.messages.slice(start).find(predicate);if(value)return resolve(value);if(Date.now()>until)return reject(new Error('Message timeout'));setTimeout(poll,10);};poll();}); }
    async function send(client,value,type) { const start=client.messages.length;client.ws.send(JSON.stringify(value));return wait(client,m=>m.type===type,start); }
    const master=await connect(),editor=await connect(),other=await connect(),player=await connect();
    await send(master,{type:'REGISTER_MASTER'},'STATE_UPDATE');
    await send(master,{type:'MASTER_SET_GAME_PERIOD',gamePeriod:'game'},'STATE_UPDATE');
    const initial=await send(editor,{type:'REGISTER_EDITOR'},'CATALOG_STATE');
    await send(other,{type:'REGISTER_EDITOR'},'CATALOG_STATE');
    await send(player,{type:'REGISTER_PLAYER',name:'Observer',heroName:'Gerald Lightbringer',sen:10,
        stats:{str:15,dex:15,con:15,int:15,wis:15,cha:12},skills:['fated','steel','vigor']},'STATE_UPDATE');
    await send(editor,{type:'MASTER_ADD_GOLD',amount:100},'COMMAND_ERROR');
    const draft=initial.catalog;
    draft.enemies.custom_1={...draft.enemies.goblin,name:'Тестовый <моб>',hp:77,meleeDmg:17};
    draft.presetWaves.push({waveNum:99,title:'Тестовая волна',desc:'',enemies:[{type:'custom_1',count:2,offsetDelay:0},{type:'custom_1',count:1,offsetDelay:2}]});
    const masterStart=master.messages.length,playerStart=player.messages.length,otherStart=other.messages.length;
    const saved=await send(editor,{type:'EDITOR_SAVE_CATALOG',revision:initial.revision,catalog:draft},'CATALOG_STATE');
    assert.equal(saved.reason,'saved');assert.equal(saved.revision,1);
    await wait(master,m=>m.type==='CATALOG_UPDATE'&&m.revision===1,masterStart);
    await wait(player,m=>m.type==='CATALOG_UPDATE'&&m.revision===1,playerStart);
    await wait(other,m=>m.type==='CATALOG_STATE'&&m.revision===1,otherStart);
    await send(other,{type:'EDITOR_SAVE_CATALOG',revision:0,catalog:draft},'COMMAND_ERROR');
    const js = await (await fetch(`http://127.0.0.1:${port}/gamedata.js`)).text();
    assert.ok(js.includes('custom_1'));assert.ok(!js.includes('<моб>'));
    const wave = await send(master,{type:'MASTER_START_PRESET_WAVE',waveIndex:draft.presetWaves.length-1},'STATE_UPDATE');
    assert.equal(wave.state.enemies.length,1);assert.equal(wave.state.enemies[0].hp,77);assert.equal(wave.state.enemies[0].meleeDmg,17);
    assert.equal(wave.state.pendingSpawns.length,2);
    const spawned = await send(master,{type:'MASTER_SPAWN_ENEMY',enemyType:'custom_1',count:1,x:1,y:1},'STATE_UPDATE');
    assert.equal(spawned.state.enemies.at(-1).hp,77);
    saved.catalog.enemies.custom_1.hp=99;
    await send(editor,{type:'EDITOR_SAVE_CATALOG',revision:1,catalog:saved.catalog},'CATALOG_STATE');
    const unchanged = await send(master,{type:'REGISTER_MASTER'},'STATE_UPDATE');
    assert.equal(unchanged.state.enemies[0].hp,77);
    const firstRound = await send(master,{type:'MASTER_MOVE_ENEMIES'},'STATE_UPDATE');
    assert.equal(firstRound.state.pendingSpawns.length,1);
    const secondRound = await send(master,{type:'MASTER_MOVE_ENEMIES'},'STATE_UPDATE');
    assert.equal(secondRound.state.pendingSpawns.length,0);
    assert.equal(secondRound.state.enemies.at(-1).hp,99);
    assert.equal((await send(master,{type:'MASTER_ADD_GOLD',amount:1},'STATE_UPDATE')).state.gold,301);
    await send(player,{type:'EDITOR_SAVE_CATALOG',revision:1,catalog:draft},'COMMAND_ERROR');
    for (const asset of ['catalog-editor.html','catalog-editor.css','catalog-editor.js']) assert.equal((await fetch(`http://127.0.0.1:${port}/${asset}`)).status,200);
});
