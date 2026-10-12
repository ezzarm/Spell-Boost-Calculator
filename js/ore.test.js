'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

const OreData = require('../ore/data.js');
const { createCalculator, OreCalcError } = require('../ore/calc.js');

const calc = createCalculator(OreData);
const item = (id) => calc.getEquipment(id);
const ZERO = { shiny: 0, glowy: 0, starry: 0 };

/* ------------------------------------------------------------------
   Dataset integrity
   ------------------------------------------------------------------ */
test('data: every destination level has exactly one valid entry', () => {
  const result = calc.validateCostTables();
  assert.deepEqual(result.problems, []);
  assert.equal(result.ok, true);
});

test('data: level coverage is 2..18 (common) and 2..27 (epic)', () => {
  assert.deepEqual(Object.keys(OreData.ORE_COSTS.common).map(Number), range(2, 18));
  assert.deepEqual(Object.keys(OreData.ORE_COSTS.epic).map(Number), range(2, 27));
});

test('data: 1 -> max sums match the published baseline totals', () => {
  for (const rarity of ['common', 'epic']) {
    const rows = Object.values(OreData.ORE_COSTS[rarity]);
    const sum = { shiny: 0, glowy: 0, starry: 0 };
    rows.forEach((r) => { sum.shiny += r.shiny; sum.glowy += r.glowy; sum.starry += r.starry; });
    assert.deepEqual(sum, OreData.BASELINE_TOTALS[rarity], rarity);
  }
});

test('data: Epic cumulative sums match independent wiki checkpoints', () => {
  // Cumulative Shiny from Clash of Clans Wiki "Ore Calculations" (a separate source).
  const wikiShiny = { 3: 360, 4: 760, 5: 1360, 6: 2200, 7: 3320, 8: 4760, 9: 6560, 10: 8460,
    11: 10460, 12: 12560, 13: 14760, 14: 17060, 15: 19460, 25: 48960, 26: 52460, 27: 56060 };
  for (const [level, expected] of Object.entries(wikiShiny)) {
    assert.equal(calc.calculateOreCost(item('electroBoots'), 1, Number(level)).shiny, expected, 'L' + level);
  }
  // Cumulative Glowy / Starry checkpoints from the same page.
  assert.deepEqual(pick(calc.calculateOreCost(item('electroBoots'), 1, 15), ['glowy', 'starry']), { glowy: 1320, starry: 60 });
  assert.deepEqual(pick(calc.calculateOreCost(item('electroBoots'), 1, 25), ['glowy', 'starry']), { glowy: 3120, starry: 330 });
});

test('data: level 27 Epic upgrade matches the wiki Gem figure at the old Gem prices', () => {
  // Wiki: 26 -> 27 from zero ore cost 11,850 Gems at 1 / 5 / 35 Gems per Shiny / Glowy / Starry.
  const c = calc.calculateOreCost(item('electroBoots'), 26, 27);
  assert.equal(c.shiny * 1 + c.glowy * 5 + c.starry * 35, 11850);
});

test('data: Starry Ore falls only on levels 9,12,15,18,21,24,27 for Epic', () => {
  const starryLevels = Object.entries(OreData.ORE_COSTS.epic)
    .filter(([, c]) => c.starry > 0).map(([l]) => Number(l));
  assert.deepEqual(starryLevels, [9, 12, 15, 18, 21, 24, 27]);
  assert.deepEqual(Object.values(OreData.ORE_COSTS.epic).map((c) => c.starry).filter(Boolean),
    [10, 20, 30, 50, 100, 120, 150]);
});

test('data: no cost is flagged unverified, and provenance fields are present', () => {
  assert.deepEqual(OreData.META.unverified, []);
  assert.equal(OreData.META.version, OreData.VERSION);
  assert.match(OreData.META.retrievedOn, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(OreData.META.status, /Not verified against the live game/);
  assert.ok(OreData.META.sources.length >= 3);
});

test('registry: ids unique, heroes valid, rarities valid, 27 items', () => {
  const ids = OreData.EQUIPMENT.map((e) => e.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(ids.length, 27);
  const heroIds = new Set(OreData.HEROES.map((h) => h.id));
  OreData.EQUIPMENT.forEach((e) => {
    assert.ok(heroIds.has(e.hero), e.id + ' hero');
    assert.ok(OreData.RARITIES[e.rarity], e.id + ' rarity');
    assert.ok(e.name && e.name.length, e.id + ' name');
  });
});

test('registry: every default target is within 1..max (never silently clamped)', () => {
  OreData.EQUIPMENT.forEach((e) => {
    const max = calc.getMaxLevel(e);
    assert.ok(Number.isInteger(e.defaultTarget), e.id);
    assert.ok(e.defaultTarget >= 1 && e.defaultTarget <= max, e.id + ' target ' + e.defaultTarget + ' max ' + max);
  });
});

test('registry: default target presets match the supplied list', () => {
  const expected = {
    fireHeart: [15, 'common'], revengeDeck: [18, 'epic'], rocketBackpack: [24, 'epic'],
    electroFangs: [15, 'common'], stunBlaster: [12, 'common'],
    spikyBall: [18, 'epic'], snakeBracelet: [21, 'epic'], stickHorse: [18, 'epic'],
    giantGauntlet: [18, 'epic'], earthquakeBoots: [6, 'common'],
    darkOrb: [15, 'common'], meteorStaff: [21, 'epic'], darkCrown: [21, 'epic'],
    lifeGem: [12, 'common'], eternalTome: [12, 'common'], healingTome: [12, 'common'],
    rageGem: [15, 'common'], fireball: [24, 'epic'], heroicTorch: [18, 'epic'],
    actionFigure: [21, 'epic'], giantArrow: [6, 'common'], magicMirror: [18, 'epic'],
    healerPuppet: [15, 'common'], monolithArrow: [3, 'epic'],
    rocketSpear: [18, 'epic'], seekingShield: [15, 'common'], electroBoots: [15, 'epic']
  };
  assert.equal(Object.keys(expected).length, OreData.EQUIPMENT.length);
  OreData.EQUIPMENT.forEach((e) => {
    assert.deepEqual([e.defaultTarget, e.rarity], expected[e.id], e.id);
  });
  assert.equal(calc.getPresetTarget(item('fireHeart'), 'default'), 15);
  assert.equal(calc.getPresetTarget(item('fireHeart'), 'max'), 18);
  assert.equal(calc.getPresetTarget(item('fireball'), 'max'), 27);
});

test('registry: heroes own the expected number of items', () => {
  const count = (hero) => OreData.EQUIPMENT.filter((e) => e.hero === hero).length;
  assert.deepEqual(OreData.HEROES.map((h) => count(h.id)), [5, 5, 3, 6, 5, 3]);
});

/* ------------------------------------------------------------------
   Cost calculation
   ------------------------------------------------------------------ */
test('same-level range costs zero', () => {
  assert.deepEqual(calc.calculateOreCost(item('fireHeart'), 15, 15), ZERO);
  assert.deepEqual(calc.getUpgradeBreakdown(item('fireHeart'), 15, 15), []);
});

test('one-level upgrade uses the destination-level cost', () => {
  // 14 -> 15 is the cost OF level 15 (2400 / 600), not level 14.
  assert.deepEqual(calc.calculateOreCost(item('fireHeart'), 14, 15), { shiny: 2400, glowy: 600, starry: 0 });
  assert.deepEqual(calc.calculateOreCost(item('fireHeart'), 1, 2), { shiny: 120, glowy: 0, starry: 0 });
});

test('15 -> 18 includes only levels 16, 17 and 18', () => {
  const rows = calc.getUpgradeBreakdown(item('fireHeart'), 15, 18);
  assert.deepEqual(rows.map((r) => r.level), [16, 17, 18]);
  assert.deepEqual(calc.calculateOreCost(item('fireHeart'), 15, 18),
    { shiny: 2500 + 2600 + 2700, glowy: 600, starry: 0 });
});

test('multi-level range sums each destination level exactly once', () => {
  const rows = calc.getUpgradeBreakdown(item('spikyBall'), 5, 12);
  assert.deepEqual(rows.map((r) => r.level), [6, 7, 8, 9, 10, 11, 12]);
  const manual = rows.reduce((s, r) => ({ shiny: s.shiny + r.shiny, glowy: s.glowy + r.glowy, starry: s.starry + r.starry }), { ...ZERO });
  assert.deepEqual(calc.calculateOreCost(item('spikyBall'), 5, 12), manual);
  assert.deepEqual(manual, { shiny: 840 + 1120 + 1440 + 1800 + 1900 + 2000 + 2100, glowy: 100 + 200 + 400, starry: 10 + 20 });
});

test('common equipment never consumes Starry Ore, even at max', () => {
  const common = OreData.EQUIPMENT.filter((e) => e.rarity === 'common');
  assert.ok(common.length > 0);
  common.forEach((e) => {
    assert.equal(calc.calculateOreCost(e, 1, 18).starry, 0, e.id);
  });
  assert.deepEqual(calc.calculateOreCost(item('fireHeart'), 1, 18), { shiny: 27260, glowy: 1920, starry: 0 });
});

test('epic equipment reaches level 27 and uses Starry only at its milestones', () => {
  assert.deepEqual(calc.calculateOreCost(item('electroBoots'), 1, 27), { shiny: 56060, glowy: 3720, starry: 480 });
  assert.equal(calc.calculateOreCost(item('electroBoots'), 1, 8).starry, 0);   // before the first milestone
  assert.equal(calc.calculateOreCost(item('electroBoots'), 1, 9).starry, 10);
  assert.equal(calc.calculateOreCost(item('electroBoots'), 18, 27).starry, 370);
  assert.equal(calc.calculateOreCost(item('electroBoots'), 18, 20).starry, 0); // 19, 20 are not milestones
});

test('epic cost is not common cost scaled', () => {
  const epic = calc.calculateOreCost(item('electroBoots'), 1, 18);
  const common = calc.calculateOreCost(item('fireHeart'), 1, 18);
  assert.equal(epic.shiny, common.shiny);   // same Shiny/Glowy curve up to 18...
  assert.equal(epic.starry, 110);           // ...but Epic adds its own Starry milestones
  assert.equal(common.starry, 0);
});

/* ------------------------------------------------------------------
   Bounds and validation
   ------------------------------------------------------------------ */
test('level bounds: common max 18, epic max 27', () => {
  assert.equal(calc.getMaxLevel(item('fireHeart')), 18);
  assert.equal(calc.getMaxLevel(item('fireball')), 27);
  assert.equal(calc.validateLevelRange(item('fireHeart'), 1, 18).ok, true);
  assert.equal(calc.validateLevelRange(item('fireHeart'), 1, 19).ok, false);
  assert.equal(calc.validateLevelRange(item('fireHeart'), 19, 19).ok, false);
  assert.equal(calc.validateLevelRange(item('fireball'), 1, 27).ok, true);
  assert.equal(calc.validateLevelRange(item('fireball'), 1, 28).ok, false);
  assert.match(calc.validateLevelRange(item('fireHeart'), 1, 19).errors.target, /above 18/);
  assert.match(calc.validateLevelRange(item('fireball'), 1, 28).errors.target, /above 27/);
});

test('level bounds: current must be at least 1, target at least current', () => {
  assert.match(calc.validateLevelRange(item('fireHeart'), 0, 10).errors.current, /at least 1/);
  assert.match(calc.validateLevelRange(item('fireHeart'), -3, 10).errors.current, /at least 1/);
  assert.match(calc.validateLevelRange(item('fireHeart'), 12, 8).errors.target, /lower than the current level \(12\)/);
  assert.equal(calc.validateLevelRange(item('fireHeart'), 12, 12).ok, true);
});

test('invalid, blank, and non-numeric input is reported, not thrown or costed', () => {
  const cases = [['', '10'], ['5', ''], ['abc', '10'], ['5', 'xyz'], ['5.5', '10'], ['5', '10.2'],
    [null, null], [undefined, 5], ['1e1', '12'], [' ', '12'], [NaN, 5], [5, Infinity]];
  cases.forEach(([cur, tgt]) => {
    const v = calc.validateLevelRange(item('fireHeart'), cur, tgt);
    assert.equal(v.ok, false, JSON.stringify([cur, tgt]));
    assert.ok(Object.keys(v.errors).length > 0);
    assert.equal(v.current, null);
    assert.equal(v.target, null);
  });
  assert.match(calc.validateLevelRange(item('fireHeart'), '', '10').errors.current, /Enter the current level/);
  assert.match(calc.validateLevelRange(item('fireHeart'), '5', '').errors.target, /Enter a target level/);
  assert.match(calc.validateLevelRange(item('fireHeart'), '5.5', '10').errors.current, /whole number/);
});

test('numeric strings with whitespace are accepted', () => {
  const v = calc.validateLevelRange(item('fireHeart'), ' 3 ', '7');
  assert.equal(v.ok, true);
  assert.equal(v.current, 3);
  assert.equal(v.target, 7);
});

test('calculateOreCost throws a typed error for an invalid range', () => {
  assert.throws(() => calc.calculateOreCost(item('fireHeart'), 15, 10), (e) => e instanceof OreCalcError && e.code === 'INVALID_RANGE');
  assert.throws(() => calc.calculateOreCost(item('fireHeart'), 1, 30), (e) => e.code === 'INVALID_RANGE');
  assert.throws(() => calc.calculateOreCost(item('fireHeart'), 'x', 5), (e) => e.code === 'INVALID_RANGE');
});

test('unknown equipment id throws', () => {
  assert.throws(() => calc.getEquipment('nope'), (e) => e.code === 'UNKNOWN_EQUIPMENT');
});

/* ------------------------------------------------------------------
   Missing cost data
   ------------------------------------------------------------------ */
test('missing cost data is an error and is never counted as zero', () => {
  const broken = JSON.parse(JSON.stringify(OreData));
  delete broken.ORE_COSTS.common[10];
  const c = createCalculator(broken);
  const fh = c.getEquipment('fireHeart');
  assert.throws(() => c.calculateOreCost(fh, 8, 12), (e) => e.code === 'MISSING_COST_DATA' && /Fire Heart, level 10/.test(e.message));
  // A range that avoids the gap still works.
  assert.deepEqual(c.calculateOreCost(fh, 10, 12), { shiny: 2000 + 2100, glowy: 400, starry: 0 });
  assert.equal(c.validateCostTables().ok, false);
  assert.ok(c.validateCostTables().problems.some((p) => /missing level 10/.test(p)));
});

test('malformed cost entries (negative, fractional, text, missing ore) are rejected', () => {
  for (const bad of [{ shiny: -1, glowy: 0, starry: 0 }, { shiny: 1.5, glowy: 0, starry: 0 },
    { shiny: '100', glowy: 0, starry: 0 }, { shiny: 100, glowy: 0 }]) {
    const broken = JSON.parse(JSON.stringify(OreData));
    broken.ORE_COSTS.epic[12] = bad;
    const c = createCalculator(broken);
    assert.throws(() => c.getLevelCost(c.getEquipment('electroBoots'), 12), (e) => e.code === 'MISSING_COST_DATA');
    assert.equal(c.validateCostTables().ok, false);
  }
});

test('integrity check flags Starry Ore on a common level and unexpected levels', () => {
  const broken = JSON.parse(JSON.stringify(OreData));
  broken.ORE_COSTS.common[5].starry = 5;
  broken.ORE_COSTS.common[19] = { shiny: 1, glowy: 0, starry: 0 };
  const problems = createCalculator(broken).validateCostTables().problems;
  assert.ok(problems.some((p) => /common L5: Starry Ore must be 0/.test(p)));
  assert.ok(problems.some((p) => /unexpected level 19/.test(p)));
});

test('plan: a data gap in one item is reported on that item and excluded from totals', () => {
  const broken = JSON.parse(JSON.stringify(OreData));
  delete broken.ORE_COSTS.epic[20];
  const c = createCalculator(broken);
  const plan = c.calculatePlan([
    { uid: 1, equipmentId: 'electroBoots', current: '18', target: '22' },
    { uid: 2, equipmentId: 'fireHeart', current: '1', target: '3' }
  ]);
  assert.equal(plan.items[0].ok, false);
  assert.match(plan.items[0].dataError, /level 20/);
  assert.equal(plan.items[1].ok, true);
  assert.deepEqual(plan.combined, { shiny: 120 + 240, glowy: 20, starry: 0 });
  assert.equal(plan.invalidCount, 1);
});

/* ------------------------------------------------------------------
   Inventory
   ------------------------------------------------------------------ */
test('inventory deficit = max(0, required - owned); surplus = max(0, owned - required)', () => {
  const required = { shiny: 1000, glowy: 50, starry: 10 };
  const r = calc.compareInventory(required, { shiny: '400', glowy: '50', starry: '25' });
  assert.deepEqual(pick(r.shiny, ['deficit', 'surplus']), { deficit: 600, surplus: 0 });
  assert.deepEqual(pick(r.glowy, ['deficit', 'surplus']), { deficit: 0, surplus: 0 });
  assert.deepEqual(pick(r.starry, ['deficit', 'surplus']), { deficit: 0, surplus: 15 });
  ['shiny', 'glowy', 'starry'].forEach((ore) => {
    assert.equal(r[ore].deficit, Math.max(0, required[ore] - r[ore].owned));
    assert.equal(r[ore].surplus, Math.max(0, r[ore].owned - required[ore]));
  });
});

test('inventory: blank counts as 0; negative and non-numeric are errors', () => {
  const required = { shiny: 100, glowy: 0, starry: 0 };
  const r = calc.compareInventory(required, { shiny: '', glowy: '-5', starry: 'abc' });
  assert.equal(r.shiny.owned, 0);
  assert.equal(r.shiny.deficit, 100);
  assert.ok(r.glowy.error);
  assert.equal(r.glowy.deficit, null);
  assert.ok(r.starry.error);
  assert.equal(calc.compareInventory(required, { shiny: '1.5', glowy: '', starry: '' }).shiny.error !== null, true);
});

/* ------------------------------------------------------------------
   Plan totals
   ------------------------------------------------------------------ */
test('combined totals equal the sum of the individual totals', () => {
  const plan = calc.calculatePlan([
    { uid: 1, equipmentId: 'fireHeart', current: '1', target: '15' },
    { uid: 2, equipmentId: 'revengeDeck', current: '9', target: '18' },
    { uid: 3, equipmentId: 'electroBoots', current: '15', target: '24' },
    { uid: 4, equipmentId: 'monolithArrow', current: '1', target: '3' }
  ]);
  const manual = plan.items.reduce((s, i) => ({
    shiny: s.shiny + i.total.shiny, glowy: s.glowy + i.total.glowy, starry: s.starry + i.total.starry }), { ...ZERO });
  assert.deepEqual(plan.combined, manual);
  assert.equal(plan.validCount, 4);
  assert.equal(plan.invalidCount, 0);
  assert.deepEqual(plan.items[0].total, calc.calculateOreCost(item('fireHeart'), 1, 15));
  assert.deepEqual(plan.items[3].total, { shiny: 120 + 240, glowy: 20, starry: 0 });
});

test('plan: invalid rows are excluded from the combined total and counted', () => {
  const plan = calc.calculatePlan([
    { uid: 1, equipmentId: 'fireHeart', current: '1', target: '3' },
    { uid: 2, equipmentId: 'fireHeart', current: '10', target: '5' },
    { uid: 3, equipmentId: 'darkOrb', current: '', target: '5' }
  ]);
  assert.equal(plan.validCount, 1);
  assert.equal(plan.invalidCount, 2);
  assert.deepEqual(plan.combined, { shiny: 360, glowy: 20, starry: 0 });
  assert.equal(plan.items[1].ok, false);
  assert.ok(plan.items[1].errors.target);
  assert.ok(plan.items[2].errors.current);
});

test('plan: empty plan returns zeroes', () => {
  const plan = calc.calculatePlan([]);
  assert.deepEqual(plan.combined, ZERO);
  assert.equal(plan.validCount, 0);
});

test('recalculating after a level change updates totals and breakdowns', () => {
  const entries = [{ uid: 1, equipmentId: 'eternalTome', current: '1', target: '12' }];
  const before = calc.calculatePlan(entries);
  entries[0].current = '9';
  const after = calc.calculatePlan(entries);
  assert.notDeepEqual(after.combined, before.combined);
  assert.equal(before.items[0].breakdown.length, 11);
  assert.equal(after.items[0].breakdown.length, 3);
  assert.deepEqual(after.items[0].breakdown.map((r) => r.level), [10, 11, 12]);
  assert.deepEqual(after.combined, { shiny: 1900 + 2000 + 2100, glowy: 400, starry: 0 });
});

test('per-item breakdown rows sum to the item total', () => {
  const plan = calc.calculatePlan([{ uid: 1, equipmentId: 'rocketBackpack', current: '3', target: '24' }]);
  const r = plan.items[0];
  assert.equal(r.breakdown.length, 21);
  assert.deepEqual(calc.sumBreakdown(r.breakdown), r.total);
});

test('calculating the entire target list from level 1 is stable', () => {
  const entries = OreData.EQUIPMENT.map((e, i) => ({ uid: i, equipmentId: e.id, current: '1', target: String(e.defaultTarget) }));
  const plan = calc.calculatePlan(entries);
  assert.equal(plan.validCount, 27);
  assert.equal(plan.invalidCount, 0);
  const manual = { ...ZERO };
  OreData.EQUIPMENT.forEach((e) => {
    const c = calc.calculateOreCost(e, 1, e.defaultTarget);
    manual.shiny += c.shiny; manual.glowy += c.glowy; manual.starry += c.starry;
  });
  assert.deepEqual(plan.combined, manual);
  assert.equal(plan.combined.starry > 0, true);
});

/* ------------------------------------------------------------------ */
function range(a, b) { const out = []; for (let i = a; i <= b; i += 1) out.push(i); return out; }
function pick(obj, keys) { const out = {}; keys.forEach((k) => { out[k] = obj[k]; }); return out; }