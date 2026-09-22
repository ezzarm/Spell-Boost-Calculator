(function(){
  "use strict";

  function $(id){ return document.getElementById(id); }

  /* ---------------- config: presets (data-driven, not hard-coded into the engine) ---------------- */
  var PRESETS = [
    { id: 'builder',  name: 'Builder Potion',  multiplier: 10, hours: 1, minutes: 0 },
    { id: 'research', name: 'Research Potion', multiplier: 24, hours: 1, minutes: 0 },
    { id: 'pet',      name: 'Pet Potion',      multiplier: 24, hours: 1, minutes: 0 },
    { id: 'custom',   name: 'Custom',          multiplier: 2,  hours: 1, minutes: 0 }
  ];
  var TZ_OFFSET_HOURS = { WIB: 7, WITA: 8, WIT: 9 };
  var TZ_LABEL = { WIB: 'WIB', WITA: 'WITA', WIT: 'WIT', LOCAL: 'local time' };
  var WEEKDAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  var MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

  var boosts = []; // {uid, presetId, name, multiplier, hours, minutes}
  var uidCounter = 1;
  var countdownTimer = null;

  /* ---------------- helpers: time & formatting (unchanged math) ---------------- */
  function pad2(n){ return String(n).padStart(2,'0'); }

  function durationToSeconds(d,h,m){ return (d*86400)+(h*3600)+(m*60); }

  function formatDurationSeconds(totalSeconds){
    totalSeconds = Math.max(0, Math.round(totalSeconds));
    var d = Math.floor(totalSeconds / 86400);
    var h = Math.floor((totalSeconds % 86400) / 3600);
    var m = Math.round((totalSeconds % 3600) / 60);
    if (m === 60) { m = 0; h += 1; }
    if (h === 24) { h = 0; d += 1; }
    var parts = [];
    if (d) parts.push(d + 'd');
    if (h) parts.push(h + 'h');
    if (m || parts.length === 0) parts.push(m + 'm');
    return parts.join(' ');
  }

  function parseQuickDuration(str){
    if (!str) return null;
    var d = 0, h = 0, m = 0, matched = false;
    var md = str.match(/(\d+)\s*d/i); if (md) { d = parseInt(md[1],10); matched = true; }
    var mh = str.match(/(\d+)\s*h/i); if (mh) { h = parseInt(mh[1],10); matched = true; }
    var mm = str.match(/(\d+)\s*m/i); if (mm) { m = parseInt(mm[1],10); matched = true; }
    if (!matched) return null;
    return { d: d, h: h, m: m };
  }

  // Convert a wall-clock date+time in a given fixed-offset (or device-local) timezone into an absolute epoch ms.
  function toAbsoluteMs(year, monthIdx, day, hour, minute, tz){
    if (tz === 'LOCAL') {
      return new Date(year, monthIdx, day, hour, minute, 0, 0).getTime();
    }
    var offset = TZ_OFFSET_HOURS[tz];
    return Date.UTC(year, monthIdx, day, hour, minute, 0, 0) - offset*3600000;
  }

  // Read the wall-clock parts of an absolute epoch ms, as seen in the given timezone.
  function getWallParts(ms, tz){
    if (tz === 'LOCAL') {
      var d = new Date(ms);
      return { y:d.getFullYear(), mo:d.getMonth(), day:d.getDate(), h:d.getHours(), mi:d.getMinutes(), dow:d.getDay() };
    }
    var offset = TZ_OFFSET_HOURS[tz];
    var shifted = new Date(ms + offset*3600000);
    return { y:shifted.getUTCFullYear(), mo:shifted.getUTCMonth(), day:shifted.getUTCDate(), h:shifted.getUTCHours(), mi:shifted.getUTCMinutes(), dow:shifted.getUTCDay() };
  }

  function formatWallClock(ms, tz){
    var p = getWallParts(ms, tz);
    return {
      weekday: WEEKDAYS[p.dow],
      dateStr: p.day + ' ' + MONTHS[p.mo] + ' ' + p.y,
      timeStr: pad2(p.h) + ':' + pad2(p.mi),
      tzLabel: TZ_LABEL[tz]
    };
  }

  function shortStamp(ms, tz){
    var p = getWallParts(ms, tz);
    return p.day + ' ' + MONTHS[p.mo].slice(0,3) + ', ' + pad2(p.h) + ':' + pad2(p.mi);
  }

  /* ---------------- boost queue UI ---------------- */
  function addBoost(presetId){
    var preset = PRESETS.find(function(p){ return p.id === presetId; }) || PRESETS[0];
    boosts.push({
      uid: uidCounter++,
      presetId: preset.id,
      name: preset.name,
      multiplier: preset.multiplier,
      hours: preset.hours,
      minutes: preset.minutes
    });
    renderBoosts();
  }

  function renderBoosts(){
    var list = $('boostList');
    list.innerHTML = '';
    boosts.forEach(function(b, idx){
      var card = document.createElement('div');
      card.className = 'boost-card';

      var top = document.createElement('div');
      top.className = 'boost-card-top';

      var indexEl = document.createElement('div');
      indexEl.className = 'boost-index';
      indexEl.setAttribute('aria-hidden', 'true');
      indexEl.textContent = idx+1;

      var presetSelect = document.createElement('select');
      presetSelect.setAttribute('aria-label', 'Boost ' + (idx+1) + ' type');
      PRESETS.forEach(function(p){
        var opt = document.createElement('option');
        opt.value = p.id; opt.textContent = p.name;
        if (p.id === b.presetId) opt.selected = true;
        presetSelect.appendChild(opt);
      });
      presetSelect.addEventListener('change', function(){
        var preset = PRESETS.find(function(p){ return p.id === presetSelect.value; });
        b.presetId = preset.id;
        b.name = preset.name;
        b.multiplier = preset.multiplier;
        b.hours = preset.hours;
        b.minutes = preset.minutes;
        renderBoosts();
      });

      var actions = document.createElement('div');
      actions.className = 'boost-actions';

      function makeIconBtn(label, title, onClick, opts){
        opts = opts || {};
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'icon-btn' + (opts.danger ? ' danger' : '');
        btn.title = title;
        btn.setAttribute('aria-label', title);
        btn.textContent = label;
        if (opts.disabled) btn.disabled = true;
        btn.addEventListener('click', onClick);
        return btn;
      }

      actions.appendChild(makeIconBtn('▲','Move boost ' + (idx+1) + ' up', function(){
        if (idx > 0) { var t = boosts[idx-1]; boosts[idx-1] = boosts[idx]; boosts[idx] = t; renderBoosts(); }
      }, { disabled: idx === 0 }));
      actions.appendChild(makeIconBtn('▼','Move boost ' + (idx+1) + ' down', function(){
        if (idx < boosts.length-1) { var t = boosts[idx+1]; boosts[idx+1] = boosts[idx]; boosts[idx] = t; renderBoosts(); }
      }, { disabled: idx === boosts.length-1 }));
      actions.appendChild(makeIconBtn('⧉','Duplicate boost ' + (idx+1), function(){
        boosts.splice(idx+1, 0, Object.assign({}, b, { uid: uidCounter++ }));
        renderBoosts();
      }));
      actions.appendChild(makeIconBtn('✕','Delete boost ' + (idx+1), function(){
        boosts.splice(idx,1); renderBoosts();
      }, { danger: true }));

      top.appendChild(indexEl);
      top.appendChild(presetSelect);
      top.appendChild(actions);

      var fields = document.createElement('div');
      fields.className = 'boost-fields';

      function fieldMini(fieldKey, labelText, value, min, step, onInput){
        var wrap = document.createElement('div');
        wrap.className = 'field-mini';
        var inputId = 'boost-' + b.uid + '-' + fieldKey;
        var lab = document.createElement('label');
        lab.textContent = labelText;
        lab.setAttribute('for', inputId);
        var inp = document.createElement('input');
        inp.type = 'number'; inp.id = inputId; inp.min = min; inp.value = value;
        if (step) inp.step = step;
        inp.addEventListener('input', function(){ onInput(inp.value); });
        wrap.appendChild(lab); wrap.appendChild(inp);
        return wrap;
      }

      fields.appendChild(fieldMini('mult', 'Multiplier ×', b.multiplier, 0.1, 0.1, function(v){ b.multiplier = parseFloat(v)||0; }));
      fields.appendChild(fieldMini('hours', 'Hours', b.hours, 0, 1, function(v){ b.hours = parseInt(v,10)||0; }));
      fields.appendChild(fieldMini('minutes', 'Minutes', b.minutes, 0, 1, function(v){ b.minutes = parseInt(v,10)||0; }));

      card.appendChild(top);
      card.appendChild(fields);
      list.appendChild(card);
    });
  }

  /* ---------------- core calculation engine (unchanged) ---------------- */
  // boostsInput: [{name, multiplier, durationSeconds}]
  // Each boost is applied in order for its full duration (converted to
  // accelerated progress = duration × multiplier) until the process's
  // remaining work is used up; if a boost finishes the process partway
  // through, only the real time actually needed for that boost is counted.
  // Anything left after all boosts runs at normal (1×) speed.
  function runEngine(startMs, initialSeconds, boostsInput){
    var remaining = initialSeconds;
    var currentMs = startMs;
    var totalRealSeconds = 0;
    var segments = [];
    var finishedDuringBoostIndex = -1;

    for (var i = 0; i < boostsInput.length; i++){
      if (remaining <= 0) break;
      var boost = boostsInput[i];
      var boostDurSec = boost.durationSeconds;
      var multiplier = boost.multiplier;
      if (boostDurSec <= 0 || multiplier <= 0) continue;

      var acceleratedProgress = boostDurSec * multiplier;

      if (acceleratedProgress >= remaining){
        var realTimeNeeded = remaining / multiplier;
        var finishMs = currentMs + realTimeNeeded*1000;
        segments.push({ type:'boost', name: boost.name, multiplier: multiplier, startMs: currentMs, endMs: finishMs, durationSeconds: realTimeNeeded, partial: true });
        totalRealSeconds += realTimeNeeded;
        currentMs = finishMs;
        remaining = 0;
        finishedDuringBoostIndex = i;
        break;
      } else {
        segments.push({ type:'boost', name: boost.name, multiplier: multiplier, startMs: currentMs, endMs: currentMs + boostDurSec*1000, durationSeconds: boostDurSec, partial: false });
        remaining -= acceleratedProgress;
        currentMs += boostDurSec*1000;
        totalRealSeconds += boostDurSec;
      }
    }

    var remainingAfterBoosts = remaining;
    if (remaining > 0){
      var normalFinish = currentMs + remaining*1000;
      segments.push({ type:'normal', startMs: currentMs, endMs: normalFinish, durationSeconds: remaining });
      totalRealSeconds += remaining;
      currentMs = normalFinish;
      remainingAfterBoosts = remaining;
    } else {
      remainingAfterBoosts = 0;
    }

    return {
      finishMs: currentMs,
      totalRealSeconds: totalRealSeconds,
      remainingAfterBoosts: remainingAfterBoosts,
      segments: segments,
      finishedDuringBoostIndex: finishedDuringBoostIndex
    };
  }

  /* ---------------- validation ---------------- */
  function showError(msg){
    var el = $('errorBanner');
    if (!msg){ el.classList.remove('show'); el.textContent=''; return; }
    el.textContent = msg;
    el.classList.add('show');
  }

  function readInputsOrNull(){
    showError(null);
    var tz = $('tzSelect').value;
    var dateVal = $('startDate').value;
    var timeVal = $('startTime').value;
    if (!dateVal || !timeVal){ showError('Please choose a valid start date and time.'); return null; }
    var dp = dateVal.split('-').map(Number);
    var tp = timeVal.split(':').map(Number);
    var startMs = toAbsoluteMs(dp[0], dp[1]-1, dp[2], tp[0], tp[1], tz);
    if (isNaN(startMs)){ showError('Please choose a valid start date and time.'); return null; }

    var d = parseInt($('durDays').value,10) || 0;
    var h = parseInt($('durHours').value,10) || 0;
    var m = parseInt($('durMinutes').value,10) || 0;
    if (d < 0 || h < 0 || m < 0){ showError('Please enter a valid duration.'); return null; }
    var initialSeconds = durationToSeconds(d,h,m);
    if (initialSeconds <= 0){ showError('Please enter a valid duration.'); return null; }

    var boostsInput = [];
    for (var i = 0; i < boosts.length; i++){
      var b = boosts[i];
      if (b.multiplier <= 0){ showError('Boost #' + (i+1) + ' needs a multiplier greater than 0.'); return null; }
      var bs = durationToSeconds(0, b.hours||0, b.minutes||0);
      if (bs <= 0){ showError('Boost #' + (i+1) + ' needs a duration greater than 0.'); return null; }
      boostsInput.push({ name: b.name, multiplier: b.multiplier, durationSeconds: bs });
    }

    return { tz: tz, startMs: startMs, initialSeconds: initialSeconds, boostsInput: boostsInput, processType: $('processType').value };
  }

  /* ---------------- rendering the result ---------------- */
  var lastResult = null;

  function renderTimeline(startMs, initialSeconds, result, tz){
    var track = $('timelineTrack');
    var labels = $('timelineLabels');
    track.innerHTML = ''; labels.innerHTML = '';
    var total = result.totalRealSeconds || 1;
    var palette = ['#D9A441','#E1592A','#C9862F','#B87B2A'];
    var boostIdx = 0;

    result.segments.forEach(function(seg){
      var weight = Math.max(seg.durationSeconds / total, 0.06);
      var segEl = document.createElement('div');
      segEl.className = 'tl-seg' + (seg.type === 'normal' ? ' normal' : '');
      segEl.style.flexGrow = weight;
      segEl.style.flexBasis = 0;
      if (seg.type === 'boost'){
        segEl.style.background = palette[boostIdx % palette.length];
        segEl.textContent = seg.multiplier + '×' + (seg.partial ? ' (partial)' : '');
        boostIdx++;
      } else {
        segEl.textContent = 'Normal';
      }
      track.appendChild(segEl);

      var labelEl = document.createElement('div');
      labelEl.className = 'tl-label';
      labelEl.style.flexGrow = weight;
      labelEl.style.flexBasis = 0;
      labelEl.textContent = shortStamp(seg.endMs, tz);
      labels.appendChild(labelEl);
    });

    if (track.firstChild) track.firstChild.title = 'Starts ' + shortStamp(startMs, tz);
  }

  function buildBreakdownText(inputs, result){
    var lines = [];
    lines.push('Initial duration');
    lines.push(formatDurationSeconds(inputs.initialSeconds) + ' = ' + Math.round(inputs.initialSeconds/3600*100)/100 + 'h');
    lines.push('');
    result.segments.forEach(function(seg, i){
      if (seg.type === 'boost'){
        lines.push((i+1) + '. Boost: ' + seg.name + ', ' + seg.multiplier + '× for ' + formatDurationSeconds(seg.durationSeconds));
        lines.push('   ' + formatDurationSeconds(seg.durationSeconds) + ' × ' + seg.multiplier + ' = ' + formatDurationSeconds(seg.durationSeconds*seg.multiplier) + ' progress');
        if (seg.partial) lines.push('   This boost alone is enough to finish the process.');
        lines.push('   Ends ' + shortStamp(seg.endMs, inputs.tz));
      } else {
        lines.push((i+1) + '. Normal speed for ' + formatDurationSeconds(seg.durationSeconds));
        lines.push('   Ends ' + shortStamp(seg.endMs, inputs.tz));
      }
      lines.push('');
    });
    lines.push('Finished');
    lines.push(shortStamp(result.finishMs, inputs.tz));
    return lines.join('\n');
  }

  function renderResult(inputs, result){
    $('resultEmpty').style.display = 'none';
    $('resultContent').style.display = 'block';

    var w = formatWallClock(result.finishMs, inputs.tz);
    $('rWeekday').textContent = w.weekday;
    $('rDate').textContent = w.dateStr;
    $('rTime').textContent = w.timeStr;
    $('rTz').textContent = w.tzLabel;

    var timeSaved = Math.max(0, inputs.initialSeconds - result.totalRealSeconds);
    $('rSaved').textContent = timeSaved > 0 ? formatDurationSeconds(timeSaved) : '0m';
    $('rRemain').textContent = formatDurationSeconds(result.remainingAfterBoosts);
    $('rRealTime').textContent = formatDurationSeconds(result.totalRealSeconds);

    var noticeEl = $('midBoostNotice');
    if (result.finishedDuringBoostIndex >= 0){
      noticeEl.style.display = 'block';
      noticeEl.textContent = 'Boost #' + (result.finishedDuringBoostIndex+1) + ' is enough to finish the process on its own — the timer completes while that boost is still active.';
    } else {
      noticeEl.style.display = 'none';
    }

    renderTimeline(inputs.startMs, inputs.initialSeconds, result, inputs.tz);
    $('breakdownText').textContent = buildBreakdownText(inputs, result);

    startCountdown(result.finishMs);
    lastResult = { inputs: inputs, result: result };
  }

  function startCountdown(finishMs){
    if (countdownTimer) clearInterval(countdownTimer);
    var box = $('countdownBox');
    var valueEl = $('countdownValue');
    function tick(){
      var diff = finishMs - Date.now();
      if (diff <= 0){
        box.classList.add('done');
        valueEl.textContent = 'COMPLETE';
        clearInterval(countdownTimer);
        return;
      }
      box.classList.remove('done');
      var s = Math.floor(diff/1000);
      var d = Math.floor(s/86400); s -= d*86400;
      var h = Math.floor(s/3600); s -= h*3600;
      var m = Math.floor(s/60); s -= m*60;
      valueEl.textContent = d + 'd ' + pad2(h) + 'h ' + pad2(m) + 'm ' + pad2(s) + 's';
    }
    tick();
    countdownTimer = setInterval(tick, 1000);
  }

  function calculate(){
    var inputs = readInputsOrNull();
    if (!inputs) return;
    var result = runEngine(inputs.startMs, inputs.initialSeconds, inputs.boostsInput);
    renderResult(inputs, result);
  }

  /* ---------------- saved calculations (localStorage, per-device) ---------------- */
  var STORAGE_KEY = 'rally_coc_saved_calcs_v1';

  function loadSaved(){
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch(e){ return []; }
  }
  function persistSaved(items){
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); } catch(e){}
  }
  function renderSaved(){
    var list = $('savedList');
    var items = loadSaved();
    list.innerHTML = '';
    if (!items.length){
      list.innerHTML = '<div class="saved-empty">Nothing saved yet.</div>';
      return;
    }
    items.slice().reverse().forEach(function(item){
      var row = document.createElement('button');
      row.type = 'button';
      row.className = 'saved-item';
      row.setAttribute('aria-label', 'Load saved calculation: ' + item.title + ', ' + item.summary);
      var meta = document.createElement('div');
      meta.className = 'meta';
      var t = document.createElement('div'); t.className = 't'; t.textContent = item.title;
      var s = document.createElement('div'); s.className = 's'; s.textContent = item.summary;
      meta.appendChild(t); meta.appendChild(s);
      var del = document.createElement('span');
      del.className = 'icon-btn danger del'; del.textContent = '✕';
      del.setAttribute('role', 'button');
      del.setAttribute('tabindex', '0');
      del.setAttribute('aria-label', 'Delete saved calculation: ' + item.title);
      function removeItem(ev){
        ev.stopPropagation();
        var all = loadSaved().filter(function(x){ return x.id !== item.id; });
        persistSaved(all);
        renderSaved();
      }
      del.addEventListener('click', removeItem);
      del.addEventListener('keydown', function(ev){ if (ev.key === 'Enter' || ev.key === ' '){ ev.preventDefault(); removeItem(ev); } });
      row.appendChild(meta); row.appendChild(del);
      row.addEventListener('click', function(){ loadSavedIntoForm(item); });
      list.appendChild(row);
    });
  }
  function loadSavedIntoForm(item){
    $('processType').value = item.processType;
    $('durDays').value = item.d;
    $('durHours').value = item.h;
    $('durMinutes').value = item.m;
    $('tzSelect').value = item.tz;
    var dt = new Date(item.startMs);
    $('startDate').value = dt.toISOString().slice(0,10);
    $('startTime').value = pad2(dt.getHours()) + ':' + pad2(dt.getMinutes());
    boosts = item.boosts.map(function(b){ return Object.assign({}, b, { uid: uidCounter++ }); });
    renderBoosts();
    calculate();
  }

  $('saveBtn').addEventListener('click', function(){
    if (!lastResult) return;
    var inputs = lastResult.inputs, result = lastResult.result;
    var w = formatWallClock(result.finishMs, inputs.tz);
    var item = {
      id: 'c' + Date.now(),
      title: inputs.processType,
      summary: formatDurationSeconds(inputs.initialSeconds) + ' → finishes ' + w.dateStr + ' ' + w.timeStr,
      processType: inputs.processType,
      d: Math.floor(inputs.initialSeconds/86400),
      h: Math.floor((inputs.initialSeconds%86400)/3600),
      m: Math.round((inputs.initialSeconds%3600)/60),
      tz: inputs.tz,
      startMs: inputs.startMs,
      boosts: boosts.map(function(b){ return { presetId:b.presetId, name:b.name, multiplier:b.multiplier, hours:b.hours, minutes:b.minutes }; })
    };
    var items = loadSaved();
    items.push(item);
    persistSaved(items);
    renderSaved();
  });

  $('shareBtn').addEventListener('click', function(){
    if (!lastResult) return;
    var inputs = lastResult.inputs, result = lastResult.result;
    var startFmt = formatWallClock(inputs.startMs, inputs.tz);
    var w = formatWallClock(result.finishMs, inputs.tz);
    var timeSaved = Math.max(0, inputs.initialSeconds - result.totalRealSeconds);
    var text = 'Rally · Boost Time Calculator\n\n' +
      'Initial: ' + formatDurationSeconds(inputs.initialSeconds) + '\n' +
      'Start: ' + startFmt.dateStr + ' ' + startFmt.timeStr + ' ' + startFmt.tzLabel + '\n\n' +
      'Finish: ' + w.dateStr + ' ' + w.timeStr + ' ' + w.tzLabel + '\n' +
      'Saved: ' + formatDurationSeconds(timeSaved);
    if (navigator.share){
      navigator.share({ title: 'Rally — Boost Time Calculator', text: text }).catch(function(){});
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(function(){
        var btn = $('shareBtn');
        var old = btn.textContent;
        btn.textContent = 'Copied!';
        setTimeout(function(){ btn.textContent = old; }, 1500);
      });
    }
  });

  /* ---------------- wire up static controls ---------------- */
  $('addBoostBtn').addEventListener('click', function(){ addBoost('builder'); });
  $('calculateBtn').addEventListener('click', calculate);
  $('quickFillBtn').addEventListener('click', function(){
    var parsed = parseQuickDuration($('quickDuration').value);
    if (!parsed){ showError('Could not read that duration — try formats like "2d 17h".'); return; }
    $('durDays').value = parsed.d;
    $('durHours').value = parsed.h;
    $('durMinutes').value = parsed.m;
    showError(null);
  });

  /* ---------------- init defaults ---------------- */
  (function init(){
    var now = new Date();
    $('startDate').value = now.toISOString().slice(0,10);
    $('startTime').value = pad2(now.getHours()) + ':' + pad2(now.getMinutes());
    $('durDays').value = 2;
    $('durHours').value = 17;
    $('durMinutes').value = 0;

    addBoost('builder');
    renderSaved();
  })();

})();