'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const rules=require('../public/activated-event-rules');

function client(){
    class Element{
        constructor(tag){this.tagName=tag;this.children=[];this.dataset={};this.type='';this._value='';this.hidden=false;this.listeners={};this.classList={toggle(){},remove(){},add(){}};}
        set value(v){this._value=String(v);}
        get value(){return this._value;}
        append(...children){this.children.push(...children);}
        prepend(...children){this.children.unshift(...children);}
        replaceChildren(...children){this.children=children;}
        setAttribute(key,value){this[key]=value;}
        addEventListener(name,handler){this.listeners[name]=handler;}
        showModal(){this.open=true;}
        close(){this.open=false;}
        remove(){this.removed=true;}
        reportValidity(){return true;}
        querySelectorAll(selector){const all=this.children.flatMap(child=>[child,...child.querySelectorAll(selector)]);const dataset={'[data-event-player]':'eventPlayer','[data-event-result]':'eventResult','[data-event-hero-row]':'eventHeroRow'}[selector];return dataset ? all.filter(el=>el.dataset[dataset]!==undefined) : all;}
        querySelector(selector){const match=selector.match(/data-event-player="(.+)"/);return match ? this.querySelectorAll('[data-event-player]').find(el=>el.dataset.eventPlayer===match[1]) : null;}
    }
    const body=new Element('body'),elements={'activated-event-picking':new Element('div'),'activated-events-panel':new Element('section')};
    const sent=[],handlers={};const socket={addEventListener(name,fn){handlers[name]=fn;}};
    const document={body,createElement:tag=>new Element(tag),getElementById(id){return elements[id] || body.querySelectorAll('*').find(el=>el.id===id);},addEventListener(){}};
    const context={document,socket,ACTIVATED_EVENT_RULES:rules,GAME_DATA:{enemies:{goblin:{name:'Goblin'}}},CSS:{escape:value=>value},sendMaster(message){sent.push(message);return true;}};
    context.window=context;vm.createContext(context);vm.runInContext(fs.readFileSync(require.resolve('../public/master-activated-events.js'),'utf8')+'\nthis.events=MASTER_ACTIVATED_EVENTS;',context);
    const state={gridWidth:8,gridHeight:8,grid:Array.from({length:8},(_,y)=>Array.from({length:8},(_,x)=>({type:y===2 ? x===7 ? 'castle' : 'road' : 'empty'}))),roundCounter:0,players:{hero:{name:'hero',heroName:'Hero',hp:20,x:1,y:1}},enemies:[],soldiers:[],activeEvents:[]};context.events.render(state);
    return {context,sent,handlers,body,elements,form:()=>body.children.at(-1).children[1]};
}

test('frost requires every result and leaves its dialog open until the server accepts activation',()=>{
    const c=client();c.context.events.open('frost');const form=c.form();form.onsubmit({preventDefault(){}});
    assert.equal(c.sent.length,0);
    const apply=form.children.at(-1).children[0];assert.equal(apply.disabled,true);
    const result=form.querySelectorAll('[data-event-result]')[0];result.value='fail';result.onchange();assert.equal(apply.disabled,false);
    form.children.find(el=>el.textContent==='Select cell on map').onclick();c.context.events.pickCell(3,3);assert.equal(result.value,'fail');
    form.onsubmit({preventDefault(){}});
    assert.equal(c.sent.length,1);assert.deepEqual(Array.from(c.sent[0].config.playerNames),['hero']);assert.equal(c.sent[0].config.results.hero,'fail');
    assert.equal(c.body.children.at(-1).removed,undefined);
    c.handlers.message({data:JSON.stringify({type:'EVENT_RESULT',requestId:c.sent[0].requestId,ok:false,error:'Try again'})});
    assert.equal(c.body.children.at(-1).removed,undefined);assert.equal(result.value,'fail');
    form.onsubmit({preventDefault(){}});assert.equal(c.sent.length,2);
    c.handlers.message({data:JSON.stringify({type:'EVENT_RESULT',requestId:c.sent[1].requestId,ok:true})});
    assert.equal(c.body.children.at(-1).removed,true);
});

test('tower placement suggests a connected reinforcement road and submits summon rewards',()=>{
    const c=client();c.context.events.open('goblinTower');const form=c.form();
    form.children.find(el=>el.textContent==='Select cell on map').onclick();c.context.events.pickCell(4,4);form.onsubmit({preventDefault(){}});
    assert.equal(c.sent[0].config.spawnX,4);assert.equal(c.sent[0].config.spawnY,2);assert.equal(c.sent[0].config.summonReward,0);assert.equal(c.sent[0].config.count,1);assert.equal(c.sent[0].config.damageType,'physical');
});

test('ending errors remain visible and allow retry',()=>{
    const c=client();c.context.events.render({players:{},enemies:[],activeEvents:[{id:'active-1',kind:'sandstorm',title:'Storm'}]});
    const row=c.elements['activated-events-panel'].children.at(-1);row.children.at(-1).onclick();assert.equal(c.sent[0].type,'MASTER_FINISH_EVENT');
    c.handlers.message({data:JSON.stringify({type:'EVENT_RESULT',requestId:c.sent[0].requestId,ok:false,error:'Cannot finish'})});
    assert.equal(c.elements['activated-events-panel'].children.at(-1).textContent,'Cannot finish');
    const newRow=c.elements['activated-events-panel'].children.at(-2);assert.equal(newRow.children.at(-1).disabled,false);
});

test('bombardment map picking gathers distinct impact cells before activation',()=>{
    const c=client();c.context.events.open('bombardment');const form=c.form();
    form.children.find(el=>el.textContent==='Mark impact areas').onclick();
    assert.equal(c.context.events.pickCell(2,3),true);assert.equal(c.context.events.pickCell(2,3),true);assert.equal(c.context.events.pickCell(4,3),true);
    c.elements['activated-event-picking'].children.find(el=>el.textContent==='Finish selection').onclick();
    assert.equal(c.context.events.pickCell(7,7),false);form.onsubmit({preventDefault(){}});
    assert.equal(c.sent[0].config.areas.length,2);assert.equal(c.sent[0].config.areas[1].x,4);
});
