'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createSecurityManager, generatePin, generateToken } = require('../server-security.js');
const { createTunnelManager } = require('../tunnel-service.js');

test('security manager: disabled by default allows all access', () => {
    const sec = createSecurityManager({ enabled: false });
    assert.equal(sec.isEnabled(), false);
    assert.equal(sec.verifyMaster(null), true);
    assert.equal(sec.verifyPlayerPin(null), true);
    assert.equal(sec.getClientInfo().hasRoomPin, false);
});

test('security manager: enabled requires valid master token and room PIN', () => {
    const sec = createSecurityManager({
        enabled: true,
        pin: '4321',
        masterToken: 'secret-token-123'
    });

    assert.equal(sec.isEnabled(), true);
    assert.equal(sec.getRoomPin(), '4321');
    assert.equal(sec.getMasterToken(), 'secret-token-123');

    // Master verification
    assert.equal(sec.verifyMaster('wrong-token'), false);
    assert.equal(sec.verifyMaster(null), false);
    assert.equal(sec.verifyMaster('secret-token-123'), true);

    // Player PIN verification
    assert.equal(sec.verifyPlayerPin('0000'), false);
    assert.equal(sec.verifyPlayerPin(null), false);
    assert.equal(sec.verifyPlayerPin('4321'), true);

    // Client info does not leak secrets
    const clientInfo = sec.getClientInfo();
    assert.equal(clientInfo.hasRoomPin, true);
    assert.equal(clientInfo.roomPin, undefined);
    assert.equal(clientInfo.masterToken, undefined);

    // Master info includes secrets
    const masterInfo = sec.getMasterInfo();
    assert.equal(masterInfo.roomPin, '4321');
    assert.equal(masterInfo.masterToken, 'secret-token-123');
});

test('security manager: pin and token generators', () => {
    const pin = generatePin();
    assert.match(pin, /^\d{4}$/);
    const token = generateToken();
    assert.match(token, /^[0-9a-f]{16}$/);
});

test('tunnel manager: initial status is idle and clean stop', () => {
    const tunnel = createTunnelManager({ localPort: 3999 });
    const status = tunnel.getStatus();
    assert.equal(status.active, false);
    assert.equal(status.url, null);

    // Safe to stop when not running
    tunnel.stop();
    assert.equal(tunnel.getStatus().active, false);
});
