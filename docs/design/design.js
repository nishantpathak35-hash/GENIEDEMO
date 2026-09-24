// design.js — the one script every part of the set loads. Three things, none of them stored anywhere:
// the theme control, the bulk-selection demos, and the motion page's replay buttons. No file works
// without tokens.css and design.css beside it; none needs a server.
(function () {
  'use strict';
  var root = document.documentElement;

  // ---- the theme control: system, light or dark, for this page load only ----
  var radios = document.querySelectorAll('input[name="theme"]');
  for (var i = 0; i < radios.length; i++) {
    radios[i].addEventListener('change', function (e) {
      if (e.target.value === 'system') root.removeAttribute('data-theme');
      else root.setAttribute('data-theme', e.target.value);
    });
  }

  // ---- the section list follows the scroll when a page holds more than one section ----
  var links = document.querySelectorAll('.dsx-nav ol a');
  var sections = document.querySelectorAll('.dsx-section');
  var list = document.querySelector('.dsx-nav ol');
  var lastId = null;
  function mark() {
    var y = window.scrollY + 120;
    var current = sections[0];
    for (var j = 0; j < sections.length; j++) if (sections[j].offsetTop <= y) current = sections[j];
    for (var k = 0; k < links.length; k++) {
      var on = links[k].getAttribute('href') === '#' + current.id;
      if (on) {
        links[k].setAttribute('aria-current', 'true');
        if (current.id !== lastId && list && list.scrollHeight > list.clientHeight) {
          links[k].scrollIntoView({ block: 'nearest', inline: 'nearest' });
        }
      } else {
        links[k].removeAttribute('aria-current');
      }
    }
    lastId = current.id;
  }
  // In the set each page holds one section and the nav's current item is marked in the HTML, so there
  // is nothing to track. The same script ships in every file either way — one script, not two.
  if (sections.length > 1) { window.addEventListener('scroll', mark, { passive: true }); mark(); }

  // ---- bulk selection demos: each table's count follows its own checkboxes ----
  var tables = document.querySelectorAll('.card .tbl');
  for (var t = 0; t < tables.length; t++) {
    (function (table) {
      var card = table.closest('.card');
      var bar = card ? card.querySelector('.bulkbar') : null;
      if (!bar) return;
      var count = bar.querySelector('span');
      var boxes = table.querySelectorAll('tbody input[type="checkbox"]');
      var all = table.querySelector('thead input[type="checkbox"]');
      function sync() {
        var n = 0;
        for (var c = 0; c < boxes.length; c++) {
          var on = boxes[c].checked;
          boxes[c].closest('tr').setAttribute('aria-selected', on ? 'true' : 'false');
          if (on) n++;
        }
        count.textContent = n + ' selected';
        bar.hidden = n === 0;
        if (all) { all.checked = n === boxes.length; all.indeterminate = n > 0 && n < boxes.length; }
      }
      for (var d = 0; d < boxes.length; d++) boxes[d].addEventListener('change', sync);
      if (all) {
        all.addEventListener('change', function () {
          for (var f = 0; f < boxes.length; f++) boxes[f].checked = all.checked;
          sync();
        });
      }
      sync();
    })(tables[t]);
  }

  // ---- the motion page: every specimen replays the tokens it names ----
  var mo = document.getElementById('mo');
  if (!mo) return;
  var mq = window.matchMedia('(prefers-reduced-motion: reduce)');
  var os = document.getElementById('mo-os');
  if (os && mq.matches) os.hidden = false;
  var sw = document.getElementById('mo-reduce');
  if (sw) {
    sw.addEventListener('click', function () {
      var on = sw.getAttribute('aria-checked') !== 'true';
      sw.setAttribute('aria-checked', on ? 'true' : 'false');
      if (on) document.body.setAttribute('data-motion', 'reduce');
      else document.body.removeAttribute('data-motion');
    });
  }
  // the longest animation or transition on an element, in milliseconds, delay included
  function ms(el) {
    var c = getComputedStyle(el);
    var d = c.animationDuration.split(',').concat(c.transitionDuration.split(','));
    var dl = c.animationDelay.split(',').concat(c.transitionDelay.split(','));
    var m = 0;
    for (var i = 0; i < d.length; i++) {
      var unit = /ms/.test(d[i]) ? 1 : 1000;
      var delayUnit = /ms/.test(dl[i] || '') ? 1 : 1000;
      var total = parseFloat(d[i]) * unit + parseFloat(dl[i] || 0) * delayUnit;
      if (total > m) m = total;
    }
    return m;
  }
  function reflow(el) { void el.offsetWidth; }
  // a blanket takes the blanket's own token where a modal or panel names its pair
  function motionVar(el, name) {
    var own = el.classList.contains('mo-blanket') ? name.replace(/modal|panel/, 'blanket') : name;
    return 'var(--' + own + ')';
  }
  function setPair(el, enter, exit) {
    el.style.setProperty('--mo-enter', motionVar(el, enter));
    el.style.setProperty('--mo-exit', motionVar(el, exit));
  }
  var plays = {
    remount: function (s) {
      var els = s.querySelectorAll('.mo-el');
      for (var i = 0; i < els.length; i++) {
        var c = els[i].cloneNode(true);
        els[i].parentNode.replaceChild(c, els[i]);
      }
    },
    pair: function (s, els, a) {
      var wait = 0;
      els.forEach(function (el) {
        el.classList.remove('mo-out');
        setPair(el, a[0], a[1]);
        el.classList.remove('mo-in');
        reflow(el);
        el.classList.add('mo-in');
        wait = Math.max(wait, ms(el));
      });
      setTimeout(function () {
        els.forEach(function (el) { el.classList.remove('mo-in'); el.classList.add('mo-out'); });
        var w2 = 0;
        els.forEach(function (el) { w2 = Math.max(w2, ms(el)); });
        setTimeout(function () { els.forEach(function (el) { el.classList.remove('mo-out'); }); }, w2 + 400);
      }, wait + 1400);
    },
    hover: function (s, els) {
      var each = function (fn) { return function () { els.forEach(fn); }; };
      each(function (el) { el.classList.add('is-hover'); })();
      setTimeout(each(function (el) { el.classList.add('is-pressed'); }), 700);
      setTimeout(each(function (el) { el.classList.remove('is-pressed'); }), 1100);
      setTimeout(each(function (el) { el.classList.remove('is-hover'); }), 1700);
    },
    toggle: function (s, els) {
      els.forEach(function (el) {
        var on = el.getAttribute('aria-checked') === 'true';
        el.setAttribute('aria-checked', on ? 'false' : 'true');
      });
    },
    progress: function (s, els) {
      els.forEach(function (el) {
        var i = el.querySelector('i');
        var now = +el.getAttribute('aria-valuenow');
        var next = now === 31 ? 64 : 31;
        el.setAttribute('aria-valuenow', next);
        i.style.setProperty('--w', next + '%');
      });
    },
    section: function (s) {
      var h = s.querySelector('.nav-h');
      var open = h.getAttribute('aria-expanded') === 'true';
      h.setAttribute('aria-expanded', open ? 'false' : 'true');
      if (!open) {
        var list = s.querySelector('.mo-list');
        list.classList.remove('mo-in');
        reflow(list);
        list.classList.add('mo-in');
      }
    }
  };
  var specs = mo.querySelectorAll('.mo');
  for (var n = 0; n < specs.length; n++) {
    (function (s) {
      var play = s.getAttribute('data-play').split(':');
      var kind = play[0];
      var args = play.slice(1);
      var els = Array.prototype.slice.call(s.querySelectorAll('.mo-el'));
      if (kind === 'pair') els.forEach(function (el) { setPair(el, args[0], args[1]); });
      var btn = s.querySelector('[data-replay]');
      if (btn) btn.addEventListener('click', function () { plays[kind](s, els, args); });
      if (kind === 'toggle' || kind === 'section') {
        var trigger = s.querySelector('.toggle, .nav-h');
        if (trigger) trigger.addEventListener('click', function () { plays[kind](s, els, args); });
      }
    })(specs[n]);
  }
})();
