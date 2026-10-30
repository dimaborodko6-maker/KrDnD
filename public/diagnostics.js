(function () {
    'use strict';
    const clientId = window.crypto?.randomUUID?.() || Date.now().toString(36) + Math.random().toString(36).slice(2);
    const queue = [];
    let timer = null, sending = false, lastCommand = null, retryMs = 1000;
    const clip = (value, limit) => String(value ?? '').slice(0, limit);
    function text(value) {
        if (value instanceof Error) return value.message;
        if (typeof value === 'string') return value;
        try { return JSON.stringify(value); } catch { return String(value); }
    }
    function schedule(delay = 250) {
        if (timer !== null) return;
        timer = setTimeout(() => { timer = null; flush(); }, delay);
    }
    function report(level, event, message, data = null, stack = '') {
        queue.push({ level, event, message: clip(message, 2000), stack: clip(stack, 6000),
            time: new Date().toISOString(), data: { lastCommand, details: clip(text(data), 2000) } });
        if (queue.length > 100) queue.shift();
        schedule();
    }
    function payload(events) {
        let playerName = '';
        try { playerName = localStorage.getItem('kr_player_id') || ''; } catch {}
        return JSON.stringify({ page: location.pathname, clientId, playerName, events });
    }
    function batch() {
        const events = queue.splice(0, 5);
        let body = payload(events);
        // Учитываем байты UTF-8, чтобы длинные русские сообщения укладывались в лимит HTTP/keepalive.
        while (events.length > 1 && new Blob([body]).size > 48 * 1024) {
            queue.unshift(events.pop());
            body = payload(events);
        }
        return { events, body };
    }
    async function flush() {
        if (sending || !queue.length) return;
        sending = true;
        const { events, body } = batch();
        let delay = 0;
        try {
            const response = await fetch('/api/client-logs', { method: 'POST',
                headers: { 'Content-Type': 'application/json' }, body, keepalive: true });
            if (!response.ok) throw new Error('HTTP ' + response.status);
            retryMs = 1000;
        } catch {
            // Сервер может быть недоступен: повторяем без рекурсивных сообщений в console.error.
            queue.unshift(...events);
            if (queue.length > 100) queue.splice(0, queue.length - 100);
            delay = retryMs;
            retryMs = Math.min(60000, retryMs * 2);
        } finally {
            sending = false;
            if (queue.length) schedule(delay);
        }
    }
    window.addEventListener('error', event => {
        if (typeof event.message === 'string' && event.message.includes('ResizeObserver')) return;
        if (event.target && event.target !== window) {
            report('error', 'resource', 'Could not load resource', { url: event.target.src || event.target.href });
        } else {
            report('error', 'error', event.message || 'JavaScript error',
                { file: event.filename, line: event.lineno, column: event.colno }, event.error?.stack);
        }
    }, true);
    window.addEventListener('unhandledrejection', event => {
        report('error', 'unhandledrejection', text(event.reason), null, event.reason?.stack);
    });
    for (const level of ['warn', 'error']) {
        const original = console[level].bind(console);
        console[level] = (...args) => {
            original(...args);
            report(level, 'console', args.map(text).join(' '), null,
                args.find(value => value instanceof Error)?.stack);
        };
    }
    function trackSocket(socket) {
        socket.addEventListener('open', () => report('info', 'socket.open', 'WebSocket connected'));
        socket.addEventListener('error', () => report('error', 'socket.error', 'WebSocket error'));
        socket.addEventListener('close', event => report(event.wasClean ? 'info' : 'warn', 'socket.close',
            'WebSocket disconnected', { code: event.code, reason: event.reason, wasClean: event.wasClean }));
        const send = socket.send.bind(socket);
        socket.send = data => {
            try { lastCommand = JSON.parse(data).type; } catch {}
            return send(data);
        };
    }
    window.addEventListener('online', () => { retryMs = 1000; flush(); });
    window.addEventListener('pagehide', () => {
        clearTimeout(timer); timer = null;
        while (queue.length && navigator.sendBeacon) {
            const { events, body } = batch();
            if (!navigator.sendBeacon('/api/client-logs', new Blob([body], { type: 'application/json' }))) {
                queue.unshift(...events); break;
            }
        }
    });
    window.KR_DIAGNOSTICS = { trackSocket };
    report('info', 'page.open', 'Game screen opened');
}());
