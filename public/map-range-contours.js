'use strict';

const MAP_RANGE_CONTOURS = (() => {
    function dimensions(columns, rows, { cellSize = 80, gap = 2, padding = 0 } = {}) {
        return { width: columns * (cellSize + gap) - gap + padding * 2,
            height: rows * (cellSize + gap) - gap + padding * 2 };
    }
    function path(cellKeys, columns, rows, { cellSize = 80, gap = 2, padding = 0 } = {}) {
        const step = cellSize + gap;
        const width = columns * step - gap, height = rows * step - gap;
        const segments = [];
        for (const key of cellKeys) {
            const [x, y] = key.split(',').map(Number);
            const left = padding + Math.max(0, x * step - gap / 2);
            const right = padding + Math.min(width, (x + 1) * step - gap / 2);
            const top = padding + Math.max(0, y * step - gap / 2);
            const bottom = padding + Math.min(height, (y + 1) * step - gap / 2);
            if (!cellKeys.has(x + ',' + (y - 1))) segments.push('M' + left + ' ' + top + 'H' + right);
            if (!cellKeys.has((x + 1) + ',' + y)) segments.push('M' + right + ' ' + top + 'V' + bottom);
            if (!cellKeys.has(x + ',' + (y + 1))) segments.push('M' + right + ' ' + bottom + 'H' + left);
            if (!cellKeys.has((x - 1) + ',' + y)) segments.push('M' + left + ' ' + bottom + 'V' + top);
        }
        return segments.join(' ');
    }
    function render(document, grid, paths, columns, rows, options) {
        let overlay = grid.querySelector('.range-contours');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.className = 'range-contours';
            overlay.setAttribute('aria-hidden', 'true');
            grid.appendChild(overlay);
        }
        const escape = value => String(value || '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
        const content = paths.filter(entry => entry.path).map(entry => '<path class="range-outline tone-' + escape(entry.tone) + ' ' + escape(entry.classes) + '" d="' + escape(entry.path) + '"/>').join('');
        const { width, height } = dimensions(columns, rows, options);
        overlay.innerHTML = content ? '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + width + ' ' + height + '" focusable="false">' + content + '</svg>' : '';
    }
    return { dimensions, path, render };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = MAP_RANGE_CONTOURS;
else window.MAP_RANGE_CONTOURS = MAP_RANGE_CONTOURS;
