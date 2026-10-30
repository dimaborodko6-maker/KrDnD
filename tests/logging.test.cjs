const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const WebSocket = require('ws');
const { createGameLogger } = require('../game-logger');
const root = path.resolve(__dirname, '..');

function temporary(t) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kr-logging-'));
    t.after(() => {
        for (const file of ['save.json', 'game.log', 'nested/game.log']) {
            const target = path.join(dir, file);
            if (fs.existsSync(target)) fs.unlinkSync(target);
        }
        if (fs.existsSync(path.join(dir, 'nested'))) fs.rmdirSync(path.join(dir, 'nested'));
        fs.rmdirSync(dir);
    });
    return dir;
}
const entries = file => fs.readFileSync(file, 'utf8').trim().split('\n').map(line => JSON.parse(line));

test('общий файл дополняется, сохраняет русский текст, стек ошибки и циклические данные', t => {
    const file = path.join(temporary(t), 'nested', 'game.log');
    const logger = createGameLogger(file);
    const data = { error: new Error('Ошибка боя') }; data.self = data;
    logger.write('error', 'test', 'Первая строка\nВторая строка', data);
    createGameLogger(file).write('info', 'test', 'Следующая партия');
    const records = entries(file);
    assert.equal(records.length, 2);
    assert.equal(records[0].message, 'Первая строка\nВторая строка');
    assert.match(records[0].data.error.stack, /Error: Ошибка боя/);
    assert.equal(records[0].data.self, '[Circular]');
    assert.notEqual(records[0].session, records[1].session);
});

test('аварии Node.js и необработанные Promise записываются до завершения процесса', async t => {
    const dir = temporary(t), file = path.join(dir, 'game.log');
    for (const fail of ['throw new Error("Fatal test")', 'Promise.reject(new Error("Rejected test"))']) {
        const child = spawn(process.execPath, ['-e',
            'const logger=require("./game-logger").createGameLogger(process.argv[1]);logger.captureProcess();' + fail, file],
        { cwd: root, windowsHide: true, stdio: 'ignore' });
        const [code] = await once(child, 'exit');
        assert.equal(code, 1);
    }
    const fatal = entries(file).filter(record => record.level === 'fatal');
    assert.equal(fatal.length, 2);
    assert.match(fatal[0].data.error.stack, /Fatal test/);
    assert.match(fatal[1].data.error.stack, /Rejected test/);
});

test('сервер собирает команды, бой и браузерные ошибки в один файл и сохраняет его при перезапуске', async t => {
    const dir = temporary(t), file = path.join(dir, 'nested', 'game.log');
    fs.writeFileSync(path.join(dir, 'save.json'), '{broken');
    let child, port;
    const sockets = [];
    async function stop() {
        for (const socket of sockets) socket.terminate();
        if (child && child.exitCode === null) {
            const exited = once(child, 'exit'); child.kill(); await exited;
        }
    }
    t.after(stop);
    async function start() {
        child = spawn(process.execPath, ['server.js'], { cwd: root, windowsHide: true,
            env: { ...process.env, PORT: '0', KR_SAVE_FILE: path.join(dir, 'save.json'),
                KR_LOG_FILE: file, KR_CATALOG_FILE: path.join(dir, 'catalog.json'), KR_SCENES_FILE: path.join(dir, 'scenes.json') } });
        port = await new Promise((resolve, reject) => {
            let output = '';
            const timer = setTimeout(() => reject(new Error('Server start timeout: ' + output)), 5000);
            child.stdout.on('data', chunk => {
                output += chunk;
                const match = output.match(/localhost:(\d+)\/master/);
                if (match) { clearTimeout(timer); resolve(Number(match[1])); }
            });
            child.stderr.on('data', chunk => { output += chunk; });
            child.once('error', error => { clearTimeout(timer); reject(error); });
            child.once('exit', code => { clearTimeout(timer); reject(new Error('Server exited: ' + code + '\n' + output)); });
        });
    }
    await start();
    const socket = new WebSocket('ws://127.0.0.1:' + port);
    sockets.push(socket);
    await once(socket, 'open');
    async function send(message, responseType = 'STATE_UPDATE') {
        const received = new Promise((resolve, reject) => {
            const timer = setTimeout(() => { socket.off('message', listener); reject(new Error('Message timeout')); }, 5000);
            function listener(raw) {
                const response = JSON.parse(raw);
                if (response.type === responseType) { clearTimeout(timer); socket.off('message', listener); resolve(response); }
            }
            socket.on('message', listener);
        });
        socket.send(typeof message === 'string' ? message : JSON.stringify(message));
        return received;
    }
    await send({ type: 'REGISTER_MASTER' });
    await send({ type: 'MASTER_ADD_GOLD', amount: 17 });
    await send({ type: 'MASTER_SET_GAME_PERIOD', gamePeriod: 'game' });
    await send({ type: 'MASTER_MOVE_ENEMIES' });
    await send('{invalid', 'COMMAND_ERROR');
    await send({ type: 'CLEAR_DEBUG_LOG' });
    const endpoint = 'http://127.0.0.1:' + port;
    const report = { clientId: 'test-tab', page: '/player.html', playerName: 'Тест',
        events: [{ level: 'error', event: 'error', message: 'Ошибка игрока', stack: 'Error: Ошибка игрока\n at attack (player-logic.js:10:3)' }] };
    const post = body => fetch(endpoint + '/api/client-logs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
    assert.equal((await post(JSON.stringify(report))).status, 204);
    assert.equal((await post(JSON.stringify({ ...report, events: [{ level: 'bad', event: 'x', message: 'x' }] }))).status, 400);
    assert.equal((await post(JSON.stringify({ value: 'x'.repeat(70000) }))).status, 413);
    assert.equal((await fetch(endpoint + '/logs/game.log')).status, 404);
    for (const page of ['master.html', 'player.html', 'catalog-editor.html', 'scene-editor.html']) {
        const html = await (await fetch(endpoint + '/' + page)).text();
        assert.ok(html.includes('src="diagnostics.js"'));
    }
    const records = entries(file);
    assert.ok(records.some(record => record.source === 'server.console' && record.data.some?.(value => value?.stack?.includes('SyntaxError'))));
    const command = records.find(record => record.source === 'command.received' && record.message === 'MASTER_ADD_GOLD');
    assert.equal(command.data.details.amount, 17);
    assert.ok(records.some(record => record.source === 'game.action' && record.data.command.id === command.data.command.id));
    assert.ok(records.some(record => record.source === 'game.INITIATIVE_START'));
    assert.ok(records.some(record => record.source === 'command.rejected' && record.message === 'Invalid JSON'));
    assert.match(records.find(record => record.source === 'browser.error').data.stack, /player-logic.js:10:3/);
    const before = fs.readFileSync(file, 'utf8');
    await stop(); await start();
    assert.ok(fs.readFileSync(file, 'utf8').startsWith(before));
    const sessions = entries(file).filter(record => record.source === 'server.start').map(record => record.session);
    assert.equal(new Set(sessions).size, 2);
});

function browserDiagnostics(fetchImpl = async () => ({ ok: true })) {
    const listeners = {}, timers = new Map(), requests = [], beacons = [];
    let sequence = 0;
    const context = { location: { pathname: '/player.html' }, localStorage: { getItem: () => 'Player' },
        console: { warn() {}, error() {} }, Blob, Error, crypto: { randomUUID: () => 'browser-test' },
        navigator: { sendBeacon(url, body) { beacons.push({ url, body }); return true; } },
        addEventListener(type, listener) { listeners[type] = listener; },
        setTimeout(fn, delay) { timers.set(++sequence, { fn, delay }); return sequence; },
        clearTimeout(id) { timers.delete(id); },
        fetch: async (url, options) => { requests.push({ url, options }); return fetchImpl(url, options); } };
    context.window = context;
    vm.runInNewContext(fs.readFileSync(path.join(root, 'public', 'diagnostics.js'), 'utf8'), context);
    async function tick() {
        const [id, timer] = timers.entries().next().value;
        timers.delete(id); timer.fn();
        await new Promise(resolve => setImmediate(resolve));
    }
    return { context, listeners, timers, requests, beacons, tick };
}

test('браузер отправляет ошибки, Promise, консоль и разрывы соединения с контекстом игрока', async () => {
    const browser = browserDiagnostics(), { context, listeners } = browser;
    const socketEvents = {};
    const socket = { addEventListener(type, fn) { socketEvents[type] = fn; }, send() {} };
    context.KR_DIAGNOSTICS.trackSocket(socket);
    socket.send('{"type":"PLAYER_ACTION"}');
    listeners.error({ message: 'Ошибка удара', error: new Error('Ошибка удара'), filename: 'player-logic.js', lineno: 10 });
    listeners.unhandledrejection({ reason: new Error('Promise боя') });
    context.console.error(new Error('Ошибка консоли'));
    socketEvents.close({ code: 1006, reason: '', wasClean: false });
    while (browser.timers.size) await browser.tick();
    const events = browser.requests.flatMap(request => JSON.parse(request.options.body).events);
    assert.ok(events.some(event => event.event === 'error' && event.stack.includes('Ошибка удара')));
    assert.ok(events.some(event => event.event === 'unhandledrejection'));
    assert.ok(events.some(event => event.event === 'console'));
    assert.ok(events.some(event => event.event === 'socket.close' && event.data.lastCommand === 'PLAYER_ACTION'));
    assert.ok(browser.requests.every(request => JSON.parse(request.options.body).playerName === 'Player'));
    assert.ok(browser.requests.every(request => request.url === '/api/client-logs'));
    context.console.warn('Перед закрытием'); listeners.pagehide();
    assert.equal(browser.beacons.length, 1);
});

test('браузер повторяет отправку после сбоя и ограничивает размер пакета в байтах UTF-8', async () => {
    let attempts = 0;
    const browser = browserDiagnostics(async () => { if (!attempts++) throw new Error('offline'); return { ok: true }; });
    await browser.tick();
    assert.equal(browser.requests.length, 1);
    assert.equal(browser.timers.values().next().value.delay, 1000);
    await browser.tick();
    assert.equal(browser.requests[0].options.body, browser.requests[1].options.body);
    for (let i = 0; i < 7; i++) browser.listeners.unhandledrejection({ reason: { message: 'Ж'.repeat(4000), stack: 'Ж'.repeat(6000) } });
    while (browser.timers.size) await browser.tick();
    assert.ok(browser.requests.every(request => Buffer.byteLength(request.options.body, 'utf8') <= 48 * 1024));
    assert.equal(browser.requests.slice(2).flatMap(request => JSON.parse(request.options.body).events).length, 7);
});
