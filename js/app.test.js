'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const HTML = read('index.html');
const SCRIPTS = ['script.js', 'ore/data.js', 'ore/calc.js', 'ore/ui.js', 'nav.js'].map(read);

const OreData = require('../ore/data.js');
const { createCalculator } = require('../ore/calc.js');
const calc = createCalculator(OreData);
const fmt = new Intl.NumberFormat('en-US');

/* Loads the real page, runs the real scripts, collects any script errors. */
function loadApp({ hash = '', storage = {}, patchData = null } = {}) {
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (e) => errors.push(e.message));
  virtualConsole.on('error', (e) => errors.push(String(e)));
  const dom = new JSDOM(HTML, {
    url: 'http://localhost/' + hash,
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    virtualConsole,
    beforeParse(window) {
      Object.keys(storage).forEach((k) => window.localStorage.setItem(k, storage[k]));
    }
  });
  const { window } = dom;
  SCRIPTS.forEach((code, i) => {
    window.eval(code);
    // after data.js and calc.js are loaded, a test may swap in a broken dataset before ui.js reads it
    if (i === 2 && patchData) window.OreData = patchData(JSON.parse(JSON.stringify(window.OreData)));
  });
  const $ = (id) => window.document.getElementById(id);
  const input = (el, value) => {
    el.value = value;
    el.dispatchEvent(new window.Event('input', { bubbles: true }));
  };
  const change = (el, value) => {
    el.value = value;
    el.dispatchEvent(new window.Event('change', { bubbles: true }));
  };
  const click = (el) => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  return { window, document: window.document, $, input, change, click, errors };
}

/* ------------------------------------------------------------------
   Existing boost time calculator: no regressions
   ------------------------------------------------------------------ */
test('boost calculator: 2d 17h with one 10x/1h potion finishes after 56h of real time', () => {
  const app = loadApp();
  const { $, input, change, click } = app;
  change($('tzSelect'), 'WIB');
  input($('startDate'), '2026-01-01');
  input($('startTime'), '00:00');
  input($('durDays'), '2');
  input($('durHours'), '17');
  input($('durMinutes'), '0');
  click($('calculateBtn'));

  assert.equal($('resultContent').style.display, 'block');
  assert.equal($('rWeekday').textContent, 'Saturday');
  assert.equal($('rDate').textContent, '3 January 2026');
  assert.equal($('rTime').textContent, '08:00');
  assert.equal($('rTz').textContent, 'WIB');
  assert.equal($('rSaved').textContent, '9h');
  assert.equal($('rRemain').textContent, '2d 7h');
  assert.equal($('rRealTime').textContent, '2d 8h');
  assert.equal($('midBoostNotice').style.display, 'none');
  assert.deepEqual(app.errors, []);
});

test('boost calculator: a boost that finishes the job mid-way is detected', () => {
  const app = loadApp();
  const { $, input, change, click } = app;
  change($('tzSelect'), 'WIB');
  input($('startDate'), '2026-01-01');
  input($('startTime'), '00:00');
  input($('durDays'), '0');
  input($('durHours'), '5');
  input($('durMinutes'), '0');
  click($('calculateBtn'));
  assert.equal($('rTime').textContent, '00:30');
  assert.equal($('rSaved').textContent, '4h 30m');
  assert.equal($('rRemain').textContent, '0m');
  assert.equal($('rRealTime').textContent, '30m');
  assert.equal($('midBoostNotice').style.display, 'block');
});

test('boost calculator: validation, quick-fill, boost queue and timezones still work', () => {
  const app = loadApp();
  const { $, document, input, change, click } = app;

  input($('durDays'), '0'); input($('durHours'), '0'); input($('durMinutes'), '0');
  click($('calculateBtn'));
  assert.equal($('errorBanner').textContent, 'Please enter a valid duration.');
  assert.ok($('errorBanner').classList.contains('show'));

  input($('quickDuration'), '1d 3h 20m');
  click($('quickFillBtn'));
  assert.deepEqual([$('durDays').value, $('durHours').value, $('durMinutes').value], ['1', '3', '20']);
  assert.ok(!$('errorBanner').classList.contains('show'));

  assert.equal(document.querySelectorAll('.boost-card').length, 1);
  click($('addBoostBtn'));
  assert.equal(document.querySelectorAll('.boost-card').length, 2);
  click(document.querySelector('.boost-card:last-child button[aria-label^="Duplicate"]'));
  assert.equal(document.querySelectorAll('.boost-card').length, 3);
  click(document.querySelector('.boost-card:last-child button[aria-label^="Delete"]'));
  assert.equal(document.querySelectorAll('.boost-card').length, 2);

  // WIT is UTC+9, WIB is UTC+7: the same wall-clock start finishes 2h apart in absolute time.
  input($('startDate'), '2026-03-10'); input($('startTime'), '12:00');
  change($('tzSelect'), 'WIT');
  click($('calculateBtn'));
  assert.equal($('rTz').textContent, 'WIT');
  assert.deepEqual(app.errors, []);
});

test('boost calculator: save, reload and delete a calculation', () => {
  const app = loadApp();
  const { $, document, input, change, click } = app;
  change($('tzSelect'), 'WIB');
  input($('startDate'), '2026-01-01'); input($('startTime'), '00:00');
  input($('durDays'), '2'); input($('durHours'), '17'); input($('durMinutes'), '0');
  click($('calculateBtn'));
  click($('saveBtn'));
  assert.equal(document.querySelectorAll('#savedList .saved-item').length, 1);
  input($('durDays'), '9');
  click(document.querySelector('#savedList .saved-item'));
  assert.equal($('durDays').value, '2');
  click(document.querySelector('#savedList .saved-item .del'));
  assert.equal(document.querySelectorAll('#savedList .saved-item').length, 0);
});

/* ------------------------------------------------------------------
   Navigation
   ------------------------------------------------------------------ */
test('navigation: boost view is the default, hash switches views', () => {
  const app = loadApp();
  const { $, window } = app;
  assert.equal($('view-time').hidden, false);
  assert.equal($('view-ore').hidden, true);
  assert.equal($('tab-time').getAttribute('aria-current'), 'page');
  assert.equal($('tab-ore').hasAttribute('aria-current'), false);
  assert.equal(window.document.querySelector('.tz-picker').hidden, false);
  assert.match(window.document.title, /Boost Time/);

  window.location.hash = '#ore';
  return new Promise((resolve) => setTimeout(() => {
    assert.equal($('view-time').hidden, true);
    assert.equal($('view-ore').hidden, false);
    assert.equal($('tab-ore').getAttribute('aria-current'), 'page');
    assert.equal(window.document.querySelector('.tz-picker').hidden, true);
    assert.match(window.document.title, /Ore Calculator/);
    assert.match($('brandSub').textContent, /instant/);
    window.location.hash = '#time';
    setTimeout(() => {
      assert.equal($('view-time').hidden, false);
      assert.equal($('view-ore').hidden, true);
      resolve();
    }, 20);
  }, 20));
});

test('navigation: loading with #ore opens the ore view directly', () => {
  const app = loadApp({ hash: '#ore' });
  assert.equal(app.$('view-ore').hidden, false);
  assert.equal(app.$('view-time').hidden, true);
});

/* ------------------------------------------------------------------
   Hero equipment ore view
   ------------------------------------------------------------------ */
const rows = (app) => Array.from(app.document.querySelectorAll('#orePlanList .ore-row'));
const rowByName = (app, name) => rows(app).find((r) => r.querySelector('.ore-name').textContent === name);
const fieldsOf = (row) => ({ cur: row.querySelector('input[id^="ore-cur-"]'), tgt: row.querySelector('input[id^="ore-tgt-"]') });
const summary = (app) => {
  const out = {};
  app.document.querySelectorAll('#oreSummaryBody tr').forEach((tr) => {
    const cells = tr.querySelectorAll('th,td');
    out[cells[0].textContent] = { required: cells[1].textContent, owned: cells[2].textContent, balance: cells[3].textContent.trim() };
  });
  return out;
};

test('ore: starts empty, ore view states instant upgrades, results hidden until calculated', () => {
  const app = loadApp({ hash: '#ore' });
  assert.equal(rows(app).length, 0);
  assert.match(app.$('orePlanList').textContent, /No equipment in the plan yet/);
  assert.match(app.document.querySelector('.ore-intro').textContent, /instant/i);
  assert.match(app.document.querySelector('.ore-intro').textContent, /not time/i);
  assert.equal(app.$('oreResultEmpty').hidden, false);
  assert.equal(app.$('oreResultContent').hidden, true);
  assert.equal(app.$('oreRestoreBtn').disabled, true);
  assert.equal(app.$('oreClearBtn').disabled, true);
  assert.equal(app.$('oreAddHeroBtn').textContent, 'Add all Dragon Duke');
  assert.deepEqual(app.errors, []);
});

test('ore: hero selector filters equipment; adding uses default target and level 1', () => {
  const app = loadApp({ hash: '#ore' });
  const { $, change, click } = app;
  const optionsOf = (sel) => Array.from(sel.options).map((o) => o.textContent);
  assert.deepEqual(optionsOf($('oreHeroSelect')),
    ['Dragon Duke', 'Barbarian King', 'Minion Prince', 'Grand Warden', 'Archer Queen', 'Royal Champion']);
  assert.equal($('oreEquipSelect').options.length, 5);

  change($('oreEquipSelect'), 'fireHeart');
  click($('oreAddBtn'));
  const row = rowByName(app, 'Fire Heart');
  assert.ok(row);
  assert.equal(fieldsOf(row).cur.value, '1');
  assert.equal(fieldsOf(row).tgt.value, '15');
  assert.equal($('oreEquipSelect').options.length, 4);        // already-added piece leaves the picker
  assert.equal($('orePlanCount').textContent, '1 item in plan');
  assert.equal($('oreRestoreBtn').disabled, false);

  change($('oreHeroSelect'), 'archerQueen');
  assert.equal($('oreAddHeroBtn').textContent, 'Add all Archer Queen');
  change($('oreEquipSelect'), 'monolithArrow');
  click($('oreAddBtn'));
  assert.equal(fieldsOf(rowByName(app, 'Monolith Arrow')).tgt.value, '3');
  assert.match(rowByName(app, 'Monolith Arrow').querySelector('.ore-meta').textContent, /Epic . max level 27/);
  assert.match(rowByName(app, 'Fire Heart').querySelector('.ore-meta').textContent, /Common . max level 18/);
});

test('ore: add all for a hero, add everything, add controls disable when exhausted', () => {
  const app = loadApp({ hash: '#ore' });
  const { $, change, click } = app;
  click($('oreAddHeroBtn'));
  assert.equal(rows(app).length, 5);
  assert.equal($('oreAddHeroBtn').disabled, true);
  assert.equal($('oreAddBtn').disabled, true);
  assert.equal($('oreEquipSelect').disabled, true);
  change($('oreHeroSelect'), 'grandWarden');
  assert.equal($('oreAddHeroBtn').disabled, false);

  click($('oreAddAllBtn'));
  assert.equal(rows(app).length, 27);
  assert.equal($('oreAddAllBtn').disabled, true);
  assert.equal(app.document.querySelectorAll('.ore-group').length, 6);
  const headings = Array.from(app.document.querySelectorAll('.ore-hero')).map((h) => h.firstChild.textContent);
  assert.deepEqual(headings, ['Dragon Duke', 'Barbarian King', 'Minion Prince', 'Grand Warden', 'Archer Queen', 'Royal Champion']);
  // every row starts at its default target
  OreData.EQUIPMENT.forEach((e) => {
    assert.equal(fieldsOf(rowByName(app, e.name)).tgt.value, String(e.defaultTarget), e.id);
  });
});

test('ore: Calculate all shows per-item totals, combined total, and level breakdown', () => {
  const app = loadApp({ hash: '#ore' });
  const { $, change, click, input } = app;
  change($('oreEquipSelect'), 'fireHeart'); click($('oreAddBtn'));
  change($('oreHeroSelect'), 'royalChampion');
  change($('oreEquipSelect'), 'electroBoots'); click($('oreAddBtn'));
  input(fieldsOf(rowByName(app, 'Electro Boots')).cur, '9');
  input(fieldsOf(rowByName(app, 'Electro Boots')).tgt, '24');

  assert.equal(rowByName(app, 'Fire Heart').querySelector('.ore-result').hidden, true, 'nothing before Calculate');
  click($('oreCalculateBtn'));

  const fh = calc.calculateOreCost(calc.getEquipment('fireHeart'), 1, 15);
  const eb = calc.calculateOreCost(calc.getEquipment('electroBoots'), 9, 24);
  const s = summary(app);
  assert.equal(s['Shiny'].required, fmt.format(fh.shiny + eb.shiny));
  assert.equal(s['Glowy'].required, fmt.format(fh.glowy + eb.glowy));
  assert.equal(s['Starry'].required, fmt.format(fh.starry + eb.starry));
  assert.equal(eb.starry, 20 + 30 + 50 + 100 + 120);                 // levels 12,15,18,21,24 (not 9)
  assert.equal(app.$('oreCountLine').textContent, 'Totals cover 2 of 2 items.');

  const ebRow = rowByName(app, 'Electro Boots');
  assert.equal(ebRow.querySelector('.ore-result').hidden, false);
  assert.equal(ebRow.querySelectorAll('.ore-table tbody tr').length, 15);                 // levels 10..24
  assert.equal(ebRow.querySelector('.ore-table tbody tr th').textContent, 'Level 10');
  assert.equal(ebRow.querySelector('.ore-table tbody tr:last-child th').textContent, 'Level 24');
  assert.equal(ebRow.querySelector('.ore-table tfoot td').textContent, fmt.format(eb.shiny));
  const fhRow = rowByName(app, 'Fire Heart');
  assert.equal(fhRow.querySelectorAll('.ore-table tbody tr').length, 14);                 // levels 2..15
  assert.equal(fhRow.querySelector('.ore-table tfoot td:last-child').textContent, '0');   // common: no Starry
  assert.equal($('oreResultContent').hidden, false);
  assert.deepEqual(app.errors, []);
});

test('ore: inventory drives deficit, surplus and exact balances', () => {
  const app = loadApp({ hash: '#ore' });
  const { $, change, click, input } = app;
  change($('oreEquipSelect'), 'fireHeart'); click($('oreAddBtn'));
  input(fieldsOf(rowByName(app, 'Fire Heart')).tgt, '3');          // 1 -> 3: 360 Shiny, 20 Glowy, 0 Starry
  input($('oreInvShiny'), '100');
  input($('oreInvGlowy'), '20');
  input($('oreInvStarry'), '50');
  click($('oreCalculateBtn'));
  let s = summary(app);
  assert.equal(s['Shiny'].balance, 'Short by \u2212260');      // short 260 (screen-reader prefix included)
  assert.equal(s['Glowy'].balance, 'Exact');
  assert.equal(s['Starry'].balance, 'Spare +50');               // nothing needed, 50 spare
  assert.equal(s['Shiny'].owned, '100');
  assert.match(app.document.querySelector('#oreSummaryBody tr .sr-only').textContent, /Short by/);

  input($('oreInvShiny'), '1000');                                  // live update after first calculation
  s = summary(app);
  assert.equal(s['Shiny'].balance, 'Spare +640');

  input($('oreInvShiny'), '');                                      // blank counts as 0
  assert.equal(summary(app)['Shiny'].balance, 'Short by \u2212360');

  input($('oreInvShiny'), '-5');                                    // invalid stock is flagged, not guessed
  assert.equal($('oreInvShiny').getAttribute('aria-invalid'), 'true');
  assert.match($('oreInvMsg').textContent, /Shiny Ore/);
  assert.equal(summary(app)['Shiny'].balance, 'Check stock');
});

test('ore: validation blocks a bad row, flags it, and keeps the page working', () => {
  const app = loadApp({ hash: '#ore' });
  const { $, change, click, input } = app;
  change($('oreEquipSelect'), 'fireHeart'); click($('oreAddBtn'));
  change($('oreEquipSelect'), 'electroFangs'); click($('oreAddBtn'));
  const fh = rowByName(app, 'Fire Heart');
  input(fieldsOf(fh).tgt, '19');                                    // common max is 18
  assert.match(fh.querySelector('.ore-msg').textContent, /above 18/);
  assert.equal(fieldsOf(fh).tgt.getAttribute('aria-invalid'), 'true');
  assert.ok(fh.classList.contains('is-invalid'));

  input(fieldsOf(fh).tgt, '5'); input(fieldsOf(fh).cur, '9');       // reversed
  assert.match(fh.querySelector('.ore-msg').textContent, /lower than the current level \(9\)/);
  input(fieldsOf(fh).cur, '');                                      // blank
  assert.match(fh.querySelector('.ore-msg').textContent, /Enter the current level/);
  input(fieldsOf(fh).cur, '0');
  assert.match(fh.querySelector('.ore-msg').textContent, /at least 1/);

  click($('oreCalculateBtn'));
  assert.equal($('oreCountLine').textContent, 'Totals cover 1 of 2 items.');
  assert.equal($('oreSkipNote').hidden, false);
  assert.match($('oreSkipNote').textContent, /1 item has a level problem/);
  assert.equal(fh.querySelector('.ore-result').hidden, true);
  const ef = calc.calculateOreCost(calc.getEquipment('electroFangs'), 1, 15);
  assert.equal(summary(app)['Shiny'].required, fmt.format(ef.shiny));   // invalid row excluded

  input(fieldsOf(fh).cur, '1'); input(fieldsOf(fh).tgt, '3');       // fix it: totals include it again, live
  assert.equal($('oreSkipNote').hidden, true);
  assert.equal($('oreCountLine').textContent, 'Totals cover 2 of 2 items.');
  assert.equal(fh.querySelector('.ore-msg').textContent, '');
  assert.equal(fieldsOf(fh).tgt.hasAttribute('aria-invalid'), false);

  // Epic goes to 27, not 28
  change($('oreHeroSelect'), 'grandWarden'); change($('oreEquipSelect'), 'fireball'); click($('oreAddBtn'));
  const fb = rowByName(app, 'Fireball');
  input(fieldsOf(fb).tgt, '27'); assert.equal(fb.querySelector('.ore-msg').textContent, '');
  input(fieldsOf(fb).tgt, '28'); assert.match(fb.querySelector('.ore-msg').textContent, /above 27/);
  assert.deepEqual(app.errors, []);
});

test('ore: same-level target costs zero and says so', () => {
  const app = loadApp({ hash: '#ore' });
  const { $, change, click, input } = app;
  change($('oreEquipSelect'), 'fireHeart'); click($('oreAddBtn'));
  input(fieldsOf(rowByName(app, 'Fire Heart')).cur, '15');
  click($('oreCalculateBtn'));
  const row = rowByName(app, 'Fire Heart');
  assert.equal(row.querySelector('.ore-zero').hidden, false);
  assert.match(row.querySelector('.ore-zero').textContent, /No ore needed/);
  assert.equal(row.querySelector('.ore-detail').hidden, true);
  const s = summary(app);
  assert.equal(s['Shiny'].required, '0');
  assert.equal(s['Shiny'].balance, '\u2013');
});

test('ore: target presets set the target, and their pressed state follows the value', () => {
  const app = loadApp({ hash: '#ore' });
  const { $, change, click, input } = app;
  change($('oreEquipSelect'), 'fireHeart'); click($('oreAddBtn'));
  const row = rowByName(app, 'Fire Heart');
  const [def, max, custom] = row.querySelectorAll('.chip');
  assert.equal(def.textContent, 'Default \u00b7 15');
  assert.equal(max.textContent, 'Max \u00b7 18');
  assert.deepEqual([def, max, custom].map((b) => b.getAttribute('aria-pressed')), ['true', 'false', 'false']);

  click(max);
  assert.equal(fieldsOf(row).tgt.value, '18');
  assert.deepEqual([def, max, custom].map((b) => b.getAttribute('aria-pressed')), ['false', 'true', 'false']);
  input(fieldsOf(row).tgt, '11');                                    // user-defined target
  assert.deepEqual([def, max, custom].map((b) => b.getAttribute('aria-pressed')), ['false', 'false', 'true']);
  click(def);
  assert.equal(fieldsOf(row).tgt.value, '15');

  change($('oreHeroSelect'), 'grandWarden'); change($('oreEquipSelect'), 'fireball'); click($('oreAddBtn'));
  const fb = rowByName(app, 'Fireball');
  assert.equal(fb.querySelector('.chip').textContent, 'Default \u00b7 24');
  click(fb.querySelectorAll('.chip')[1]);
  assert.equal(fieldsOf(fb).tgt.value, '27');
});

test('ore: reset one item, restore default targets, remove, and clear plan each have their own scope', () => {
  const app = loadApp({ hash: '#ore' });
  const { $, change, click, input } = app;
  click($('oreAddHeroBtn'));
  const fh = rowByName(app, 'Fire Heart');
  const rb = rowByName(app, 'Rocket Backpack');
  input(fieldsOf(fh).cur, '8'); input(fieldsOf(fh).tgt, '12');
  input(fieldsOf(rb).cur, '10'); input(fieldsOf(rb).tgt, '20');

  // reset ONE item: level 1 and its default target; others untouched
  click(fh.querySelector('button[aria-label^="Reset"]'));
  assert.equal(fieldsOf(rowByName(app, 'Fire Heart')).cur.value, '1');
  assert.equal(fieldsOf(rowByName(app, 'Fire Heart')).tgt.value, '15');
  assert.equal(fieldsOf(rowByName(app, 'Rocket Backpack')).cur.value, '10');
  assert.equal(fieldsOf(rowByName(app, 'Rocket Backpack')).tgt.value, '20');

  // restore defaults: targets only, current levels kept
  click($('oreRestoreBtn'));
  assert.equal(fieldsOf(rowByName(app, 'Rocket Backpack')).tgt.value, '24');
  assert.equal(fieldsOf(rowByName(app, 'Rocket Backpack')).cur.value, '10');

  // remove one
  click(rowByName(app, 'Stun Blaster').querySelector('button[aria-label^="Remove"]'));
  assert.equal(rows(app).length, 4);
  assert.equal(rowByName(app, 'Stun Blaster'), undefined);
  assert.equal($('oreEquipSelect').options.length, 1);

  // clear plan
  click($('oreCalculateBtn'));
  assert.equal($('oreResultContent').hidden, false);
  click($('oreClearBtn'));
  assert.equal(rows(app).length, 0);
  assert.equal($('oreResultContent').hidden, true);
  assert.equal($('oreResultEmpty').hidden, false);
  assert.equal($('oreClearBtn').disabled, true);
});

test('ore: changing a level after calculating updates totals and breakdown live', () => {
  const app = loadApp({ hash: '#ore' });
  const { $, change, click, input } = app;
  change($('oreEquipSelect'), 'fireHeart'); click($('oreAddBtn'));
  click($('oreCalculateBtn'));
  const before = summary(app)['Shiny'].required;
  input(fieldsOf(rowByName(app, 'Fire Heart')).cur, '10');
  const after = summary(app)['Shiny'].required;
  assert.notEqual(before, after);
  assert.equal(after, fmt.format(calc.calculateOreCost(calc.getEquipment('fireHeart'), 10, 15).shiny));
  assert.equal(rowByName(app, 'Fire Heart').querySelectorAll('.ore-table tbody tr').length, 5);
});

test('ore: Calculate with an empty plan shows a clear error instead of breaking', () => {
  const app = loadApp({ hash: '#ore' });
  app.click(app.$('oreCalculateBtn'));
  assert.equal(app.$('oreError').textContent, 'Add at least one equipment item first.');
  assert.ok(app.$('oreError').classList.contains('show'));
  assert.equal(app.$('oreResultContent').hidden, true);
  assert.deepEqual(app.errors, []);
});

test('ore: pressing Enter in a level field calculates', () => {
  const app = loadApp({ hash: '#ore' });
  app.change(app.$('oreEquipSelect'), 'fireHeart'); app.click(app.$('oreAddBtn'));
  const { tgt } = fieldsOf(rowByName(app, 'Fire Heart'));
  tgt.dispatchEvent(new app.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  assert.equal(app.$('oreResultContent').hidden, false);
});

test('ore: full 27-item target list calculates and matches the calculator module', () => {
  const app = loadApp({ hash: '#ore' });
  app.click(app.$('oreAddAllBtn'));
  app.click(app.$('oreCalculateBtn'));
  const expected = { shiny: 0, glowy: 0, starry: 0 };
  OreData.EQUIPMENT.forEach((e) => {
    const c = calc.calculateOreCost(e, 1, e.defaultTarget);
    expected.shiny += c.shiny; expected.glowy += c.glowy; expected.starry += c.starry;
  });
  const s = summary(app);
  assert.equal(s['Shiny'].required, fmt.format(expected.shiny));
  assert.equal(s['Glowy'].required, fmt.format(expected.glowy));
  assert.equal(s['Starry'].required, fmt.format(expected.starry));
  assert.equal(app.$('oreCountLine').textContent, 'Totals cover 27 of 27 items.');
  assert.equal(app.document.querySelectorAll('#orePlanList .ore-detail:not([hidden])').length, 27);
});

test('ore: plan and stock persist across reloads; unknown and duplicate saved items are dropped', () => {
  const saved = JSON.stringify({ v: 1, plan: [
    { id: 'spikyBall', c: '4', t: '18' },
    { id: 'spikyBall', c: '1', t: '2' },          // duplicate
    { id: 'notARealItem', c: '1', t: '5' },       // unknown
    { id: 'darkOrb', c: '', t: 'abc' }            // kept as typed, flagged by validation
  ], inv: { shiny: '5000', glowy: '', starry: '12' } });
  const app = loadApp({ hash: '#ore', storage: { rally_ore_state_v1: saved } });
  assert.equal(rows(app).length, 2);
  assert.equal(fieldsOf(rowByName(app, 'Spiky Ball')).cur.value, '4');
  assert.equal(app.$('oreInvShiny').value, '5000');
  assert.equal(app.$('oreInvStarry').value, '12');
  assert.match(rowByName(app, 'Dark Orb').querySelector('.ore-msg').textContent, /Enter the current level/);
  assert.deepEqual(app.errors, []);

  // edits are written back
  app.input(fieldsOf(rowByName(app, 'Spiky Ball')).cur, '6');
  const stored = JSON.parse(app.window.localStorage.getItem('rally_ore_state_v1'));
  assert.equal(stored.plan[0].c, '6');
});

test('ore: corrupt saved state is ignored', () => {
  const app = loadApp({ hash: '#ore', storage: { rally_ore_state_v1: '{not json' } });
  assert.equal(rows(app).length, 0);
  assert.deepEqual(app.errors, []);
});

test('ore: a failed data integrity check disables calculation and says why', () => {
  const app = loadApp({
    hash: '#ore',
    patchData: (data) => { delete data.ORE_COSTS.epic[20]; return data; }
  });
  assert.equal(app.$('oreDataError').hidden, false);
  assert.ok(app.$('oreDataError').classList.contains('show'));
  assert.match(app.$('oreDataError').textContent, /integrity check/);
  assert.match(app.$('oreDataError').textContent, /epic: missing level 20/);
  assert.equal(app.$('oreCalculateBtn').disabled, true);
  assert.deepEqual(app.errors, []);
});

test('ore: a healthy dataset shows no integrity warning', () => {
  const app = loadApp({ hash: '#ore' });
  assert.equal(app.$('oreDataError').hidden, true);
  assert.equal(app.$('oreCalculateBtn').disabled, false);
});

test('copy: no em dashes in visible prose', () => {
  const app = loadApp({ hash: '#ore' });
  app.click(app.$('oreAddHeroBtn'));
  app.click(app.$('oreCalculateBtn'));
  const prose = Array.from(app.document.querySelectorAll('p, li, label, button, summary, option, h1, h2, h3, .hint, .notice'))
    .map((n) => n.textContent).join('\n');
  assert.ok(!prose.includes('\u2014'), 'em dash found: ' + (prose.match(/.{20}\u2014.{20}/) || [''])[0]);
});

test('ore: cost data and sources are shown with the not-verified caveat', () => {
  const app = loadApp({ hash: '#ore' });
  const text = app.$('oreSourceBody').textContent;
  assert.match(text, /Not verified against the live game/);
  assert.match(text, /2026-10/);
  assert.match(text, /2026-10-12/);
  assert.ok(app.$('oreSourceBody').querySelectorAll('a[href^="https://"][rel~="noopener"]').length >= 5);
});

test('accessibility: every ore form control has an accessible name and every button a label', () => {
  const app = loadApp({ hash: '#ore' });
  app.click(app.$('oreAddHeroBtn'));
  const view = app.$('view-ore');
  const named = (el) => {
    if (el.getAttribute('aria-label') || el.getAttribute('aria-labelledby')) return true;
    if (el.id && view.querySelector('label[for="' + el.id + '"]')) return true;
    return el.tagName === 'BUTTON' && el.textContent.trim().length > 0;
  };
  const controls = Array.from(view.querySelectorAll('input, select, button'));
  assert.ok(controls.length > 30);
  controls.forEach((c) => assert.ok(named(c), 'unlabelled control: ' + c.outerHTML.slice(0, 90)));
  // every row input points at its message region
  rows(app).forEach((r) => {
    const { cur, tgt } = fieldsOf(r);
    [cur, tgt].forEach((i) => assert.ok(app.document.getElementById(i.getAttribute('aria-describedby'))));
  });
  // unique ids
  const ids = Array.from(app.document.querySelectorAll('[id]')).map((n) => n.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('page loads both views without script errors', () => {
  const app = loadApp();
  assert.deepEqual(app.errors, []);
});