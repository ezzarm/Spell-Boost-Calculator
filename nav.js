/* ============================================================
   VIEW SWITCHING
   Two views, one page. The URL hash picks the view (#time, #ore), so
   links, refresh and the back button all work. Both views stay in the
   DOM; the inactive one is hidden, so neither loses its state.
   ============================================================ */
(function () {
  'use strict';

  var VIEWS = {
    time: {
      panel: 'view-time',
      tab: 'tab-time',
      title: 'Rally \u00b7 Boost Time Calculator',
      subtitle: 'Boost time calculator for building, research, hero & pet upgrades',
      showTimezone: true
    },
    ore: {
      panel: 'view-ore',
      tab: 'tab-ore',
      title: 'Rally \u00b7 Hero Equipment Ore Calculator',
      subtitle: 'Ore needed to upgrade hero equipment. Upgrades are instant.',
      showTimezone: false
    }
  };

  var subtitle = document.getElementById('brandSub');
  var timezone = document.querySelector('.tz-picker');

  function viewFromHash() {
    return window.location.hash === '#ore' ? 'ore' : 'time';
  }

  function show(name) {
    Object.keys(VIEWS).forEach(function (key) {
      var v = VIEWS[key];
      var active = key === name;
      document.getElementById(v.panel).hidden = !active;
      var tab = document.getElementById(v.tab);
      if (active) tab.setAttribute('aria-current', 'page'); else tab.removeAttribute('aria-current');
    });
    var view = VIEWS[name];
    document.title = view.title;
    subtitle.textContent = view.subtitle;
    timezone.hidden = !view.showTimezone;
  }

  window.addEventListener('hashchange', function () { show(viewFromHash()); });
  show(viewFromHash());
})();
