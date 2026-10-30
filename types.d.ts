/**
 * Kr6DnD TypeScript Definition File
 * Предоставляет полную типизацию состояния игры, сущностей, башен и команд.
 * Автоматически подхватывается VSCode и языковым сервером TypeScript.
 */

export interface HeroStats {
    str: number;
    dex: number;
    con: number;
    int: number;
    wis: number;
    cha: number;
}

export interface PlayerHero {
    name: string;
    heroName: string;
    heroKey: 'gerald' | 'zefira' | 'malik' | 'bolin' | 'connor' | 'illiana' | 'torghar' | 'ratchet' | string;
    sen?: string;
    hp: number;
    maxHp: number;
    mana: number;
    maxMana: number;
    armor: number;
    speed: number;
    speedBonus?: number;
    speedBonusRounds?: number;
    range: number;
    blockLimit: number;
    blockedEnemyIds: number[];
    godDamageOverride: number | null;
    x: number;
    y: number;
    hasMovedThisRound: boolean;
    hasAttackedThisRound: boolean;
    isReady: boolean;
    fatedUsedThisWave: boolean;
    bolinShotCount?: number;
    grailConsumed?: boolean;
    deathTimer: number;
    stats: HeroStats;
    skills: string[];
    cooldowns: Record<string, number>;
    initiative?: number;
    invulnerableRounds?: number;
    shieldWallRounds?: number;
    shieldWallArmorBonus?: number;
    blockLimitBeforeUltimate?: number;
    shieldHp?: number;
    retributionShield?: number;
    parryRounds?: number;
    parryDamage?: number;
    naniteCloudRounds?: number;
    frostSlowUntilRound?: number;
}

export interface EnemyTraits {
    shield?: { maxHp: number; rechargePerRound: number; currentHp?: number };
    berserk?: { hpThreshold: number; damageBonus: number; active?: boolean };
    commander?: { auraBonus: number; range: number };
    regeneration?: { hpPerRound: number };
    healing?: { healAmount: number; range: number; cooldown: number; currentCooldown?: number };
    summoning?: { type: string; count: number; cooldown: number; currentCooldown?: number };
    [key: string]: any;
}

export interface EnemyUnit {
    id: number;
    type: string;
    name: string;
    hp: number;
    maxHp: number;
    speed: number;
    baseSpeed: number;
    armor: number;
    magicRes: number;
    isFlying?: boolean;
    isRanged?: boolean;
    range?: number;
    reward: number;
    meleeDmg: number;
    rangedDmg: number;
    livesTaken: number;
    dodgeChance: number;
    x: number;
    y: number;
    stunTurns: number;
    slowTurns: number;
    bleedTurns: number;
    bleedDmg: number;
    poisonTurns?: number;
    poisonDmg?: number;
    polymorphTurns?: number;
    isPolymorphed?: boolean;
    oldArmor?: number;
    shieldHp?: number;
    traits?: EnemyTraits;
    isBoss?: boolean;
    isMiniBoss?: boolean;
    aoeCleave?: boolean;
    hasDismounted?: boolean;
    escapedToCastle?: boolean;
    lastAttackerId?: string;
    hasDisadvantage?: boolean;
    executeThreshold?: number;
    summonGeneration?: number;
    summonedBy?: number;
    eventKind?: 'goldenGoblin' | 'goblinTower' | 'ritualTotem';
    eventStructure?: boolean;
    eventId?: string;
    eventSummoner?: string;
}

export interface SoldierUnit {
    id: string;
    towerKey: string;
    towerType: string;
    soldierIndex: number;
    name?: string;
    x: number;
    y: number;
    hp: number;
    maxHp: number;
    armor: number;
    dmg: number;
    respawnTimer: number;
    blockedEnemyIds: number[];
    inMine?: boolean;
    isSkeleton?: boolean;
    isBoneKnight?: boolean;
    isGolem?: boolean;
    blockLimit?: number;
    initiative?: number;
    lastSurpriseRound?: number;
}

export interface GridCell {
    x: number;
    y: number;
    type: string; // 'empty' | 'road' | 'spawn' | 'castle' | 'slot' | towerType
    investedGold?: number;
    upgrades?: string[];
    rallyPoint?: { x: number; y: number };
    damageBuffTurns?: number;
    damageBuffMultiplier?: number;
    lastArcaneDeathRound?: number;
    lastSniperRound?: number;
}

export interface PendingSpawn {
    type: string;
    x: number;
    y: number;
    round: number;
}

export interface Mine {
    x: number;
    y: number;
    damage: number;
    ownerName?: string;
}

export interface NapalmPuddle {
    x: number;
    y: number;
    dmg: number;
    turns: number;
}

export interface PoisonPuddle {
    x: number;
    y: number;
    dmg: number;
    turns: number;
}

export interface CombatEvent {
    id?: string | number;
    type: 'damage' | 'heal' | 'shield';
    unitId: number | string;
    amount: number;
    x: number;
    y: number;
    source?: string;
}

export interface ActionLogEntry {
    id: number;
    text: string;
    undoData?: any;
}

export interface DemolishVote {
    towerX: number;
    towerY: number;
    towerType: string;
    towerName: string;
    initiator: string;
    refundGold: number;
    votes: Record<string, boolean>;
}

export interface RosterVote {
    initiator: string;
    proposedTypes: string[];
    votes: Record<string, boolean>;
}

export interface GameState {
    activeEvents?: ActivatedCombatEvent[];
    activatedEventSequence?: number;
    gold: number;
    wave: number;
    phase: 'player' | 'wave';
    gamePeriod: 'preparation' | 'game';
    availableTowerTypes: string[];
    baseHp: number;
    gridWidth: number;
    gridHeight: number;
    grid: GridCell[][];
    players: Record<string, PlayerHero>;
    enemies: EnemyUnit[];
    pendingSpawns: PendingSpawn[];
    mines: Mine[];
    napalmPuddles: NapalmPuddle[];
    poisonPuddles: PoisonPuddle[];
    recentCombatFx: any[];
    soldiers: SoldierUnit[];
    demolishVote: DemolishVote | null;
    rosterVote: RosterVote | null;
    actionLogs: ActionLogEntry[];
    debugLogs: string[];
    roundCounter?: number;
    sceneMaster?: any;
    adventureMaster?: any;
    masterUndo?: { id: number; label: string; snapshot?: string } | null;
}

export type ActivatedEventKind = 'frost' | 'goldenGoblin' | 'sandstorm' | 'goblinTower' | 'bombardment' | 'ritualTotem' | 'banner' | 'chainLightning';

export interface ActivatedEventConfig {
    kind: ActivatedEventKind;
    title?: string;
    x?: number;
    y?: number;
    radius?: number;
    duration?: number;
    damage?: number;
    damageType?: 'physical' | 'magic' | 'true';
    side?: 'all' | 'heroes' | 'enemies';
    hp?: number;
    speed?: number;
    reward?: number;
    dc?: number;
    playerNames?: string[];
    results?: Record<string, 'pass' | 'fail'>;
    interval?: number;
    maxAlive?: number;
    enemyType?: string;
    count?: number;
    summonReward?: number;
    spawnX?: number;
    spawnY?: number;
    delay?: number;
    areas?: Array<{ x: number; y: number }>;
    buff?: 'damage' | 'armor' | 'speed';
    bonus?: number;
    sourceId?: string;
    target?: { kind: 'player' | 'enemy' | 'soldier'; id: string };
}

export interface ActivatedEventPreset extends ActivatedEventConfig {
    id: string;
    title: string;
}

export interface ActivatedCombatEvent {
    id: string;
    kind: ActivatedEventKind;
    title: string;
    config: ActivatedEventConfig;
    createdRound: number;
    expiresRound?: number;
    nextRound?: number;
    entityId?: number;
}
