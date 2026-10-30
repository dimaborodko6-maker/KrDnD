const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const contours = require('../public/map-range-contours.js');

test('общий контур учитывает отступ сетки мастера без смещения клеток и изменения радиуса', () => {
    const cells = new Set(['1,0','0,1','1,1','2,1','1,2']);
    const player = contours.path(cells, 3, 3);
    const master = contours.path(cells, 3, 3, {padding:8});
    const shifted = player.replace(/-?\d+(?:\.\d+)?/g, n => String(Number(n) + 8));
    assert.equal(master, shifted);
    assert.deepEqual(contours.dimensions(3,3), {width:244,height:244});
    assert.deepEqual(contours.dimensions(3,3,{padding:8}), {width:260,height:260});
});

test('радиус мастера остаётся круговым, обновляет один контур при смене дальности и очищается при закрытии', () => {
    const cells=[];
    for(let y=0;y<5;y++) for(let x=0;x<5;x++) {
        const classes=new Set();
        cells.push({dataset:{x:String(x),y:String(y)},classList:{add:c=>classes.add(c),remove:c=>classes.delete(c),contains:c=>classes.has(c)}});
    }
    const overlays=[];
    const grid={querySelector:()=>overlays[0],querySelectorAll:()=>cells,appendChild:child=>overlays.push(child)};
    const document={getElementById:()=>grid,createElement:()=>({setAttribute(){}})};
    const state={gridWidth:5,gridHeight:5};
    const source=fs.readFileSync(require.resolve('../public/master-map.js'),'utf8');
    const context=vm.createContext({document,MAP_RANGE_CONTOURS:contours,lastState:state,activeMasterRangePreview:{x:2,y:2,range:1}});
    vm.runInContext(source.slice(source.indexOf('function updateMasterGridRange()'),source.indexOf('function onMasterQuickSelectChange()')),context);
    context.updateMasterGridRange();
    assert.equal(cells.filter(c=>c.classList.contains('range-tower')).length,5);
    assert.equal(cells.find(c=>c.dataset.x==='1'&&c.dataset.y==='1').classList.contains('range-tower'),false);
    assert.match(overlays[0].innerHTML,/viewBox="0 0 424 424"/);
    assert.match(overlays[0].innerHTML,/tone-support tower-range/);
    const first=overlays[0].innerHTML;
    context.activeMasterRangePreview.range=2;
    context.updateMasterGridRange();
    assert.notEqual(overlays[0].innerHTML,first);
    assert.equal(overlays.length,1);
    assert.equal(cells.filter(c=>c.classList.contains('range-tower')).length,13);
    context.activeMasterRangePreview.range=1;
    context.activeMasterRangePreview.metric='chebyshev';
    context.updateMasterGridRange();
    assert.equal(cells.filter(c=>c.classList.contains('range-tower')).length,9, 'движение и клеточные способности сохраняют собственную метрику');
    context.activeMasterRangePreview=null;
    context.updateMasterGridRange();
    assert.equal(overlays[0].innerHTML,'');
    assert.equal(cells.filter(c=>c.classList.contains('range-tower')).length,0);
    assert.deepEqual(state,{gridWidth:5,gridHeight:5});
});
