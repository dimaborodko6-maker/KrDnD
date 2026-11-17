'use strict';

const crypto = require('node:crypto');

function generatePin() {
    return String(Math.floor(1000 + Math.random() * 9000));
}

function generateToken() {
    return crypto.randomBytes(8).toString('hex');
}

function createSecurityManager(options = {}) {
    let enabled = options.enabled ?? false;
    let roomPin = options.pin || (process.env.KR_ROOM_PIN || null);
    let masterToken = options.masterToken || (process.env.KR_MASTER_TOKEN || generateToken());

    function isEnabled() {
        return enabled;
    }

    function setEnabled(val) {
        enabled = !!val;
        if (enabled && !roomPin) {
            roomPin = generatePin();
        }
    }

    function getRoomPin() {
        return roomPin;
    }

    function setRoomPin(pin) {
        roomPin = pin ? String(pin).trim() : null;
    }

    function getMasterToken() {
        return masterToken;
    }

    function setMasterToken(token) {
        masterToken = token ? String(token).trim() : generateToken();
    }

    function verifyMaster(token) {
        if (!enabled || !masterToken) return true;
        if (!token) return false;
        return String(token).trim() === masterToken;
    }

    function verifyPlayerPin(pin) {
        if (!enabled || !roomPin) return true;
        if (!pin) return false;
        return String(pin).trim() === roomPin;
    }

    function getClientInfo() {
        return {
            enabled,
            hasRoomPin: enabled && !!roomPin
        };
    }

    function getMasterInfo() {
        return {
            enabled,
            hasRoomPin: enabled && !!roomPin,
            roomPin,
            masterToken
        };
    }

    return {
        isEnabled,
        setEnabled,
        getRoomPin,
        setRoomPin,
        getMasterToken,
        setMasterToken,
        verifyMaster,
        verifyPlayerPin,
        getClientInfo,
        getMasterInfo
    };
}

module.exports = {
    createSecurityManager,
    generatePin,
    generateToken
};
