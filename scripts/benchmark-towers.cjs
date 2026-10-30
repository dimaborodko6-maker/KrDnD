const { performance } = require('node:perf_hooks');
const harness = require('../tests/helpers/game-harness.cjs');

const SCENARIOS = [
    { size: 16, towers: 8, enemies: 30 },
    { size: 40, towers: 80, enemies: 500 }
];

function createScenario(api, { size, towers, enemies }) {
    const g = api.game(), state = g.state, middle = Math.floor(size / 2);
    state.gridWidth = state.gridHeight = size;
    state.grid = Array.from({ length: size }, (_, y) =>
        Array.from({ length: size }, (_, x) => ({ x, y, type: 'grass' })));
    const types = ['archer_ranger', 'archer_musketeer', 'mage_arcane', 'mage_sorcerer', 'bombard_bertha', 'bombard_tesla'];
    const positions = [];
    for (let y = middle - 2; y <= middle + 2; y++) {
        for (let x = 1; x < size - 1; x++) positions.push({ x, y });
    }
    for (let i = 0; i < towers; i++) {
        const { x, y } = positions[i], type = types[i % types.length];
        state.grid[y][x] = { x, y, type, upgrades: (api.data.towers[type].upgrades || []).map(upgrade => upgrade.id) };
    }
    // Живучие неподвижные цели оставляют нагрузку стабильной между измерениями.
    for (let i = 0; i < enemies; i++) g.enemy(i + 1, 1 + i % (size - 2), middle,
        { hp: 1e12, maxHp: 1e12, armor: 30, magicRes: 20, isMiniBoss: true, traits: {} });
    return {
        state,
        run() {
            state.roundCounter = (state.roundCounter || 0) + 1;
            state.napalmPuddles = [];
            g.fireTowers(size - 1, middle);
        }
    };
}

function measure(scenario, samples = 200) {
    for (let i = 0; i < 40; i++) scenario.run();
    const times = [];
    for (let i = 0; i < samples; i++) {
        const start = performance.now();
        scenario.run();
        times.push(performance.now() - start);
    }
    times.sort((a, b) => a - b);
    return {
        medianMs: +times[Math.floor(samples / 2)].toFixed(3),
        p95Ms: +times[Math.floor(samples * 0.95)].toFixed(3)
    };
}

if (require.main === module) {
    console.log('Only logged tower attack phases are measured; movement, networking and rendering are excluded.');
    for (const config of SCENARIOS) console.log(JSON.stringify({ ...config, ...measure(createScenario(harness, config)) }));
}

module.exports = { SCENARIOS, createScenario, measure };
