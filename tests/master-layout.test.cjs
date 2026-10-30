const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(require.resolve('../public/master-ui.js'), 'utf8');
const initialState = source.slice(0, source.indexOf('function escapeHTML'));
function client(elements, code, extra = {}) {
    const context = vm.createContext({ document: { getElementById: id => elements[id] }, ...extra });
    vm.runInContext(initialState + code, context);
    return context;
}

test('карта при открытии вписывается по высоте и ширине доступной области', () => {
    for (const [width, height] of [[900, 440], [320, 600]]) {
        const grid = { offsetWidth: 1410, offsetHeight: 1410, style: { setProperty() {} } };
        const stage = { style: {} }, label = {}, viewport = { clientWidth: width };
        const context = client({ 'game-grid': grid, 'map-stage': stage, 'zoom-label': label, 'map-viewport': viewport },
            source.slice(source.indexOf('function applyMasterZoom()'), source.indexOf('let observedMapWidth')),
            { lastState: {}, getComputedStyle: () => ({ maxHeight: height + 'px' }) });
        context.applyMasterZoom();
        assert.ok(Number.parseInt(stage.style.width) <= width);
        assert.ok(Number.parseInt(stage.style.height) <= height);
        assert.ok(context.masterZoom < 1);
        assert.equal(Number(grid.style.zoom), context.masterZoom);

        context.changeMasterZoom(0.1);
        const manualZoom = context.masterZoom;
        viewport.clientWidth = 280;
        context.applyMasterZoom();
        assert.equal(context.masterZoom, manualZoom, 'ручной масштаб сохраняется до команды «Вместить»');
        context.fitMasterMap();
        assert.ok(Number.parseInt(stage.style.width) <= 280);
    }
});

test('ярлыки открывают нужную форму в диалоге, закрытие возвращает место карте', () => {
    const names = ['spawn', 'gold', 'hero', 'undo'];
    const dialog = { open:false, showModal() { this.open=true; }, close() { this.open=false; } };
    const elements = { 'master-tools-dialog': dialog, 'close-master-tool': {} };
    const buttons = names.map(name => ({ dataset: { masterTool: name }, setAttribute(key, value) { this[key] = value; } }));
    const focused = [];
    for (const name of names) elements['master-tool-' + name] = { hidden: true, querySelector: () => ({ focus: () => focused.push(name) }) };
    let cancelled = 0, loaded = 0, previewed = 0, filtered = 0;
    const context = client(elements, source.slice(source.indexOf('function openMasterTool('), source.indexOf('function armSpawn()')), {
        document: { getElementById: id => elements[id], querySelectorAll: () => buttons },
        cancelMapAction: () => cancelled++, loadHeroEditor: () => loaded++, showRollbackPreview: () => previewed++, filterSpawnCatalog: () => filtered++
    });
    for (const name of ['gold', 'hero', 'undo', 'spawn']) {
        context.openMasterTool(name);
        assert.equal(dialog.open, true);
        for (const key of names) assert.equal(elements['master-tool-' + key].hidden, key !== name);
        for (const button of buttons) assert.equal(button['aria-pressed'], button.dataset.masterTool === name);
    }
    context.openMasterTool(null);
    assert.equal(dialog.open, false);
    assert.equal(elements['close-master-tool'].hidden, true);
    assert.ok(names.every(name => elements['master-tool-' + name].hidden));
    assert.equal(cancelled, 5);
    assert.equal(loaded, 1);
    assert.equal(previewed, 1);
    assert.equal(filtered, 1);
    assert.deepEqual(focused, ['gold', 'hero', 'undo', 'spawn']);
});

test('уведомление или перенос шапки не выталкивают вписанную карту за низ окна', () => {
    const grid={offsetWidth:1410,offsetHeight:1410,style:{setProperty(){}}};
    let top=220;
    const stage={style:{}},viewport={clientWidth:900,getBoundingClientRect:()=>({top})};
    const context=client({'game-grid':grid,'map-stage':stage,'zoom-label':{},'map-viewport':viewport},
        source.slice(source.indexOf('function applyMasterZoom()'),source.indexOf('let observedMapWidth')),
        {lastState:{},window:{innerHeight:720},getComputedStyle:()=>({maxHeight:'500px'})});
    context.applyMasterZoom();
    assert.ok(top+parseInt(stage.style.height)+36<=720);
    const previous=context.masterZoom;
    top=300;context.applyMasterZoom();
    assert.ok(context.masterZoom<previous);
    assert.ok(top+parseInt(stage.style.height)+36<=720);
});
