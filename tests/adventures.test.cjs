const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawn}=require('node:child_process');
const WebSocket=require('ws');
const {createSceneStore,adventureTransitions}=require('../scene-library');
const {fixture,plan,base,copy}=require('./helpers/scenario-fixture.cjs');
const {game}=require('./helpers/game-harness.cjs');
function temporary(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'kr-adventure-'));t.after(()=>{for(const file of fs.readdirSync(dir))fs.unlinkSync(path.join(dir,file));fs.rmdirSync(dir);});return dir;}
function talk(){return fixture({id:'talk',kind:'social',title:'Встреча со старостой',scenario:{goals:[],counters:[],events:[]},enemies:[]});}
test('планы используют общую атомарную версию библиотеки, проверяют ссылки и защищают сцены от удаления',t=>{
    const file=path.join(temporary(t),'scenes.json'),store=createSceneStore(base,file);store.save(fixture(),0);store.save(talk(),1);store.saveAdventure(plan(),2);
    const before=fs.readFileSync(file,'utf8');assert.throws(()=>store.delete('bridge',3),/used/);assert.throws(()=>store.saveAdventure(plan(),2),/another window/);
    for(const mutate of [p=>p.steps[0].sceneId='missing',p=>p.steps[1].branches[0].target='missing',p=>p.steps[0].minutes=-1,p=>p.steps[0].id=p.steps[1].id,p=>p.steps[1].branches[0].target='fight']){const candidate=plan();mutate(candidate);assert.throws(()=>store.saveAdventure(candidate,3));assert.equal(fs.readFileSync(file,'utf8'),before);}
    const restored=createSceneStore(base,file);assert.equal(restored.getAdventure('adventure').steps[2].kind,'backup');assert.equal(restored.get('bridge').cards[0].motivation,'SECRET_NPC');restored.deleteAdventure('adventure',3);restored.delete('bridge',4);assert.equal(restored.read().scenes.length,1);
});
test('последовательность пропускает запасную сцену; развилки выбираются по исходу, план не мутируется',()=>{
    const active={...plan(),currentStepId:'intro'};assert.equal(adventureTransitions(active,null)[0].target,'fight');active.currentStepId='fight';assert.deepEqual(adventureTransitions(active,null),[]);assert.equal(adventureTransitions(active,'success')[0].target,'ending');assert.equal(adventureTransitions(active,'failure')[0].target,'backup');
    active.steps[1].branches=[];assert.equal(adventureTransitions(active,null)[0].target,'ending');active.currentStepId='ending';assert.deepEqual(adventureTransitions(active,'success'),[]);
});
test('мастер проходит план, выбирает запасную встречу и завершает сессию; чужая роль не управляет сценарием',()=>{
    const g=game({savedScenes:{version:1,revision:0,scenes:[fixture(),talk()],adventures:[plan()]}}),player=g.player();
    const send=(type,fields={})=>g.send(g.master,{type,...fields});
    send('MASTER_START_ADVENTURE',{adventureId:'adventure',revision:0});assert.equal(g.state.sceneMaster.id,'talk');assert.equal(g.state.adventureMaster.currentStepId,'intro');assert.equal(g.state.players.gerald.hp,player.hero.maxHp);
    send('MASTER_ADVENTURE_NEXT',{revision:0});assert.equal(g.state.sceneMaster.id,'bridge');assert.equal(g.state.adventureMaster.currentStepId,'fight');
    send('MASTER_SCENE_OUTCOME',{outcome:'failure',revision:g.state.sceneMaster.runtime.revision});const before=JSON.stringify(g.state);
    g.master.emit('message',JSON.stringify({type:'MASTER_ADVENTURE_NEXT',stepId:'ending',revision:g.state.adventureMaster.revision}));assert.equal(JSON.stringify(g.state),before);
    send('MASTER_ADVENTURE_NEXT',{stepId:'backup',revision:g.state.adventureMaster.revision});assert.equal(g.state.adventureMaster.currentStepId,'backup');assert.equal(g.state.adventureMaster.results.fight,'failure');
    send('MASTER_ADVENTURE_GOTO',{stepId:'fight',revision:g.state.adventureMaster.revision});assert.equal(g.state.adventureMaster.results.fight,undefined);assert.equal(g.state.sceneMaster.runtime.outcome,null);
    send('MASTER_ADVENTURE_GOTO',{stepId:'ending',revision:g.state.adventureMaster.revision});send('MASTER_ADVENTURE_FINISH',{revision:g.state.adventureMaster.revision});assert.equal(g.state.adventureMaster.finished,true);
    const finished=JSON.stringify(g.state);g.master.emit('message',JSON.stringify({type:'MASTER_ADVENTURE_GOTO',stepId:'fight',revision:g.state.adventureMaster.revision}));assert.equal(JSON.stringify(g.state),finished);
    for(const type of ['MASTER_START_ADVENTURE','MASTER_SCENE_COUNTER','MASTER_SCENE_EVENT','MASTER_CARD_USED','MASTER_ADVENTURE_NEXT']){const length=player.ws.messages.length;g.send(player.ws,{type,revision:0});assert.equal(player.ws.messages[length].type,'COMMAND_ERROR');}
    assert.equal(JSON.stringify(player.ws.messages).includes('SECRET_'),false);
    send('MASTER_ACTIVATE_SCENE',{sceneId:'bridge',revision:0});assert.equal(g.state.adventureMaster,undefined);
});
test('сеть и перезапуск сохраняют сценарий и план; секреты карточек, условий, развилок не отправляются игрокам',async t=>{
    const dir=temporary(t),file=path.join(dir,'save.json');let processServer,port;const clients=[];
    async function stop(){for(const client of clients)client.ws.terminate();if(processServer?.exitCode === null)await new Promise(resolve=>{processServer.once('exit',resolve);processServer.kill();});}
    t.after(stop);
    async function start(){processServer=spawn(process.execPath,['server.js'],{cwd:path.resolve(__dirname,'..'),windowsHide:true,env:{...process.env,PORT:'0',KR_SAVE_FILE:file,KR_CATALOG_FILE:path.join(dir,'catalog.json'),KR_SCENES_FILE:path.join(dir,'scenes.json'),KR_LOG_FILE:path.join(dir,'game.log')}});port=await new Promise((resolve,reject)=>{let text='';const timer=setTimeout(()=>reject(new Error(text)),5000);processServer.stdout.on('data',chunk=>{text+=chunk;const match=text.match(/localhost:(\d+)\/master/);if(match){clearTimeout(timer);resolve(Number(match[1]));}});processServer.stderr.on('data',chunk=>{text+=chunk;});processServer.once('error',reject);});}
    async function connect(){const ws=new WebSocket('ws://127.0.0.1:'+port),messages=[];ws.on('message',raw=>messages.push(JSON.parse(raw)));await new Promise((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject);});const client={ws,messages};clients.push(client);return client;}
    function wait(client,predicate,from){return new Promise((resolve,reject)=>{const until=Date.now()+5000;const poll=()=>{const message=client.messages.slice(from).find(predicate);if(message)return resolve(message);if(Date.now()>until)return reject(new Error('Message timeout'));setTimeout(poll,10);};poll();});}
    async function send(client,message,type='STATE_UPDATE'){const from=client.messages.length;client.ws.send(JSON.stringify(message));return wait(client,response=>response.type === type,from);}
    await start();const master=await connect(),editor=await connect(),player=await connect();await send(master,{type:'REGISTER_MASTER'});await send(editor,{type:'REGISTER_SCENE_EDITOR'},'SCENE_LIBRARY');
    await send(player,{type:'REGISTER_PLAYER',name:'Тест',heroName:base.heroes.gerald.heroName,stats:{str:14,dex:14,con:14,int:14,wis:14,cha:17},skills:[],sen:10});
    const bridge=fixture();bridge.scenario.events=[{id:'reinforce',title:'SECRET_EVENT_TITLE',notes:'SECRET_EVENT_NOTES',condition:{kind:'counter',counterId:'saved',operator:'gte',value:1},confirm:true,actions:[{kind:'spawn',enemyType:'goblin',count:2,x:0,y:2},{kind:'note',noteId:'gate-note',revealed:true}]}];
    await send(editor,{type:'SCENE_SAVE',scene:bridge,revision:0},'SCENE_LIBRARY');await send(editor,{type:'SCENE_SAVE',scene:talk(),revision:1},'SCENE_LIBRARY');await send(editor,{type:'ADVENTURE_SAVE',adventure:plan(),revision:2},'SCENE_LIBRARY');
    await send(master,{type:'MASTER_START_ADVENTURE',adventureId:'adventure',revision:3});let state=(await send(master,{type:'MASTER_ADVENTURE_NEXT',revision:0})).state;
    await send(master,{type:'MASTER_SET_GAME_PERIOD',gamePeriod:'game'});state=(await send(master,{type:'MASTER_SCENE_COUNTER',counterId:'saved',value:1,revision:state.sceneMaster.runtime.revision})).state;
    assert.equal(state.sceneMaster.runtime.events.reinforce.status,'pending');state=(await send(master,{type:'MASTER_SCENE_EVENT',eventId:'reinforce',action:'apply',revision:state.sceneMaster.runtime.revision})).state;assert.equal(state.enemies.length,2);
    state=(await send(master,{type:'MASTER_CARD_USED',cardId:'elder',used:true,revision:state.sceneMaster.runtime.revision})).state;
    const publicState=(await send(player,{type:'TOGGLE_READY'})).state;assert.equal(publicState.sceneProgress.counters.length,1);assert.equal(publicState.sceneProgress.counters[0].value,1);assert.equal(publicState.revealedNotes[0].title,'Проход открыт');assert.equal(publicState.sceneMaster,undefined);assert.equal(publicState.adventureMaster,undefined);assert.equal(JSON.stringify(player.messages).includes('SECRET_'),false);
    const changed=copy(plan());changed.description='SECRET_CHANGED_PLAN';await send(editor,{type:'ADVENTURE_SAVE',adventure:changed,revision:3},'SCENE_LIBRARY');state=(await send(master,{type:'REGISTER_MASTER'})).state;assert.equal(state.adventureMaster.description,'SECRET_PLAN');
    const endpoint='http://127.0.0.1:'+port;for(const file of ['adventure-editor.html','adventure-editor.js','scenario-rules.js','planning-ui.js','scene-planning-editor.js','master-planning.js'])assert.equal((await fetch(endpoint+'/'+file)).status,200);
    await new Promise((resolve,reject)=>{const until=Date.now()+4000;const poll=()=>{try{const saved=JSON.parse(fs.readFileSync(file,'utf8'));if(saved.sceneMaster?.runtime?.events.reinforce.status === 'done' && saved.sceneMaster.runtime.usedCards.includes('elder'))return resolve();}catch{}if(Date.now()>until)return reject(new Error('Save timeout'));setTimeout(poll,20);};poll();});
    await stop();await start();const restored=await connect();state=(await send(restored,{type:'REGISTER_MASTER'})).state;assert.equal(state.sceneMaster.runtime.events.reinforce.status,'done');assert.equal(state.enemies.length,2);assert.equal(state.adventureMaster.currentStepId,'fight');assert.ok(state.sceneMaster.runtime.usedCards.includes('elder'));assert.equal(state.adventureMaster.description,'SECRET_PLAN');
});
