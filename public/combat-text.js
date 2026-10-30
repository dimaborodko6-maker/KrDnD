(function(root) {
    'use strict';
    function install(layer, { cellSize = 80, gap = 2, random = Math.random } = {}) {
        let lastId = 0;
        function clear() { layer.replaceChildren(); }
        function show(events, state) {
            const counts = new Map();
            for (const event of events || []) {
                if (!Number.isSafeInteger(event.id) || event.id <= lastId) continue;
                lastId = event.id;
                if (!['damage', 'heal'].includes(event.kind) || !['player', 'soldier', 'enemy'].includes(event.targetKind) ||
                    !Number.isFinite(event.amount) || event.amount <= 0 || !Number.isInteger(event.x) || !Number.isInteger(event.y) ||
                    event.x < 0 || event.y < 0 || event.x >= (state.gridWidth || state.grid[0].length) ||
                    event.y >= (state.gridHeight || state.grid.length)) continue;
                const cell = document.createElement('div');
                cell.className = 'combat-text-cell';
                cell.style.left = event.x * (cellSize + gap) + 'px';
                cell.style.top = event.y * (cellSize + gap) + 'px';
                cell.style.width = cell.style.height = cellSize + 'px';
                const number = document.createElement('span');
                number.className = 'combat-number ' + (event.targetKind === 'enemy' ? 'combat-enemy' : 'combat-ally') + ' combat-' + event.kind;
                number.textContent = (event.targetKind === 'enemy' ? '◆ ' : '● ') +
                    (event.kind === 'heal' ? '+' : '−') + Number(event.amount.toFixed(1));
                cell.appendChild(number);
                layer.appendChild(cell);
                const width = number.offsetWidth, height = number.offsetHeight;
                number.style.left = (2 + random() * Math.max(0, cellSize - width - 4)) + 'px';
                number.style.top = (24 + random() * Math.max(0, cellSize - height - 26)) + 'px';
                const key = event.x + ',' + event.y;
                const index = counts.get(key) || 0;
                counts.set(key, index + 1);
                number.style.animationDelay = (index % 5) * 90 + 'ms';
                number.addEventListener('animationend', () => cell.remove(), { once: true });
                // Страховка для фоновых вкладок и отключённой анимации.
                setTimeout(() => cell.remove(), 1800);
                while (layer.children.length > 300) layer.firstElementChild.remove();
            }
        }
        return { show, clear };
    }
    root.COMBAT_TEXT = { install };
    if (typeof module !== 'undefined') module.exports = root.COMBAT_TEXT;
})(typeof window !== 'undefined' ? window : globalThis);
