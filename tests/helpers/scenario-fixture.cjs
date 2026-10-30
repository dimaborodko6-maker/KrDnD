const base = require('../../public/gamedata');
const copy = value=>JSON.parse(JSON.stringify(value));
function fixture(overrides={}) {
    return {id:'bridge',kind:'combat',title:'Оборона моста',description:'SECRET_DESCRIPTION',objectives:'SECRET_OBJECTIVE',gold:500,baseHp:30,gridWidth:8,gridHeight:8,
        grid:Array.from({length:8},(_,y)=>Array.from({length:8},(_,x)=>({x,y,type:y === 2 ? x === 0 ? 'spawn' : x === 7 ? 'castle' : 'road' : 'empty'}))),
        enemies:[],waves:[{waveNum:91,title:'Волна подкрепления',desc:'SECRET_WAVE',enemies:[{type:'goblin',count:2,offsetDelay:2}]}],
        notes:[{id:'gate-note',x:1,y:2,title:'Проход открыт',text:'Жители могут перейти мост.',secret:'SECRET_NOTE'}],
        scenario:{counters:[{id:'saved',title:'Rescued villagers',initial:0,target:5,visible:true},{id:'secret-counter',title:'SECRET_COUNTER',initial:0,target:1,visible:false}],
            goals:[{id:'hold',title:'Hold the Bridge',description:'Продержитесь два раунда',required:true,visible:true,success:{kind:'round',value:2},failure:{kind:'baseHp',operator:'lte',value:0}},
                {id:'rescue',title:'Вывести жителей',required:true,visible:true,success:{kind:'counter',counterId:'saved',operator:'gte',value:5}}],events:[],autoResolve:false,endings:{success:'Деревня спасена.',partial:'Удалось спасти часть жителей.',failure:'Оборона прорвана.'}},
        cards:[{id:'elder',kind:'npc',title:'Староста',motivation:'SECRET_NPC',information:'SECRET_INFO',help:'SECRET_HELP'},
            {id:'tactics',kind:'tactics',title:'Тактика орков',enemyType:'orc_warrior',priority:'SECRET_TACTICS'},
            {id:'boss',kind:'boss',title:'Orc commander',enemyType:'orc_warrior',notes:'SECRET_BOSS',phases:[{id:'calm',title:'Осторожная атака',threshold:100,description:'SECRET_PHASE_1'},{id:'rage',title:'Ярость',threshold:50,description:'SECRET_PHASE_2'}]}],...overrides};
}
function plan() {return {id:'adventure',title:'Оборона долины',description:'SECRET_PLAN',steps:[{id:'intro',sceneId:'talk',title:'Встреча со старостой',kind:'essential',minutes:15,notes:'SECRET_STEP',branches:[]},
    {id:'fight',sceneId:'bridge',title:'Оборона моста',kind:'essential',minutes:60,notes:'',branches:[{id:'win',title:'Победа',target:'ending',outcome:'success'},{id:'loss',title:'Retreat',target:'backup',outcome:'failure'}]},
    {id:'backup',sceneId:'talk',title:'Запасная встреча',kind:'backup',minutes:20,notes:'SECRET_BACKUP',branches:[]},
    {id:'ending',sceneId:'talk',title:'Возвращение в деревню',kind:'optional',minutes:15,notes:'',branches:[]}]};}
module.exports={fixture,plan,base,copy};
