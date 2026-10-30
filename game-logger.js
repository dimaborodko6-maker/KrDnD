const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { format } = require('node:util');

// Ограничиваем отдельную запись, сохраняя Error.stack и защиту от циклических объектов.
function serialize(value, seen = new WeakSet(), depth = 0) {
    if (typeof value === 'string') return value.length > 16000 ? value.slice(0, 16000) + '… [truncated]' : value;
    if (typeof value === 'bigint') return String(value);
    if (value === null || typeof value !== 'object') return value;
    if (seen.has(value)) return '[Circular]';
    if (depth > 6) return '[Max depth]';
    seen.add(value);
    let result;
    if (value instanceof Error) {
        result = { name: value.name, message: serialize(value.message), stack: serialize(value.stack) };
        for (const key of ['code', 'cause']) if (value[key] !== undefined) result[key] = serialize(value[key], seen, depth + 1);
    } else if (Array.isArray(value)) {
        result = value.slice(0, 100).map(item => serialize(item, seen, depth + 1));
        if (value.length > 100) result.push('[truncated]');
    } else {
        result = {};
        for (const [key, item] of Object.entries(value).slice(0, 100)) result[key] = serialize(item, seen, depth + 1);
    }
    seen.delete(value);
    return result;
}

function createGameLogger(file) {
    file = path.resolve(file);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    // Открываем на каждую запись: файл можно убрать между партиями, а следующая запись создаст его заново.
    fs.appendFileSync(file, '', 'utf8');
    const session = randomUUID();
    const reportFailure = console.error.bind(console);
    let failed = false;
    function write(level, source, message, data = null) {
        try {
            const entry = { time: new Date().toISOString(), session, pid: process.pid, level, source,
                message: serialize(String(message)), data: serialize(data) };
            // Синхронная допись сохраняет порядок и не оставляет очередь при аварийном завершении Node.js.
            fs.appendFileSync(file, JSON.stringify(entry) + '\n', 'utf8');
            failed = false;
            return true;
        } catch (error) {
            if (!failed) reportFailure('Could not write the log ' + file + ':', error);
            failed = true;
            return false;
        }
    }
    function captureConsole(target = console) {
        for (const [method, level] of Object.entries({ log: 'info', info: 'info', warn: 'warn', error: 'error', debug: 'debug' })) {
            const original = target[method].bind(target);
            target[method] = (...args) => {
                write(level, 'server.console', format(...args), args);
                original(...args);
            };
        }
    }
    function captureProcess(target = process) {
        // Monitor сохраняет стандартное поведение Node.js: авария завершает процесс.
        target.on('uncaughtExceptionMonitor', (error, origin) => write('fatal', 'server.process', origin, { error }));
        target.on('warning', warning => write('warn', 'server.process', warning.message, { warning }));
        target.on('exit', code => write('info', 'server.process', 'Process exited', { code }));
    }
    return { file, write, captureConsole, captureProcess };
}

module.exports = { createGameLogger };
