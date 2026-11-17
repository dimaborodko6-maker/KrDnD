'use strict';

const https = require('node:https');
const net = require('node:net');
const { spawn } = require('node:child_process');

function createTunnelManager(options = {}) {
    const localPort = options.localPort || 3000;
    const logger = options.logger || console;

    let active = false;
    let currentUrl = null;
    let provider = null;
    let error = null;
    let sockets = new Set();
    let childProcess = null;
    let retryTimer = null;

    function getStatus() {
        return {
            active,
            url: currentUrl,
            provider,
            error
        };
    }

    function stop() {
        active = false;
        currentUrl = null;
        provider = null;
        if (retryTimer) {
            clearTimeout(retryTimer);
            retryTimer = null;
        }
        if (childProcess) {
            try { childProcess.kill(); } catch (e) {}
            childProcess = null;
        }
        for (const sock of sockets) {
            try { sock.destroy(); } catch (e) {}
        }
        sockets.clear();
        logger.log?.('🛑 Online tunnel stopped');
    }

    function start(callback) {
        if (active && currentUrl) {
            if (callback) callback(null, getStatus());
            return;
        }
        stop();
        active = true;

        // Try cloudflared if available, otherwise fallback to built-in JS tunnel
        tryCloudflare((cfErr, cfUrl) => {
            if (!cfErr && cfUrl) {
                currentUrl = cfUrl;
                provider = 'cloudflare';
                error = null;
                logger.log?.(`🌐 Cloudflare Tunnel online: ${cfUrl}`);
                if (callback) callback(null, getStatus());
                return;
            }

            // Fallback to built-in JS localtunnel
            startJsTunnel((jsErr, jsUrl) => {
                if (jsErr) {
                    error = jsErr.message;
                    active = false;
                    logger.error?.('Failed to start online tunnel:', jsErr);
                    if (callback) callback(jsErr, getStatus());
                    return;
                }
                currentUrl = jsUrl;
                provider = 'localtunnel';
                error = null;
                logger.log?.(`🌐 Built-in Online Tunnel active: ${jsUrl}`);
                if (callback) callback(null, getStatus());
            });
        });
    }

    function tryCloudflare(cb) {
        let spawned = false;
        let proc = null;
        try {
            proc = spawn('cloudflared', ['tunnel', '--url', `http://127.0.0.1:${localPort}`]);
        } catch (e) {
            return cb(e);
        }

        proc.on('error', (err) => {
            if (!spawned) cb(err);
        });

        const timer = setTimeout(() => {
            if (!spawned) {
                try { proc.kill(); } catch (e) {}
                cb(new Error('Cloudflare tunnel timeout'));
            }
        }, 8000);

        proc.stderr.on('data', (chunk) => {
            const text = chunk.toString();
            const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
            if (match && !spawned) {
                spawned = true;
                clearTimeout(timer);
                childProcess = proc;
                cb(null, match[0]);
            }
        });

        proc.on('exit', () => {
            if (!spawned) {
                clearTimeout(timer);
                cb(new Error('Cloudflare exited prematurely'));
            }
        });
    }

    function startJsTunnel(cb) {
        const req = https.get('https://localtunnel.me/?new', { timeout: 7000 }, (res) => {
            if (res.statusCode !== 200) {
                return cb(new Error(`Tunnel registry HTTP ${res.statusCode}`));
            }
            let body = '';
            res.on('data', chunk => { body += chunk; });
            res.on('end', () => {
                try {
                    const info = JSON.parse(body);
                    if (!info.port || !info.url) {
                        return cb(new Error('Invalid tunnel registry response'));
                    }
                    maintainPool(info.port, info.max_conn_count || 10);
                    cb(null, info.url);
                } catch (parseErr) {
                    cb(parseErr);
                }
            });
        });

        req.on('error', cb);
        req.on('timeout', () => {
            req.destroy();
            cb(new Error('Tunnel connection timed out'));
        });
    }

    function maintainPool(remotePort, maxConns) {
        if (!active) return;
        const targetConns = Math.min(Math.max(maxConns, 3), 15);
        while (sockets.size < targetConns && active) {
            connectBridge(remotePort);
        }
    }

    function connectBridge(remotePort) {
        if (!active) return;
        const remoteSocket = net.connect({ host: 'localtunnel.me', port: remotePort });
        sockets.add(remoteSocket);

        let localSocket = null;
        let isPiped = false;

        remoteSocket.once('data', (firstChunk) => {
            if (!active) {
                remoteSocket.destroy();
                return;
            }
            // Once data arrives from the outside, pipe to local server
            localSocket = net.connect({ host: '127.0.0.1', port: localPort }, () => {
                localSocket.write(firstChunk);
                remoteSocket.pipe(localSocket);
                localSocket.pipe(remoteSocket);
                isPiped = true;
            });

            localSocket.on('error', () => {
                remoteSocket.destroy();
            });

            localSocket.on('close', () => {
                remoteSocket.destroy();
            });

            // Refill the pool with a new standby socket
            maintainPool(remotePort, 10);
        });

        function cleanup() {
            sockets.delete(remoteSocket);
            if (localSocket) {
                try { localSocket.destroy(); } catch (e) {}
            }
            if (active && !isPiped) {
                maintainPool(remotePort, 10);
            }
        }

        remoteSocket.on('error', cleanup);
        remoteSocket.on('close', cleanup);
    }

    return {
        start,
        stop,
        getStatus
    };
}

module.exports = {
    createTunnelManager
};
