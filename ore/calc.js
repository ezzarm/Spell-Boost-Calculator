/* ============================================================
   HERO EQUIPMENT ORE CALCULATIONS
   Pure functions only: no DOM, no storage. Data is passed in, so the
   same code runs in the browser (window.OreCalc) and under Node tests.

   cost(A -> B) = sum of the cost of each upgrade A+1 ... B inclusive.
   ============================================================ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.OreCalc = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function OreCalcError(code, message) {
    this.name = 'OreCalcError';
    this.code = code; // 'INVALID_RANGE' | 'MISSING_COST_DATA' | 'UNKNOWN_EQUIPMENT'
    this.message = message;
    if (Error.captureStackTrace) Error.captureStackTrace(this, OreCalcError);
  }
  OreCalcError.prototype = Object.create(Error.prototype);
  OreCalcError.prototype.constructor = OreCalcError;

  function createCalculator(data) {
    var ORE_TYPES = data.ORE_TYPES;
    var RARITIES = data.RARITIES;
    var COSTS = data.ORE_COSTS;

    var byId = {};
    data.EQUIPMENT.forEach(function (item) { byId[item.id] = item; });

    /* ---------- totals helpers ---------- */
    function emptyTotals() {
      var t = {};
      ORE_TYPES.forEach(function (ore) { t[ore] = 0; });
      return t;
    }

    function addInto(target, source) {
      ORE_TYPES.forEach(function (ore) { target[ore] += source[ore]; });
      return target;
    }

    /* ---------- registry ---------- */
    function getEquipment(id) {
      var item = byId[id];
      if (!item) throw new OreCalcError('UNKNOWN_EQUIPMENT', 'Unknown equipment: ' + id);
      return item;
    }

    function getMaxLevel(item) {
      return RARITIES[item.rarity].maxLevel;
    }

    /* kind: 'default' (user's preset target) | 'max' (rarity maximum) */
    function getPresetTarget(item, kind) {
      return kind === 'max' ? getMaxLevel(item) : item.defaultTarget;
    }

    /* ---------- parsing and validation ---------- */
    // Accepts a number or a string of digits (optional leading minus).
    function parseWholeNumber(raw) {
      if (raw === null || raw === undefined) return { ok: false, reason: 'blank' };
      if (typeof raw === 'number') {
        return Number.isInteger(raw) ? { ok: true, value: raw } : { ok: false, reason: 'format' };
      }
      var s = String(raw).trim();
      if (s === '') return { ok: false, reason: 'blank' };
      if (!/^-?\d+$/.test(s)) return { ok: false, reason: 'format' };
      return { ok: true, value: parseInt(s, 10) };
    }

    // Never throws. Returns every problem so the UI can show them together.
    function validateLevelRange(item, currentRaw, targetRaw) {
      var max = getMaxLevel(item);
      var label = RARITIES[item.rarity].label;
      var errors = {};
      var current = null;
      var target = null;

      var c = parseWholeNumber(currentRaw);
      if (!c.ok) {
        errors.current = c.reason === 'blank' ? 'Enter the current level.' : 'Current level must be a whole number.';
      } else if (c.value < 1) {
        errors.current = 'Current level must be at least 1.';
      } else if (c.value > max) {
        errors.current = 'Current level can\u2019t be above ' + max + ' (' + label + ' maximum).';
      } else {
        current = c.value;
      }

      var t = parseWholeNumber(targetRaw);
      if (!t.ok) {
        errors.target = t.reason === 'blank' ? 'Enter a target level.' : 'Target level must be a whole number.';
      } else if (t.value < 1) {
        errors.target = 'Target level must be at least 1.';
      } else if (t.value > max) {
        errors.target = 'Target level can\u2019t be above ' + max + ' (' + label + ' maximum).';
      } else if (current !== null && t.value < current) {
        errors.target = 'Target level can\u2019t be lower than the current level (' + current + ').';
      } else {
        target = t.value;
      }

      var ok = current !== null && target !== null && !errors.current && !errors.target;
      return { ok: ok, current: ok ? current : null, target: ok ? target : null, errors: errors };
    }

    function firstError(errors) {
      return errors.current || errors.target || 'Invalid level range.';
    }

    /* ---------- costs ---------- */
    function isOreAmount(n) {
      return typeof n === 'number' && Number.isInteger(n) && n >= 0;
    }

    // Cost of the single upgrade TO `level`. Missing or malformed data is an error, never zero.
    function getLevelCost(item, level) {
      var table = COSTS[item.rarity];
      var entry = table ? table[level] : undefined;
      var valid = entry && ORE_TYPES.every(function (ore) { return isOreAmount(entry[ore]); });
      if (!valid) {
        throw new OreCalcError('MISSING_COST_DATA',
          'Missing ore cost data for ' + item.name + ', level ' + level + '.');
      }
      return entry;
    }

    function getUpgradeBreakdown(item, current, target) {
      var rows = [];
      for (var level = current + 1; level <= target; level += 1) {
        var cost = getLevelCost(item, level);
        var row = { level: level };
        ORE_TYPES.forEach(function (ore) { row[ore] = cost[ore]; });
        rows.push(row);
      }
      return rows;
    }

    function sumBreakdown(rows) {
      var total = emptyTotals();
      rows.forEach(function (row) { addInto(total, row); });
      return total;
    }

    // Throws OreCalcError on an invalid range or missing data.
    function calculateOreCost(item, current, target) {
      var v = validateLevelRange(item, current, target);
      if (!v.ok) throw new OreCalcError('INVALID_RANGE', firstError(v.errors));
      return sumBreakdown(getUpgradeBreakdown(item, v.current, v.target));
    }

    /* ---------- plan ---------- */
    // entries: [{ uid, equipmentId, current, target }] with raw (string) levels.
    // Invalid entries are reported and excluded from the combined total.
    function calculatePlan(entries) {
      var combined = emptyTotals();
      var validCount = 0;
      var items = entries.map(function (entry) {
        var item = getEquipment(entry.equipmentId);
        var result = { uid: entry.uid, item: item, ok: false, errors: {}, dataError: null,
                       current: null, target: null, breakdown: [], total: emptyTotals() };
        var v = validateLevelRange(item, entry.current, entry.target);
        result.errors = v.errors;
        if (!v.ok) return result;
        try {
          result.breakdown = getUpgradeBreakdown(item, v.current, v.target);
        } catch (err) {
          if (err instanceof OreCalcError) { result.dataError = err.message; return result; }
          throw err;
        }
        result.ok = true;
        result.current = v.current;
        result.target = v.target;
        result.total = sumBreakdown(result.breakdown);
        addInto(combined, result.total);
        validCount += 1;
        return result;
      });
      return { items: items, combined: combined, validCount: validCount, invalidCount: items.length - validCount };
    }

    /* ---------- inventory ---------- */
    // Blank counts as 0. Anything else must be a whole number >= 0.
    function parseInventory(raw) {
      var p = parseWholeNumber(raw);
      if (!p.ok) return p.reason === 'blank' ? { ok: true, value: 0 } : { ok: false };
      return p.value >= 0 ? { ok: true, value: p.value } : { ok: false };
    }

    function compareInventory(required, inventoryRaw) {
      var out = {};
      ORE_TYPES.forEach(function (ore) {
        var p = parseInventory(inventoryRaw[ore]);
        var need = required[ore];
        if (!p.ok) {
          out[ore] = { required: need, owned: null, deficit: null, surplus: null,
                       error: 'Enter a whole number of 0 or more.' };
        } else {
          out[ore] = { required: need, owned: p.value,
                       deficit: Math.max(0, need - p.value),
                       surplus: Math.max(0, p.value - need), error: null };
        }
      });
      return out;
    }

    /* ---------- dataset integrity ---------- */
    // Every upgrade destination level (2..max) must have exactly one valid entry.
    function validateCostTables() {
      var problems = [];
      Object.keys(RARITIES).forEach(function (rarity) {
        var max = RARITIES[rarity].maxLevel;
        var table = COSTS[rarity];
        if (!table) { problems.push('No cost table for ' + rarity); return; }
        for (var level = 2; level <= max; level += 1) {
          var entry = table[level];
          if (!entry) { problems.push(rarity + ': missing level ' + level); continue; }
          ORE_TYPES.forEach(function (ore) {
            if (!isOreAmount(entry[ore])) problems.push(rarity + ' L' + level + ': invalid ' + ore);
          });
          if (rarity === 'common' && entry.starry !== 0) problems.push('common L' + level + ': Starry Ore must be 0');
        }
        Object.keys(table).forEach(function (key) {
          var n = Number(key);
          if (n < 2 || n > max) problems.push(rarity + ': unexpected level ' + key);
        });
      });
      return { ok: problems.length === 0, problems: problems };
    }

    return {
      getEquipment: getEquipment,
      getMaxLevel: getMaxLevel,
      getPresetTarget: getPresetTarget,
      parseWholeNumber: parseWholeNumber,
      validateLevelRange: validateLevelRange,
      getLevelCost: getLevelCost,
      getUpgradeBreakdown: getUpgradeBreakdown,
      sumBreakdown: sumBreakdown,
      calculateOreCost: calculateOreCost,
      calculatePlan: calculatePlan,
      parseInventory: parseInventory,
      compareInventory: compareInventory,
      validateCostTables: validateCostTables,
      emptyTotals: emptyTotals
    };
  }

  return { createCalculator: createCalculator, OreCalcError: OreCalcError };
});
