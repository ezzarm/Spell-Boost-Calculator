/* ============================================================
   HERO EQUIPMENT ORE DATA
   Registry + per-level cost tables. No UI code lives here.

   Every cost row is the cost of the upgrade TO that level
   (destination level), not a cumulative total. Level 1 is the
   starting level and has no upgrade cost.

   Loads in the browser (window.OreData) and in Node (require).
   ============================================================ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.OreData = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var VERSION = '2026-10';

  /* ---------- provenance ----------
     Status is deliberately conservative: these are community tables that
     agree with each other and with the published maximum-level totals.
     They have NOT been checked against the live game client. */
  var META = {
    version: VERSION,
    retrievedOn: '2026-10-12',
    status: 'Community-sourced per-level tables, cross-checked against each other and against published maximum-level totals. Not verified against the live game.',
    sources: [
      { label: 'Clash Guides with Dusk, Hero Equipment Upgrade Chart', url: 'https://clashguideswithdusk.net/2024/05/hero-equipment-upgrade-chart-clash-of-clans', covers: 'Common 2-18; Epic 2-27 (most rows)' },
      { label: 'Media Referee, All Hero Equipment Upgrade Costs', url: 'https://mediareferee.com/all-clash-of-clans-hero-equipment-upgrade/', covers: 'Common 2-18; Epic 2-12, 19-27' },
      { label: 'The Nerd Stash, All Hero Equipment Upgrade Costs', url: 'https://thenerdstash.com/all-hero-equipment-upgrade-costs-in-clash-of-clans/', covers: 'Epic 22-27' },
      { label: 'Clash Daddy, Upgrade Cost & Max Levels', url: 'https://clashdaddy.com/clash-of-clans-hero-equipment-upgrade-cost-chart', covers: 'Common 2-18; Epic 2-8, 25-27' },
      { label: 'Mein-MMO, Hero Equipment Levels & Costs', url: 'https://mein-mmo.de/en/clash-of-clans-heroes-equipment-levels-costs-and-what-you-need-to-know,1115218/', covers: 'Common 2-18; Epic 2-19, 21-22, 27' },
      { label: 'Clash of Clans Wiki, Ore Calculations (cumulative checkpoints)', url: 'https://clashofclans.fandom.com/wiki/Ore_Calculations', covers: 'Cumulative Shiny/Glowy/Starry used as independent checkpoints' },
      { label: 'ClashOS, Hero Equipment Tier List (Aug 2026)', url: 'https://www.clashos.in/guides/hero-equipment-tier-list.html', covers: 'Maximum-level totals, Starry milestones, roster and rarity' },
      { label: 'Clash of Clans Wiki, Hero Equipment', url: 'https://clashofclans.fandom.com/wiki/Hero_Equipment', covers: 'Hero-to-equipment assignment' },
      { label: 'Supercell, Introducing Hero Equipment', url: 'https://supercell.com/en/games/clashofclans/blog/news/introducing-hero-equipment', covers: 'Ore roles; Epic equipment upgradable to level 27' },
      { label: 'Supercell, More Ore for Your Gems (Oct 2026)', url: 'https://supercell.com/en/games/clashofclans/blog/news/more-ore-for-your-gems/', covers: 'Gem prices for ore only; does not change per-level requirements' }
    ],
    notes: [
      'Per-level rows were cross-checked against four or more independent tables; every level has at least two agreeing sources.',
      'Sums match the published maximum-level totals: Common 1-18 = 27,260 Shiny / 1,920 Glowy; Epic 1-27 = 56,060 / 3,720 / 480.',
      'Supercell\'s Oct 2026 ore announcement changes Gem and Medal prices for ore, not the ore each level requires. Supercell has said more ore-economy news is coming later in October; recheck after it.',
      'ClashOS lists an aggregate row "L1 to L9: 1,680 Shiny / 120 Glowy" that does not match its own per-level values (levels 2-8 sum to 4,760 Shiny / 120 Glowy). The per-level tables above were used instead; the discrepancy is noted, not corrected.',
      'Hero assignments agree between the Clash of Clans Wiki and ClashOS. Rarity comes from ClashOS (Aug 2026) and is not independently confirmed in-game. Monolith Arrow is classed Epic (released as an Epic in the Anime Fury Medal Event, 4 Jun 2026).',
      'All pieces of the same rarity share one cost curve in every source consulted. If a piece ever diverges, add an item-level cost override rather than editing the shared curve.'
    ],
    // Levels whose cost could not be confirmed. Empty = every level has agreeing sources.
    unverified: []
  };

  var ORE_TYPES = ['shiny', 'glowy', 'starry'];
  var ORE_LABELS = { shiny: 'Shiny Ore', glowy: 'Glowy Ore', starry: 'Starry Ore' };

  var RARITIES = {
    common: { label: 'Common', maxLevel: 18 },
    epic:   { label: 'Epic',   maxLevel: 27 }
  };

  /* Cross-check totals for 1 -> max, per rarity. */
  var BASELINE_TOTALS = {
    common: { shiny: 27260, glowy: 1920, starry: 0 },
    epic:   { shiny: 56060, glowy: 3720, starry: 480 }
  };

  /* ---------- per-level costs ----------
     Row format: [destinationLevel, shiny, glowy, starry] */
  var COMMON_ROWS = [
    [2, 120, 0, 0],
    [3, 240, 20, 0],
    [4, 400, 0, 0],
    [5, 600, 0, 0],
    [6, 840, 100, 0],
    [7, 1120, 0, 0],
    [8, 1440, 0, 0],
    [9, 1800, 200, 0],
    [10, 1900, 0, 0],
    [11, 2000, 0, 0],
    [12, 2100, 400, 0],
    [13, 2200, 0, 0],
    [14, 2300, 0, 0],
    [15, 2400, 600, 0],
    [16, 2500, 0, 0],
    [17, 2600, 0, 0],
    [18, 2700, 600, 0]
  ];

  var EPIC_ROWS = [
    [2, 120, 0, 0],
    [3, 240, 20, 0],
    [4, 400, 0, 0],
    [5, 600, 0, 0],
    [6, 840, 100, 0],
    [7, 1120, 0, 0],
    [8, 1440, 0, 0],
    [9, 1800, 200, 10],
    [10, 1900, 0, 0],
    [11, 2000, 0, 0],
    [12, 2100, 400, 20],
    [13, 2200, 0, 0],
    [14, 2300, 0, 0],
    [15, 2400, 600, 30],
    [16, 2500, 0, 0],
    [17, 2600, 0, 0],
    [18, 2700, 600, 50],
    [19, 2800, 0, 0],
    [20, 2900, 0, 0],
    [21, 3000, 600, 100],
    [22, 3100, 0, 0],
    [23, 3200, 0, 0],
    [24, 3300, 600, 120],
    [25, 3400, 0, 0],
    [26, 3500, 0, 0],
    [27, 3600, 600, 150]
  ];

  function buildCostTable(rows) {
    var table = {};
    rows.forEach(function (r) {
      if (table[r[0]]) throw new Error('Duplicate cost row for level ' + r[0]);
      table[r[0]] = Object.freeze({ shiny: r[1], glowy: r[2], starry: r[3] });
    });
    return Object.freeze(table);
  }

  var ORE_COSTS = Object.freeze({
    common: buildCostTable(COMMON_ROWS),
    epic: buildCostTable(EPIC_ROWS)
  });

  /* ---------- registry ----------
     Canonical ids are used everywhere: registry, presets, state, tests.
     maxLevel comes from the rarity, so it is stated once.
     defaultTarget is the user-supplied preset; it is editable config. */
  var HEROES = [
    { id: 'dragonDuke',    name: 'Dragon Duke' },
    { id: 'barbarianKing', name: 'Barbarian King' },
    { id: 'minionPrince',  name: 'Minion Prince' },
    { id: 'grandWarden',   name: 'Grand Warden' },
    { id: 'archerQueen',   name: 'Archer Queen' },
    { id: 'royalChampion', name: 'Royal Champion' }
  ];

  var EQUIPMENT = [
    // Dragon Duke
    { id: 'fireHeart',       name: 'Fire Heart',       hero: 'dragonDuke',    rarity: 'common', defaultTarget: 15 },
    { id: 'revengeDeck',     name: 'Revenge Deck',     hero: 'dragonDuke',    rarity: 'epic',   defaultTarget: 18 },
    { id: 'rocketBackpack',  name: 'Rocket Backpack',  hero: 'dragonDuke',    rarity: 'epic',   defaultTarget: 24 },
    { id: 'electroFangs',    name: 'Electro Fangs',    hero: 'dragonDuke',    rarity: 'common', defaultTarget: 15 },
    { id: 'stunBlaster',     name: 'Stun Blaster',     hero: 'dragonDuke',    rarity: 'common', defaultTarget: 12 },
    // Barbarian King
    { id: 'spikyBall',       name: 'Spiky Ball',       hero: 'barbarianKing', rarity: 'epic',   defaultTarget: 18 },
    { id: 'snakeBracelet',   name: 'Snake Bracelet',   hero: 'barbarianKing', rarity: 'epic',   defaultTarget: 21 },
    { id: 'stickHorse',      name: 'Stick Horse',      hero: 'barbarianKing', rarity: 'epic',   defaultTarget: 18 },
    { id: 'giantGauntlet',   name: 'Giant Gauntlet',   hero: 'barbarianKing', rarity: 'epic',   defaultTarget: 18 },
    { id: 'earthquakeBoots', name: 'Earthquake Boots', hero: 'barbarianKing', rarity: 'common', defaultTarget: 6 },
    // Minion Prince
    { id: 'darkOrb',         name: 'Dark Orb',         hero: 'minionPrince',  rarity: 'common', defaultTarget: 15 },
    { id: 'meteorStaff',     name: 'Meteor Staff',     hero: 'minionPrince',  rarity: 'epic',   defaultTarget: 21 },
    { id: 'darkCrown',       name: 'Dark Crown',       hero: 'minionPrince',  rarity: 'epic',   defaultTarget: 21 },
    // Grand Warden
    { id: 'lifeGem',         name: 'Life Gem',         hero: 'grandWarden',   rarity: 'common', defaultTarget: 12 },
    { id: 'eternalTome',     name: 'Eternal Tome',     hero: 'grandWarden',   rarity: 'common', defaultTarget: 12 },
    { id: 'healingTome',     name: 'Healing Tome',     hero: 'grandWarden',   rarity: 'common', defaultTarget: 12 },
    { id: 'rageGem',         name: 'Rage Gem',         hero: 'grandWarden',   rarity: 'common', defaultTarget: 15 },
    { id: 'fireball',        name: 'Fireball',         hero: 'grandWarden',   rarity: 'epic',   defaultTarget: 24 },
    { id: 'heroicTorch',     name: 'Heroic Torch',     hero: 'grandWarden',   rarity: 'epic',   defaultTarget: 18 },
    // Archer Queen
    { id: 'actionFigure',    name: 'Action Figure',    hero: 'archerQueen',   rarity: 'epic',   defaultTarget: 21 },
    { id: 'giantArrow',      name: 'Giant Arrow',      hero: 'archerQueen',   rarity: 'common', defaultTarget: 6 },
    { id: 'magicMirror',     name: 'Magic Mirror',     hero: 'archerQueen',   rarity: 'epic',   defaultTarget: 18 },
    { id: 'healerPuppet',    name: 'Healer Puppet',    hero: 'archerQueen',   rarity: 'common', defaultTarget: 15 },
    { id: 'monolithArrow',   name: 'Monolith Arrow',   hero: 'archerQueen',   rarity: 'epic',   defaultTarget: 3 },
    // Royal Champion
    { id: 'rocketSpear',     name: 'Rocket Spear',     hero: 'royalChampion', rarity: 'epic',   defaultTarget: 18 },
    { id: 'seekingShield',   name: 'Seeking Shield',   hero: 'royalChampion', rarity: 'common', defaultTarget: 15 },
    { id: 'electroBoots',    name: 'Electro Boots',    hero: 'royalChampion', rarity: 'epic',   defaultTarget: 15 }
  ];

  return Object.freeze({
    VERSION: VERSION,
    META: META,
    ORE_TYPES: ORE_TYPES,
    ORE_LABELS: ORE_LABELS,
    RARITIES: RARITIES,
    BASELINE_TOTALS: BASELINE_TOTALS,
    ORE_COSTS: ORE_COSTS,
    HEROES: HEROES,
    EQUIPMENT: EQUIPMENT
  });
});
