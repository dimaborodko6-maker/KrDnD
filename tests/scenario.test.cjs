const {test}=require('node:test');
const assert=require('node:assert/strict');
const {game}=require('./helpers/game-harness.cjs');
const {fixture,base,copy}=require('./helpers/scenario-fixture.cjs');
const {validateScene,validatePlayable,captureScene}=require('../scene-library');
function setup(scene=fixture()) {
    const g=game({savedScenes:{version:1,revision:0,scenes:[scene]}});
    g.send(g.master,{type:'MASTER_ACTIVATE_SCENE',sceneId:scene.id,revision:0});
    const command=(type,values={})=>g.send(g.master,{type,...values,revision:g.state.sceneMaster.runtime.revision});
    const reject=(type,values={})=>{const before=JSON.stringify(g.state),from=g.master.messages.length;g.master.emit('message',JSON.stringify({type,revision:g.state.sceneMaster.runtime.revision,...values}));assert.ok(g.master.messages.slice(from).some(message=>message.type === 'COMMAND_ERROR'));assert.equal(JSON.stringify(g.state),before);};
    return {g,command,reject,runtime:()=>g.state.sceneMaster.runtime,play:()=>g.send(g.master,{type:'MASTER_SET_GAME_PERIOD',gamePeriod:'game'}),round:()=>g.send(g.master,{type:'MASTER_MOVE_ENEMIES'})};
}
test('старые шаблоны получают пустой сценарий; разговор и исследование можно открыть без дороги',()=>{
    const old=fixture();delete old.scenario;delete old.cards;delete old.kind;const checked=validateScene(old,base);assert.deepEqual(checked.scenario.goals,[]);assert.equal(checked.kind,'combat');
    for(const kind of ['social','exploration']){const scene=fixture({kind});scene.grid=scene.grid.map(row=>row.map(cell=>({...cell,type:'empty'})));assert.equal(validatePlayable(scene,base).kind,kind);const {g}=setup(scene);g.player();assert.equal(g.state.gamePeriod,'preparation');assert.equal(g.state.players.gerald.x,4);}
});
test('проверяются ссылки сценария, числа, циклы целей, фазы и лимиты без изменения исходных данных',()=>{
    for(const mutate of [s=>s.scenario.counters[0].initial=-1,s=>s.scenario.goals[1].success.counterId='missing',s=>s.scenario.events.push({id:'e',title:'e',condition:{kind:'round',value:0},actions:[{kind:'message',text:'ok'}]}),
        s=>s.scenario.events.push({id:'e',title:'e',condition:{kind:'manual'},actions:[{kind:'wave',waveNum:111}]}),s=>s.scenario.events.push({id:'e',title:'e',condition:{kind:'manual'},actions:[{kind:'spawn',enemyType:'missing',count:1,x:0,y:2}]}),
        s=>s.scenario.goals[0].success={kind:'goal',goalId:'hold',status:'completed'},s=>s.cards[2].phases[1].threshold=100,s=>s.scenario.events.push({id:'e',title:'e',confirm:'yes',actions:[{kind:'message',text:'ok'}]})]){const scene=fixture();mutate(scene);const before=copy(scene);assert.throws(()=>validateScene(scene,base));assert.deepEqual(scene,before);}
});
test('цель по раундам не выполняется в подготовке; счётчики и исход определяются на сервере',()=>{
    const scene=fixture();scene.scenario.autoResolve=true;const s=setup(scene);s.command('MASTER_SCENE_COUNTER',{counterId:'saved',value:5});assert.equal(s.runtime().goals.rescue.status,'pending');s.play();assert.equal(s.runtime().goals.rescue.status,'completed');s.round();assert.equal(s.runtime().goals.hold.status,'pending');s.round();assert.equal(s.runtime().outcome,'success');assert.equal(s.runtime().outcomeText,'Деревня спасена.');
    s.reject('MASTER_SCENE_COUNTER',{counterId:'saved',value:-1});s.reject('MASTER_SCENE_GOAL',{goalId:'missing',status:'completed'});s.reject('MASTER_SCENE_COUNTER',{counterId:'saved',value:0,revision:-1});
});
test('автоматическое разрешение различает частичный успех и поражение, мастер может выбрать исход',()=>{
    for(const result of ['partial','failure']){const scene=fixture();scene.scenario.autoResolve=true;const s=setup(scene);s.play();s.command('MASTER_SCENE_GOAL',{goalId:'hold',status:'failed'});assert.equal(s.runtime().outcome,null);s.command('MASTER_SCENE_GOAL',{goalId:'rescue',status:result === 'partial' ? 'completed' : 'failed'});assert.equal(s.runtime().outcome,result);s.command('MASTER_SCENE_OUTCOME',{outcome:'success'});assert.equal(s.runtime().outcome,'success');}
});
test('подтверждаемое событие ожидает мастера, применяется ровно один раз и цепляет другие события',()=>{
    const scene=fixture();scene.scenario.events=[{id:'reinforce',title:'SECRET_EVENT',condition:{kind:'round',value:1},confirm:true,actions:[{kind:'spawn',enemyType:'goblin',count:2,x:0,y:2},{kind:'counter',counterId:'saved',operation:'add',value:1}]},
        {id:'gate',title:'Открыть проход',confirm:false,condition:{kind:'counter',counterId:'saved',operator:'gte',value:1},actions:[{kind:'cell',x:1,y:1,cellType:'road'},{kind:'note',noteId:'gate-note',revealed:true}]}];
    const s=setup(scene);s.play();s.reject('MASTER_SCENE_EVENT',{eventId:'reinforce',action:'apply'});s.round();assert.equal(s.runtime().events.reinforce.status,'pending');assert.equal(s.g.state.enemies.length,0);
    s.command('MASTER_SCENE_EVENT',{eventId:'reinforce',action:'apply'});assert.equal(s.g.state.enemies.length,2);assert.equal(s.g.state.grid[1][1].type,'road');assert.equal(s.g.state.sceneMaster.notes[0].revealed,true);assert.equal(s.runtime().events.gate.status,'done');
    s.reject('MASTER_SCENE_EVENT',{eventId:'reinforce',action:'apply'});s.round();assert.equal(s.runtime().counters.saved,1);
});
test('ошибка действия не применяет предыдущие действия события; ошибку можно исправить и повторить',()=>{
    const scene=fixture();scene.scenario.events=[{id:'bad',title:'Событие',condition:{kind:'round',value:1},confirm:false,actions:[{kind:'counter',counterId:'saved',operation:'add',value:2},{kind:'spawn',enemyType:'goblin',count:2,x:0,y:2}]}];
    const s=setup(scene);s.play();const mob=s.g.gameData.enemies.goblin;delete s.g.gameData.enemies.goblin;s.round();assert.equal(s.runtime().events.bad.status,'error');assert.equal(s.runtime().counters.saved,0);assert.equal(s.g.state.enemies.length,0);
    s.g.gameData.enemies.goblin=mob;s.command('MASTER_SCENE_EVENT',{eventId:'bad',action:'apply'});assert.equal(s.runtime().events.bad.status,'done');assert.equal(s.runtime().counters.saved,2);assert.equal(s.g.state.enemies.length,2);
});
test('побеждённый командир учитывается один раз, прорыв в замок и удаление мастером не считаются победой',()=>{
    const scene=fixture();scene.scenario.events=[{id:'death',title:'Командир пал',condition:{kind:'defeated',enemyType:'orc_warrior',count:1},confirm:true,actions:[{kind:'message',text:'Командир повержен!'}]}];const s=setup(scene);s.play();
    const enemy=s.g.enemy(22,4,2,{type:'orc_warrior',hp:1,maxHp:1,armor:0});const {hero,ws}=s.g.player('gerald',[]);hero.x=4;hero.y=2;
    s.g.send(ws,{type:'PLAYER_ACTION',ability:'attack',targetId:enemy.id,dice:20});assert.equal(s.runtime().defeated.orc_warrior,1);assert.equal(s.runtime().events.death.status,'pending');
    s.g.enemy(23,7,2,{type:'orc_warrior',hp:100});s.round();assert.equal(s.runtime().defeated.orc_warrior,1);
    s.g.enemy(24,5,2,{type:'orc_warrior',hp:100});s.g.send(s.g.master,{type:'MASTER_ERASE_ENEMY',x:5,y:2});assert.equal(s.runtime().defeated.orc_warrior,1);
});
test('откат способности возвращает погибшего врага, прогресс цели и сработавшее автоматическое событие',()=>{
    const scene=fixture();scene.scenario.events=[{id:'death',title:'SECRET_DEATH',condition:{kind:'defeated',enemyType:'orc_warrior',count:1},confirm:false,actions:[{kind:'counter',counterId:'saved',operation:'add',value:2}]}];const s=setup(scene);s.play();
    const {hero,ws}=s.g.player('gerald',[]);hero.x=4;hero.y=2;const enemy=s.g.enemy(44,4,2,{type:'orc_warrior',hp:1,maxHp:1,armor:0});s.g.send(ws,{type:'PLAYER_ACTION',ability:'attack',targetId:enemy.id,dice:20});
    const id=s.g.master.messages.findLast(message=>message.type === 'STATE_UPDATE').state.playerHistory[0].id;assert.equal(s.runtime().counters.saved,2);s.g.send(s.g.master,{type:'MASTER_ROLLBACK_PLAYER',historyId:id});assert.equal(s.runtime().counters.saved,0);assert.equal(s.runtime().events.death.status,'waiting');assert.equal(s.g.state.enemies.find(enemy=>enemy.id === 44).hp,1);
});
test('цель очистки ждёт отложенную волну и неподтверждённые подкрепления, пропуск снимает ожидание',()=>{
    const scene=fixture();scene.enemies=[{type:'goblin',x:0,y:2,count:1}];scene.scenario.goals=[{id:'clear',title:'Очистить поле',success:{kind:'clear'}}];scene.scenario.events=[{id:'later',title:'Reinforcement',condition:{kind:'round',value:3},actions:[{kind:'wave',waveNum:91}]}];const s=setup(scene);s.play();s.g.send(s.g.master,{type:'MASTER_ERASE_ENEMY',x:0,y:2});assert.equal(s.runtime().goals.clear.status,'pending');s.command('MASTER_SCENE_EVENT',{eventId:'later',action:'skip'});assert.equal(s.runtime().goals.clear.status,'completed');
});
test('карточки и фазы босса сохраняют отметки; фазы не откатываются назад после лечения',()=>{
    const s=setup();s.play();const boss=s.g.enemy(77,3,2,{type:'orc_warrior',hp:40,maxHp:100});s.g.send(s.g.master,{type:'MASTER_ADD_GOLD',amount:1});assert.equal(s.runtime().bossPhases.boss,'rage');boss.hp=100;s.g.send(s.g.master,{type:'MASTER_ADD_GOLD',amount:1});assert.equal(s.runtime().bossPhases.boss,'rage');s.command('MASTER_CARD_USED',{cardId:'elder',used:true});assert.deepEqual(Array.from(s.runtime().usedCards),['elder']);s.command('MASTER_BOSS_PHASE',{cardId:'boss',phaseId:'calm'});assert.equal(s.runtime().bossPhases.boss,'calm');
    const captured=captureScene(s.g.state,s.g.gameData,'copy');assert.equal(captured.cards.length,3);assert.equal(captured.scenario.events.length,0);assert.equal(captured.runtime,undefined);assert.equal(captured.scenario.counters[0].initial,0);
});
test('ручное событие может вернуть цель к автоматической проверке, сброс сессии очищает прогресс сценария',()=>{
    const scene=fixture();scene.scenario.events=[{id:'reset',title:'Повторная проверка',condition:{kind:'manual'},actions:[{kind:'goal',goalId:'hold',status:'pending'}]}];const s=setup(scene);s.play();s.round();s.round();assert.equal(s.runtime().goals.hold.status,'completed');
    s.command('MASTER_SCENE_GOAL',{goalId:'hold',status:'failed'});s.command('MASTER_SCENE_EVENT',{eventId:'reset',action:'apply'});assert.equal(s.runtime().goals.hold.status,'completed');
    s.command('MASTER_SCENE_COUNTER',{counterId:'saved',value:5});s.g.send(s.g.master,{type:'MASTER_RESET_SESSION',clearTowers:false});assert.equal(s.runtime().counters.saved,0);assert.equal(s.runtime().goals.hold.status,'pending');assert.equal(s.runtime().events.reset.status,'waiting');
});
