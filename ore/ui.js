/* ============================================================
   HERO EQUIPMENT ORE VIEW
   Rendering and state only. Costs live in ore/data.js and every
   calculation is in ore/calc.js.

   Flow: add equipment -> edit levels -> "Calculate all".
   After the first calculation, results stay live as inputs change.
   ============================================================ */
(function () {
  'use strict';

  var Data = window.OreData;
  var Calc = window.OreCalc;
  var view = document.getElementById('view-ore');
  if (!view || !Data || !Calc) return;

  var calc = Calc.createCalculator(Data);
  var fmt = new Intl.NumberFormat('en-US');
  var STORAGE_KEY = 'rally_ore_state_v1';
  var MINUS = '\u2212';

  function $(id) { return document.getElementById(id); }

  var els = {
    heroSelect: $('oreHeroSelect'),
    equipSelect: $('oreEquipSelect'),
    addBtn: $('oreAddBtn'),
    addHeroBtn: $('oreAddHeroBtn'),
    addAllBtn: $('oreAddAllBtn'),
    restoreBtn: $('oreRestoreBtn'),
    clearBtn: $('oreClearBtn'),
    planCount: $('orePlanCount'),
    planList: $('orePlanList'),
    invMsg: $('oreInvMsg'),
    calcBtn: $('oreCalculateBtn'),
    error: $('oreError'),
    dataError: $('oreDataError'),
    resultEmpty: $('oreResultEmpty'),
    resultContent: $('oreResultContent'),
    countLine: $('oreCountLine'),
    skipNote: $('oreSkipNote'),
    sumWrap: $('oreSumWrap'),
    sumBody: $('oreSummaryBody'),
    status: $('oreStatus'),
    source: $('oreSourceBody')
  };
  var inventoryInputs = {
    shiny: $('oreInvShiny'),
    glowy: $('oreInvGlowy'),
    starry: $('oreInvStarry')
  };

  /* ---------------- state ---------------- */
  var state = {
    plan: [],          // [{ uid, equipmentId, current, target }] levels kept as typed strings
    inventory: { shiny: '', glowy: '', starry: '' },
    hasCalculated: false
  };
  var nextUid = 1;
  var refs = {};       // uid -> row element handles
  var resultByUid = {};
  var lastPlan = null;
  var dataOk = true;

  /* ---------------- tiny DOM helper ---------------- */
  function el(tag, props, kids) {
    var node = document.createElement(tag);
    props = props || {};
    if (props.className) node.className = props.className;
    if (props.id) node.id = props.id;
    if (props.text !== undefined) node.textContent = props.text;
    if (props.attrs) Object.keys(props.attrs).forEach(function (k) { node.setAttribute(k, props.attrs[k]); });
    if (props.on) Object.keys(props.on).forEach(function (k) { node.addEventListener(k, props.on[k]); });
    (kids || []).forEach(function (kid) { if (kid) node.appendChild(kid); });
    return node;
  }

  function announce(message) {
    els.status.textContent = '';
    window.setTimeout(function () { els.status.textContent = message; }, 30);
  }

  function showError(message) {
    els.error.textContent = message || '';
    els.error.classList.toggle('show', !!message);
  }

  /* ---------------- persistence (per device) ---------------- */
  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        v: 1,
        plan: state.plan.map(function (e) { return { id: e.equipmentId, c: e.current, t: e.target }; }),
        inv: state.inventory
      }));
    } catch (err) { /* storage unavailable: the plan simply won't persist */ }
  }

  function load() {
    try {
      var raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (!raw || raw.v !== 1 || !Array.isArray(raw.plan)) return;
      var seen = {};
      raw.plan.forEach(function (p) {
        var known = Data.EQUIPMENT.some(function (e) { return e.id === p.id; });
        if (!known || seen[p.id]) return;           // drop unknown or duplicate ids
        seen[p.id] = true;
        state.plan.push({ uid: nextUid++, equipmentId: p.id, current: String(p.c == null ? '' : p.c), target: String(p.t == null ? '' : p.t) });
      });
      if (raw.inv) {
        Data.ORE_TYPES.forEach(function (ore) {
          state.inventory[ore] = raw.inv[ore] == null ? '' : String(raw.inv[ore]);
        });
      }
    } catch (err) { /* ignore corrupt saved state */ }
  }

  /* ---------------- calculation ---------------- */
  function recompute() {
    lastPlan = calc.calculatePlan(state.plan.map(function (e) {
      return { uid: e.uid, equipmentId: e.equipmentId, current: e.current, target: e.target };
    }));
    resultByUid = {};
    lastPlan.items.forEach(function (r) { resultByUid[r.uid] = r; });
  }

  function recalcAll() {
    recompute();
    state.plan.forEach(function (e) { refreshRow(e.uid); });
    renderSummary();
  }

  /* ---------------- formatting ---------------- */
  function amounts(total) {
    var frag = document.createDocumentFragment();
    Data.ORE_TYPES.forEach(function (ore) {
      var short = Data.ORE_LABELS[ore].replace(' Ore', '');
      frag.appendChild(el('span', { className: 'ore-amt' }, [
        el('span', { className: 'ore-amt-label', text: short + ' ' }),
        el('b', { className: 'mono' + (total[ore] === 0 ? ' zero' : ''), text: fmt.format(total[ore]) })
      ]));
    });
    return frag;
  }

  function amountCell(value) {
    return el('td', { className: 'num' + (value === 0 ? ' zero' : ''), text: fmt.format(value) });
  }

  /* ---------------- add / remove controls ---------------- */
  function inPlanIds() {
    var set = {};
    state.plan.forEach(function (e) { set[e.equipmentId] = true; });
    return set;
  }

  function remainingFor(heroId) {
    var taken = inPlanIds();
    return Data.EQUIPMENT.filter(function (e) { return e.hero === heroId && !taken[e.id]; });
  }

  function refreshAddControls() {
    var heroId = els.heroSelect.value;
    var hero = Data.HEROES.filter(function (h) { return h.id === heroId; })[0];
    var remaining = remainingFor(heroId);

    els.equipSelect.textContent = '';
    if (remaining.length) {
      remaining.forEach(function (e) {
        els.equipSelect.appendChild(el('option', { text: e.name + ' (' + Data.RARITIES[e.rarity].label + ')', attrs: { value: e.id } }));
      });
    } else {
      els.equipSelect.appendChild(el('option', { text: 'All added', attrs: { value: '' } }));
    }
    els.equipSelect.disabled = !remaining.length;
    els.addBtn.disabled = !remaining.length;
    els.addHeroBtn.disabled = !remaining.length;
    els.addHeroBtn.textContent = 'Add all ' + hero.name;

    var taken = inPlanIds();
    els.addAllBtn.disabled = Data.EQUIPMENT.every(function (e) { return taken[e.id]; });

    var n = state.plan.length;
    els.planCount.textContent = n + (n === 1 ? ' item' : ' items') + ' in plan';
    els.restoreBtn.disabled = !n;
    els.clearBtn.disabled = !n;
  }

  function addItems(ids) {
    var taken = inPlanIds();
    var added = [];
    ids.forEach(function (id) {
      if (taken[id]) return;
      var item = calc.getEquipment(id);
      state.plan.push({ uid: nextUid++, equipmentId: id, current: '1', target: String(item.defaultTarget) });
      added.push(item.name);
    });
    if (!added.length) return;
    renderPlan();
    save();
    if (state.hasCalculated) recalcAll();
    announce(added.length === 1 ? added[0] + ' added to the plan.' : added.length + ' items added to the plan.');
  }

  function removeItem(uid) {
    var order = renderedOrder();
    var idx = order.indexOf(uid);
    var entry = state.plan.filter(function (e) { return e.uid === uid; })[0];
    if (!entry) return;
    var name = calc.getEquipment(entry.equipmentId).name;
    state.plan = state.plan.filter(function (e) { return e.uid !== uid; });
    renderPlan();
    save();
    if (state.hasCalculated) recalcAll();
    announce(name + ' removed from the plan.');
    // Keep keyboard focus useful: the neighbouring row's remove button, else the add control.
    var neighbour = order[idx + 1] !== undefined ? order[idx + 1] : order[idx - 1];
    var target = neighbour !== undefined && refs[neighbour] ? refs[neighbour].removeBtn : els.addBtn;
    if (target && !target.disabled) target.focus(); else els.heroSelect.focus();
  }

  function renderedOrder() {
    return Array.prototype.map.call(els.planList.querySelectorAll('.ore-row'), function (n) { return Number(n.getAttribute('data-uid')); });
  }

  function resetRow(uid) {
    var ref = refs[uid];
    if (!ref) return;
    var item = calc.getEquipment(ref.entry.equipmentId);
    ref.entry.current = '1';
    ref.entry.target = String(item.defaultTarget);
    ref.curInput.value = ref.entry.current;
    ref.tgtInput.value = ref.entry.target;
    onEdited(ref.entry);
    announce(item.name + ' reset to level 1 with its default target.');
  }

  function restoreDefaultTargets() {
    if (!state.plan.length) return;
    state.plan.forEach(function (e) { e.target = String(calc.getEquipment(e.equipmentId).defaultTarget); });
    renderPlan();
    save();
    if (state.hasCalculated) recalcAll();
    announce('Target levels restored to their defaults. Current levels unchanged.');
  }

  function clearPlan() {
    if (!state.plan.length) return;
    state.plan = [];
    state.hasCalculated = false;
    lastPlan = null;
    resultByUid = {};
    renderPlan();
    renderSummary();
    save();
    announce('Plan cleared.');
    els.heroSelect.focus();
  }

  /* ---------------- plan rows ---------------- */
  function levelInput(id, max, value, uid, which) {
    var input = el('input', { id: id, attrs: {
      type: 'number', inputmode: 'numeric', min: '1', max: String(max), step: '1',
      'aria-describedby': 'ore-msg-' + uid
    } });
    input.value = value;
    input.addEventListener('input', function () {
      var entry = refs[uid].entry;
      entry[which] = input.value;
      onEdited(entry);
    });
    input.addEventListener('keydown', onEnterCalculate);
    return input;
  }

  function onEnterCalculate(ev) {
    if (ev.key === 'Enter') { ev.preventDefault(); calculateAll(); }
  }

  function setPreset(uid, kind) {
    var ref = refs[uid];
    var item = calc.getEquipment(ref.entry.equipmentId);
    ref.entry.target = String(calc.getPresetTarget(item, kind));
    ref.tgtInput.value = ref.entry.target;
    onEdited(ref.entry);
  }

  function buildRow(entry) {
    var item = calc.getEquipment(entry.equipmentId);
    var max = calc.getMaxLevel(item);
    var rarity = Data.RARITIES[item.rarity];
    var uid = entry.uid;
    var curId = 'ore-cur-' + uid;
    var tgtId = 'ore-tgt-' + uid;

    var curInput = levelInput(curId, max, entry.current, uid, 'current');
    var tgtInput = levelInput(tgtId, max, entry.target, uid, 'target');

    function chip(label, onClick, ariaLabel) {
      return el('button', { className: 'chip', text: label, attrs: { type: 'button', 'aria-pressed': 'false', 'aria-label': ariaLabel }, on: { click: onClick } });
    }
    var defBtn = chip('Default \u00b7 ' + item.defaultTarget, function () { setPreset(uid, 'default'); },
      'Set ' + item.name + ' target to your default, level ' + item.defaultTarget);
    var maxBtn = chip('Max \u00b7 ' + max, function () { setPreset(uid, 'max'); },
      'Set ' + item.name + ' target to the ' + rarity.label + ' maximum, level ' + max);
    var customBtn = chip('Custom', function () { tgtInput.focus(); tgtInput.select(); },
      'Enter a custom target level for ' + item.name);

    var removeBtn = el('button', { className: 'icon-btn danger', text: '\u2715',
      attrs: { type: 'button', title: 'Remove ' + item.name, 'aria-label': 'Remove ' + item.name + ' from the plan' },
      on: { click: function () { removeItem(uid); } } });
    var resetBtn = el('button', { className: 'btn-ghost btn-sm', text: 'Reset',
      attrs: { type: 'button', 'aria-label': 'Reset ' + item.name + ': current level 1, default target' },
      on: { click: function () { resetRow(uid); } } });

    var msg = el('p', { className: 'ore-msg', id: 'ore-msg-' + uid, attrs: { 'aria-live': 'polite' } });

    var zeroNote = el('p', { className: 'ore-zero', text: 'Already at target. No ore needed.' });
    zeroNote.hidden = true;
    var summaryTotals = el('span', { className: 'ore-totals' });
    var tbody = el('tbody');
    var tfoot = el('tfoot');
    var details = el('details', { className: 'ore-detail' }, [
      el('summary', {}, [summaryTotals]),
      el('div', { className: 'ore-table-wrap' }, [
        el('table', { className: 'ore-table' }, [
          el('caption', { className: 'sr-only', text: item.name + ' ore cost per level' }),
          el('thead', {}, [el('tr', {}, [
            el('th', { text: 'Upgrade to', attrs: { scope: 'col' } }),
            el('th', { text: 'Shiny', attrs: { scope: 'col' }, className: 'num' }),
            el('th', { text: 'Glowy', attrs: { scope: 'col' }, className: 'num' }),
            el('th', { text: 'Starry', attrs: { scope: 'col' }, className: 'num' })
          ])]),
          tbody, tfoot
        ])
      ])
    ]);
    var result = el('div', { className: 'ore-result' }, [zeroNote, details]);
    result.hidden = true;

    var root = el('div', { className: 'ore-row', attrs: { 'data-uid': String(uid) } }, [
      el('div', { className: 'ore-row-head' }, [
        el('div', { className: 'ore-row-title' }, [
          el('span', { className: 'ore-name', text: item.name }),
          el('span', { className: 'ore-meta' }, [
            el('span', { className: 'ore-rarity ' + item.rarity, text: rarity.label }),
            document.createTextNode(' \u00b7 max level ' + max)
          ])
        ]),
        el('div', { className: 'ore-row-actions' }, [resetBtn, removeBtn])
      ]),
      el('div', { className: 'ore-fields' }, [
        el('div', {}, [el('label', { className: 'mini-label', text: 'Current level', attrs: { 'for': curId } }), curInput]),
        el('div', {}, [el('label', { className: 'mini-label', text: 'Target level', attrs: { 'for': tgtId } }), tgtInput])
      ]),
      el('div', { className: 'ore-presets', attrs: { role: 'group', 'aria-label': 'Target presets for ' + item.name } }, [defBtn, maxBtn, customBtn]),
      msg,
      result
    ]);

    refs[uid] = { entry: entry, root: root, curInput: curInput, tgtInput: tgtInput, msg: msg,
      removeBtn: removeBtn, presets: { def: defBtn, max: maxBtn, custom: customBtn },
      result: result, zeroNote: zeroNote, details: details, summaryTotals: summaryTotals, tbody: tbody, tfoot: tfoot };
    return root;
  }

  function refreshRow(uid) {
    var ref = refs[uid];
    if (!ref) return;
    var entry = ref.entry;
    var item = calc.getEquipment(entry.equipmentId);
    var max = calc.getMaxLevel(item);
    var v = calc.validateLevelRange(item, entry.current, entry.target);
    var res = state.hasCalculated ? resultByUid[uid] : null;

    // validation messages
    var lines = [];
    if (v.errors.current) lines.push(v.errors.current);
    if (v.errors.target) lines.push(v.errors.target);
    if (res && res.dataError) lines.push(res.dataError);
    ref.msg.textContent = '';
    lines.forEach(function (line) { ref.msg.appendChild(el('span', { className: 'ore-msg-line', text: line })); });
    setInvalid(ref.curInput, !!v.errors.current);
    setInvalid(ref.tgtInput, !!v.errors.target);
    ref.root.classList.toggle('is-invalid', lines.length > 0);

    // preset state mirrors the target value
    var t = calc.parseWholeNumber(entry.target);
    var isDefault = t.ok && t.value === item.defaultTarget;
    var isMax = t.ok && t.value === max;
    ref.presets.def.setAttribute('aria-pressed', String(isDefault));
    ref.presets.max.setAttribute('aria-pressed', String(isMax));
    ref.presets.custom.setAttribute('aria-pressed', String(!isDefault && !isMax));

    // per-item result
    if (!res || !res.ok) { ref.result.hidden = true; return; }
    ref.result.hidden = false;
    if (!res.breakdown.length) {
      ref.zeroNote.hidden = false;
      ref.details.hidden = true;
      return;
    }
    ref.zeroNote.hidden = true;
    ref.details.hidden = false;
    ref.summaryTotals.textContent = '';
    ref.summaryTotals.appendChild(amounts(res.total));
    ref.tbody.textContent = '';
    res.breakdown.forEach(function (row) {
      ref.tbody.appendChild(el('tr', {}, [
        el('th', { text: 'Level ' + row.level, attrs: { scope: 'row' } }),
        amountCell(row.shiny), amountCell(row.glowy), amountCell(row.starry)
      ]));
    });
    ref.tfoot.textContent = '';
    ref.tfoot.appendChild(el('tr', {}, [
      el('th', { text: 'Total', attrs: { scope: 'row' } }),
      amountCell(res.total.shiny), amountCell(res.total.glowy), amountCell(res.total.starry)
    ]));
  }

  function setInvalid(input, invalid) {
    if (invalid) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid');
  }

  function onEdited(entry) {
    save();
    if (state.hasCalculated) {
      recompute();
      refreshRow(entry.uid);
      renderSummary();
    } else {
      refreshRow(entry.uid);
    }
  }

  function renderPlan() {
    els.planList.textContent = '';
    refs = {};
    if (!state.plan.length) {
      els.planList.appendChild(el('p', { className: 'ore-empty', text: 'No equipment in the plan yet. Add a piece above, or add a hero\u2019s full set.' }));
      refreshAddControls();
      return;
    }
    var order = {};
    Data.EQUIPMENT.forEach(function (e, i) { order[e.id] = i; });
    Data.HEROES.forEach(function (hero) {
      var entries = state.plan.filter(function (e) { return calc.getEquipment(e.equipmentId).hero === hero.id; })
        .sort(function (a, b) { return order[a.equipmentId] - order[b.equipmentId]; });
      if (!entries.length) return;
      var headingId = 'ore-hero-' + hero.id;
      els.planList.appendChild(el('section', { className: 'ore-group', attrs: { 'aria-labelledby': headingId } }, [
        el('h3', { className: 'ore-hero', id: headingId }, [
          document.createTextNode(hero.name),
          el('span', { className: 'ore-count', text: String(entries.length) })
        ]),
        el('div', { className: 'ore-group-rows' }, entries.map(buildRow))
      ]));
    });
    state.plan.forEach(function (e) { refreshRow(e.uid); });
    refreshAddControls();
  }

  /* ---------------- inventory ---------------- */
  function onInventoryInput(ore) {
    state.inventory[ore] = inventoryInputs[ore].value;
    save();
    refreshInventoryMessages();
    if (state.hasCalculated) renderSummary();
  }

  function refreshInventoryMessages() {
    var problems = [];
    Data.ORE_TYPES.forEach(function (ore) {
      var ok = calc.parseInventory(state.inventory[ore]).ok;
      setInvalid(inventoryInputs[ore], !ok);
      if (!ok) problems.push(Data.ORE_LABELS[ore] + ': enter a whole number of 0 or more.');
    });
    els.invMsg.textContent = problems.join(' ');
  }

  /* ---------------- summary ---------------- */
  function renderSummary() {
    var n = state.plan.length;
    if (!state.hasCalculated || !n || !lastPlan) {
      els.resultEmpty.hidden = false;
      els.resultContent.hidden = true;
      return;
    }
    els.resultEmpty.hidden = true;
    els.resultContent.hidden = false;

    var valid = lastPlan.validCount;
    var invalid = lastPlan.invalidCount;
    els.countLine.textContent = 'Totals cover ' + valid + ' of ' + n + (n === 1 ? ' item.' : ' items.');
    if (invalid) {
      els.skipNote.hidden = false;
      els.skipNote.textContent = invalid + (invalid === 1 ? ' item has' : ' items have') + ' a level problem and ' +
        (invalid === 1 ? 'isn\u2019t' : 'aren\u2019t') + ' counted. Fix ' + (invalid === 1 ? 'it' : 'them') + ' in the plan.';
    } else {
      els.skipNote.hidden = true;
    }

    els.sumWrap.hidden = valid === 0;
    els.sumBody.textContent = '';
    if (!valid) return;

    var cmp = calc.compareInventory(lastPlan.combined, state.inventory);
    Data.ORE_TYPES.forEach(function (ore) {
      var c = cmp[ore];
      var balance;
      if (c.error) {
        balance = el('td', { className: 'num', text: 'Check stock' });
      } else if (c.deficit > 0) {
        balance = el('td', { className: 'num ore-short' }, [
          el('span', { className: 'sr-only', text: 'Short by ' }), document.createTextNode(MINUS + fmt.format(c.deficit))]);
      } else if (c.surplus > 0) {
        balance = el('td', { className: 'num ore-spare' }, [
          el('span', { className: 'sr-only', text: 'Spare ' }), document.createTextNode('+' + fmt.format(c.surplus))]);
      } else {
        balance = el('td', { className: 'num' + (c.required === 0 ? ' zero' : ' ore-spare'), text: c.required === 0 ? '\u2013' : 'Exact' });
      }
      els.sumBody.appendChild(el('tr', {}, [
        el('th', { text: Data.ORE_LABELS[ore].replace(' Ore', ''), attrs: { scope: 'row' } }),
        el('td', { className: 'num ore-need' + (c.required === 0 ? ' zero' : ''), text: fmt.format(c.required) }),
        el('td', { className: 'num', text: c.owned === null ? '\u2013' : fmt.format(c.owned) }),
        balance
      ]));
    });
  }

  function calculateAll() {
    if (!dataOk) return;
    if (!state.plan.length) {
      showError('Add at least one equipment item first.');
      return;
    }
    showError('');
    state.hasCalculated = true;
    recalcAll();
    var msg = lastPlan.validCount + ' of ' + state.plan.length + ' items calculated.';
    if (lastPlan.invalidCount) msg += ' ' + lastPlan.invalidCount + ' need attention.';
    announce(msg);
    if (window.matchMedia && window.matchMedia('(max-width: 979px)').matches && els.resultContent.scrollIntoView) {
      var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      els.resultContent.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    }
  }

  /* ---------------- data & sources ---------------- */
  function renderSource() {
    var meta = Data.META;
    els.source.textContent = '';
    els.source.appendChild(el('p', { text: meta.status }));
    els.source.appendChild(el('p', { className: 'ore-source-line', text: 'Dataset ' + meta.version + ', retrieved ' + meta.retrievedOn + '. Unverified levels: ' +
      (meta.unverified.length ? meta.unverified.join(', ') : 'none flagged') + '.' }));
    els.source.appendChild(el('ul', {}, meta.notes.map(function (note) { return el('li', { text: note }); })));
    els.source.appendChild(el('p', { className: 'ore-source-line', text: 'Sources consulted:' }));
    els.source.appendChild(el('ul', {}, meta.sources.map(function (s) {
      return el('li', {}, [
        el('a', { text: s.label, attrs: { href: s.url, target: '_blank', rel: 'noopener noreferrer' } }),
        document.createTextNode(': ' + s.covers)
      ]);
    })));
  }

  /* ---------------- wire up ---------------- */
  function init() {
    Data.HEROES.forEach(function (hero) {
      els.heroSelect.appendChild(el('option', { text: hero.name, attrs: { value: hero.id } }));
    });
    els.heroSelect.addEventListener('change', refreshAddControls);
    els.addBtn.addEventListener('click', function () {
      if (els.equipSelect.value) addItems([els.equipSelect.value]);
    });
    els.addHeroBtn.addEventListener('click', function () {
      addItems(remainingFor(els.heroSelect.value).map(function (e) { return e.id; }));
    });
    els.addAllBtn.addEventListener('click', function () {
      addItems(Data.EQUIPMENT.map(function (e) { return e.id; }));
    });
    els.restoreBtn.addEventListener('click', restoreDefaultTargets);
    els.clearBtn.addEventListener('click', clearPlan);
    els.calcBtn.addEventListener('click', calculateAll);

    Data.ORE_TYPES.forEach(function (ore) {
      var input = inventoryInputs[ore];
      input.value = state.inventory[ore];
      input.addEventListener('input', function () { onInventoryInput(ore); });
      input.addEventListener('keydown', onEnterCalculate);
    });

    var integrity = calc.validateCostTables();
    if (!integrity.ok) {
      dataOk = false;
      els.dataError.hidden = false;
      els.dataError.classList.add('show');
      els.dataError.textContent = 'The ore cost data failed its integrity check, so calculation is disabled. ' +
        integrity.problems.slice(0, 3).join('; ') + '.';
      els.calcBtn.disabled = true;
    }

    renderSource();
    renderPlan();
    refreshInventoryMessages();
    renderSummary();
  }

  load();
  init();
})();
