/* Know your Chinese – game layer: one shared XP, streak, daily goal and spaced-repetition schedule; question types;
   mini games (sentence builder, memory match, speed round); 3D badges; settings and accessibility choices.
   Ear training, the Daily review runner and offline audio live in practice.js and use this file's state (CPGame.*).
   Loaded after engine.js and audio.js, before practice.js and app.js. */
(function () {
  'use strict';
  var CFG = window.CP_CONFIG || {}, COURSE = window.COURSE, MODS = COURSE.modules, PY = window.CPPinyin, AU = window.CPAudio;
  var KEY = 'chinesePuzzle.game.v1';
  var MIN_POOL = CFG.MIN_POOL || 25, SPEED_SECS = CFG.SPEED_SECONDS || 60;
  var E = window.CPEngine;                                     // word bank, tone-aware questions and review scheduling (engine.js)
  E.init(COURSE, PY);
  var EX = window.COURSE_EXPL || {};                           // drafted explanations; hand-written ones in course.js always win
  MODS.forEach(function (m) { m.questions.forEach(function (q) { if (!q.e && EX[q.id]) q.e = EX[q.id]; }); });
  function app() { return window.CPApp; }

  /* ---------- small helpers ---------- */
  function rnd(a) { return a[Math.floor(Math.random() * a.length)]; }
  function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function norm(s) { return String(s).toLowerCase().replace(/\s+/g, ' ').trim(); }
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function dayStr(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function today() { return dayStr(new Date()); }
  function addDays(n) { var d = new Date(); d.setDate(d.getDate() + n); return dayStr(d); }
  function reduced() { return G.prefs.motion || (window.matchMedia && matchMedia('(prefers-reduced-motion:reduce)').matches); }

  /* ---------- saved state ---------- */
  var G = { xp: 0, streak: 0, best: 0, lastDay: '', day: '', dayXP: 0, goalDay: '', goal: CFG.DAILY_GOAL_XP || 50,
    srs: {}, badges: {}, mig: 0, prefs: { text: 0, contrast: 0, motion: 0, read: 0, keys: 1, vib: 1 }, stats: { quizzes: 0, perfect: 0, reviews: 0, speedBest: 0, matchBest: 0, built: 0, listenOK: 0, toneOK: 0 } };
  function load() {
    try {
      var j = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (j) { Object.keys(G).forEach(function (k) { if (j[k] !== undefined && k !== 'stats' && k !== 'prefs') G[k] = j[k]; }); Object.keys(G.prefs).forEach(function (k) { if (j.prefs && j.prefs[k] !== undefined) G.prefs[k] = j.prefs[k]; }); Object.keys(G.stats).forEach(function (k) { if (j.stats && j.stats[k] !== undefined) G.stats[k] = j.stats[k]; }); }
    } catch (e) {}
  }
  /* Progress strip in the top bar on every page: streak on the left, badges in the middle, XP on the right. */
  function hud() {
    var a = document.getElementById('hudStreak'), b = document.getElementById('hudBadges'), c = document.getElementById('hudXP'); if (!a || !b || !c) return;
    rollDay(); var st = liveStreak(), n = earnedCount(), lv = E.levelOf(G.xp);
    a.innerHTML = '<span aria-hidden="true">🔥</span> ' + st + (st === 1 ? ' day' : ' days'); a.title = st + '-day streak';
    b.innerHTML = '<span aria-hidden="true">🏅</span> ' + n + '/' + BADGES.length + ' badges'; b.setAttribute('aria-label', 'Badges: ' + n + ' of ' + BADGES.length + ' earned. Open my badges');
    c.innerHTML = '<span aria-hidden="true">⭐</span> ' + G.xp + ' XP'; c.title = 'Level ' + lv; c.setAttribute('aria-label', G.xp + ' XP, level ' + lv);
  }
  function statusText() { rollDay(); var st = liveStreak(), n = earnedCount(); return 'Streak: ' + st + (st === 1 ? ' day' : ' days') + '. ' + G.xp + ' XP, level ' + E.levelOf(G.xp) + '. ' + n + ' of ' + BADGES.length + ' badges.'; }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(G)); } catch (e) {} try { hud(); } catch (e) {} }
  load();

  /* ---------- vocabulary bank (shared with engine.js) and sentences, built from the lesson tables ---------- */
  var BANK = E.items().map(function (it) { return { py: it.py, en: it.en, hz: it.hz || '', m: it.mod, key: it.key }; }), SENT = [];
  (function build() {
    var seenS = {};
    MODS.forEach(function (m) {
      m.pages.forEach(function (p) {
        p.blocks.forEach(function (b) {
          if (!b.table) return;
          var h = b.table[0].join('|'), rows = b.table.slice(1);
          function addS(py, en) {
            py = String(py || '').trim(); en = String(en || '').trim(); if (!py || !en) return;
            if (!(/[.?!]$/.test(py) || py.split(/\s+/).length > 4)) return;
            var k = norm(py); if (seenS[k] || py.split(/\s+/).length < 3) return; seenS[k] = 1; SENT.push({ py: py, en: en, m: m.id });
          }
          if (h === 'Pinyin|Characters|English') rows.forEach(function (r) { addS(r[0], r[2]); });
          else if (h === 'Pinyin|English') rows.forEach(function (r) { addS(r[0], r[1]); });
          else if (h === 'Pinyin|English|Pinyin|English') rows.forEach(function (r) { addS(r[0], r[1]); if (r[2]) addS(r[2], r[3]); });
          else if (h === 'Speaker|Pinyin|English') rows.forEach(function (r) { addS(r[1], r[2]); });
        });
      });
    });
  })();
  var BYKEY = {}; BANK.forEach(function (b) { BYKEY[b.key] = b; });

  /* ---------- progress from older versions carries over ---------- */
  function migrate() {
    if (G.mig) return;
    var conv = {}; BANK.forEach(function (b) { conv['v:' + norm(b.py) + '|' + norm(b.en)] = b.key; });
    Object.keys(G.srs).forEach(function (k) {                   // first game layer: {b, d} cards keyed by words or 'q:module:id'
      var c = G.srs[k]; if (!c || c.box !== undefined) return;
      var nk = conv[k] || (/^q:\d+:/.test(k) ? 'q:' + k.split(':').slice(2).join(':') : null); delete G.srs[k]; if (!nk) return;
      var box = c.b || 0; G.srs[nk] = { box: box, n: 1, ok: box, bad: 0, due: c.d ? new Date(c.d + 'T00:00:00').getTime() : Date.now(), last: Date.now() };
    });
    try {                                                        // practice-only version: progress kept in the app state
      var a = JSON.parse(localStorage.getItem('chinesePuzzle.v1') || 'null');
      if (a) {
        if (a.srs) Object.keys(a.srs).forEach(function (k) { if (!G.srs[k]) G.srs[k] = a.srs[k]; });
        if (a.xp && a.xp > G.xp) G.xp = a.xp;
        if (a.streak && a.streak.last && a.streak.last > G.lastDay) { G.streak = a.streak.count || 0; G.lastDay = a.streak.last; G.best = Math.max(G.best, a.streak.best || 0); }
      }
    } catch (e) {}
    G.mig = 1; save();
  }
  migrate();
  /* ---------- question generators (all return the same shape as the course questions) ---------- */
  function distract(it, field, n, ok) {
    var lists = [
      shuffle(BANK.filter(function (b) { return b !== it && b.m === it.m; })),
      shuffle(BANK.filter(function (b) { return b !== it && b.m !== it.m && Math.abs(b.m - it.m) <= 2; })),
      shuffle(BANK.filter(function (b) { return b !== it; }))
    ], out = [], seen = {}; seen[norm(it[field])] = 1;
    lists.forEach(function (list) {
      list.forEach(function (b) {
        if (out.length >= n || !b[field]) return;
        var k = norm(b[field]); if (seen[k]) return; if (ok && !ok(b)) return;
        seen[k] = 1; out.push(b[field]);
      });
    });
    return out;
  }
  function explain(it) { return it.py + (it.hz ? ' (' + it.hz + ')' : '') + ' means “' + it.en + '”.'; }
  function build(id, q, right, wrongs, it, extra) {
    if (wrongs.length < 3) return null;
    var o = [right].concat(wrongs.slice(0, 3));
    var r = { id: id, q: q, o: o, a: 0, e: it ? explain(it) : '', s: 'ext', gen: true, vkey: it ? it.key : '' };
    if (extra) Object.keys(extra).forEach(function (k) { r[k] = extra[k]; });
    return r;
  }
  /* wrong pinyin answers that differ mostly by TONE (the thing learners most need to notice) */
  function pinyinWrongs(it) {
    var out = [], seen = {}; seen[it.py] = 1;
    for (var t = 0; t < 10 && out.length < 2; t++) { var v = E.varyTone(it.py, Math.random); if (v && !seen[v]) { seen[v] = 1; out.push(v); } }
    distract(it, 'py', 3).forEach(function (x) { if (out.length < 3 && !seen[x]) { seen[x] = 1; out.push(x); } });
    return out;
  }
  /* wrong character answers that share a character with the right one, so you must really look */
  function charWrongs(it) {
    var pool = BANK.filter(function (b) { return b !== it && b.hz && b.hz !== it.hz && b.hz.length === it.hz.length; });
    var share = pool.filter(function (b) { for (var i = 0; i < b.hz.length; i++) if (it.hz.indexOf(b.hz[i]) >= 0) return true; return false; });
    var out = [], seen = {}; seen[it.hz] = 1;
    shuffle(share).concat(shuffle(pool), shuffle(BANK.filter(function (b) { return b.hz && b.hz !== it.hz; }))).forEach(function (b) { if (out.length < 3 && !seen[b.hz]) { seen[b.hz] = 1; out.push(b.hz); } });
    return out;
  }
  var GEN = {
    mean: function (it) { return build('g:m:' + it.key, 'What does “' + it.py + '” mean?', it.en, distract(it, 'en', 3), it); },
    rev: function (it) { return build('g:r:' + it.key, 'How do you say “' + it.en + '” in Chinese (pinyin)?', it.py, pinyinWrongs(it), it); },
    hz2py: function (it) { if (!it.hz) return null; return build('g:h:' + it.key, 'Which pinyin matches the characters ' + it.hz + '?', it.py, pinyinWrongs(it), it); },
    py2hz: function (it) { if (!it.hz) return null; return build('g:p:' + it.key, 'Which characters match the pinyin “' + it.py + '”?', it.hz, charWrongs(it), it); },
    listen: function (it) { return build('g:l:' + it.key, 'Listen, then choose the meaning.', it.en, distract(it, 'en', 3), it, { audio: { py: it.py, hz: it.hz }, kind: 'listen' }); },
    listenpy: function (it) {
      return build('g:t:' + it.key, 'Listen. Which pinyin did you hear? Watch the tone marks.', it.py, pinyinWrongs(it), it, { audio: { py: it.py, hz: it.hz }, kind: 'listen' });
    }
  };
  function cleanTok(t) { return t.replace(/[.,?!;:]/g, ''); }
  function blankQ(s) {
    var toks = s.py.split(/\s+/), cand = [];
    toks.forEach(function (t, i) { if (cleanTok(t).length >= 2) cand.push(i); });
    if (!cand.length) return null;
    var i = rnd(cand), w = cleanTok(toks[i]), cap = w.charAt(0) !== w.charAt(0).toLowerCase(), seen = {}, wrong = [];
    seen[norm(w)] = 1;
    shuffle(SENT).forEach(function (o) {
      if (o === s) return;
      o.py.split(/\s+/).forEach(function (t) {
        var c = cleanTok(t), k = norm(c); if (wrong.length >= 3 || c.length < 2 || seen[k]) return;
        seen[k] = 1; wrong.push(cap ? c.charAt(0).toUpperCase() + c.slice(1) : c.charAt(0).toLowerCase() + c.slice(1));
      });
    });
    var shown = toks.map(function (t, j) { return j === i ? t.replace(w, '_____') : t; }).join(' ');
    if (wrong.length < 3) return null;
    return { id: 'g:b:' + norm(s.py), q: 'Fill the gap: “' + shown + '”  (' + s.en + ')', o: [w].concat(wrong), a: 0, e: s.py + ' = ' + s.en, s: 'ext', gen: true, vkey: '' };
  }
  function canListen() { return !!(window.speechSynthesis || (AU && AU.canAsk && AU.canAsk())); }
  function randomQ(items, types) {
    for (var tries = 0; tries < 12; tries++) {
      var t = rnd(types), q = null;
      if (t === 'blank') { var ss = SENT.filter(function (s) { return items.some(function (i) { return i.m === s.m; }); }); if (ss.length) q = blankQ(rnd(ss)); }
      else if (items.length) q = GEN[t](rnd(items));
      if (q) return q;
    }
    return null;
  }
  function vocabUpTo(maxMod) {
    var v = BANK.filter(function (b) { return b.m <= maxMod; });
    return v.length >= 12 ? v : BANK.filter(function (b) { return b.m <= 5; });
  }
  function reach() { var S = app() && app().S(); return Math.max(S ? S.unlocked : 0, 2); }

  /* ---------- every module gets at least MIN_POOL questions ---------- */
  MODS.forEach(function (m) {
    if (m.questions.length >= MIN_POOL) return;
    var existing = norm(m.questions.map(function (q) { return q.q + ' ' + q.o.join(' '); }).join(' ')), items = BANK.filter(function (b) { return b.m === m.id; }), made = 0, n = 0;
    function fill(strict) {
      items.forEach(function (it) {
        if (m.questions.length >= MIN_POOL) return;
        if (strict && existing.indexOf(norm(it.py)) >= 0) return;
        var types = it.hz ? ['mean', 'hz2py', 'py2hz'] : ['mean', 'rev'], q = GEN[types[n++ % types.length]](it) || GEN.mean(it);
        if (!q || m.questions.some(function (x) { return x.id === q.id; })) return;
        q.id = 'V' + m.id + '.' + (++made); q.gen = true; m.questions.push(q);
      });
    }
    fill(true); if (m.questions.length < MIN_POOL) fill(false);
  });

  /* ---------- XP, streak, daily goal ---------- */
  function rollDay() { var t = today(); if (G.day !== t) { G.day = t; G.dayXP = 0; } }
  function addXP(n) {
    if (!n) return 0;
    rollDay(); G.xp += n; G.dayXP += n;
    var t = today();
    if (G.lastDay !== t) { G.streak = (G.lastDay === addDays(-1)) ? G.streak + 1 : 1; G.lastDay = t; G.best = Math.max(G.best, G.streak); }
    if (G.dayXP >= G.goal && G.goalDay !== t) { G.goalDay = t; if (app()) app().toast('Daily goal reached! 🎯 ' + G.goal + ' XP today.'); }
    checkBadges(); save(); return n;
  }
  function liveStreak() { return (G.lastDay === today() || G.lastDay === addDays(-1)) ? G.streak : 0; }

  /* ---------- spaced repetition (boxes and dates come from engine.js) ---------- */
  function srsKey(modId, q) { return q.gen && q.vkey ? q.vkey : 'q:' + q.id; }
  function srsRecord(key, ok) { if (key) E.review(G, key, ok); }
  function learnedMods() { var S = app() && app().S(); return S ? MODS.filter(function (m) { return S.read[m.id] || S.passed[m.id]; }).map(function (m) { return m.id; }) : []; }
  function dueCount() {
    var ln = learnedMods();
    return E.dueKeys(G, Date.now()).filter(function (k) { var it = E.byKey(k); return !it || ln.indexOf(it.mod) >= 0; }).length;
  }

  /* ---------- badges ---------- */
  var BADGES = [
    { id: 'first', hz: '起', py: 'qǐ', name: 'First Step', tier: 'bronze', desc: 'Finish your first quiz.', test: function () { return G.stats.quizzes >= 1; } },
    { id: 'tone', hz: '声', py: 'shēng', name: 'Tone Tamer', tier: 'bronze', desc: 'Pass Module 0, Sounds of Mandarin.', test: function (S) { return !!S.passed[0]; } },
    { id: 'fest', hz: '节', py: 'jié', name: 'Festival Friend', tier: 'bronze', desc: 'Pass Module 4, Chinese Culture and Festivals.', test: function (S) { return !!S.passed[4]; } },
    { id: 'ears', hz: '听', py: 'tīng', name: 'Sharp Ears', tier: 'bronze', desc: 'Answer 20 listening questions correctly.', test: function () { return G.stats.listenOK >= 20; } },
    { id: 'duel', hz: '斗', py: 'dòu', name: 'Tone Duelist', tier: 'silver', desc: 'Answer 15 tone questions correctly in ear training.', test: function () { return G.stats.toneOK >= 15; } },
    { id: 'rev', hz: '复', py: 'fù', name: 'Review Regular', tier: 'bronze', desc: 'Finish 5 daily reviews.', test: function () { return G.stats.reviews >= 5; } },
    { id: 's3', hz: '火', py: 'huǒ', name: 'On Fire', tier: 'bronze', desc: 'Learn 3 days in a row.', test: function () { return G.best >= 3; } },
    { id: 'half', hz: '半', py: 'bàn', name: 'Halfway There', tier: 'silver', desc: 'Pass 10 modules.', test: function (S, n) { return n >= 10; } },
    { id: 'zod', hz: '马', py: 'mǎ', name: 'Zodiac Keeper', tier: 'silver', desc: 'Pass Module 17, Animals, Colours and the Zodiac.', test: function (S) { return !!S.passed[17]; } },
    { id: 's7', hz: '周', py: 'zhōu', name: 'Weekly Warrior', tier: 'silver', desc: 'Learn 7 days in a row.', test: function () { return G.best >= 7; } },
    { id: 'xp5', hz: '金', py: 'jīn', name: 'Gold Collector', tier: 'silver', desc: 'Earn 500 XP.', test: function () { return G.xp >= 500; } },
    { id: 'mem', hz: '记', py: 'jì', name: 'Memory Master', tier: 'silver', desc: 'Win Memory Match in 10 moves or fewer.', test: function () { return G.stats.matchBest > 0 && G.stats.matchBest <= 10; } },
    { id: 'smith', hz: '句', py: 'jù', name: 'Sentence Smith', tier: 'silver', desc: 'Build 10 sentences correctly.', test: function () { return G.stats.built >= 10; } },
    { id: 'full', hz: '满', py: 'mǎn', name: 'Full Marks', tier: 'gold', desc: 'Score 10 out of 10 in a module quiz.', test: function () { return G.stats.perfect >= 1; } },
    { id: 'speed', hz: '速', py: 'sù', name: 'Speed Demon', tier: 'gold', desc: 'Get 15 right in one Speed Round.', test: function () { return G.stats.speedBest >= 15; } },
    { id: 'xp20', hz: '宝', py: 'bǎo', name: 'Treasure Keeper', tier: 'gold', desc: 'Earn 2,000 XP.', test: function () { return G.xp >= 2000; } },
    { id: 'dragon', hz: '龙', py: 'lóng', name: 'Dragon Scholar', tier: 'jade', desc: 'Pass every module in the course.', test: function (S, n) { return n >= MODS.length; } }
  ];
  var NEWQ = [];
  function passedN(S) { return MODS.filter(function (m) { return S.passed[m.id]; }).length; }
  function checkBadges() {
    var S = app() && app().S(); if (!S) return;
    var n = passedN(S);
    BADGES.forEach(function (b) { if (!G.badges[b.id] && b.test(S, n)) { G.badges[b.id] = Date.now(); NEWQ.push(b); } });
  }
  function earnedCount() { return BADGES.filter(function (b) { return G.badges[b.id]; }).length; }

  /* 3D coin: stacked discs give the edge its thickness; the faces turn with a pointer or a tap. */
  function coin(b, size, opts) {
    opts = opts || {}; var on = !!G.badges[b.id] || opts.force, edge = '';
    for (var z = -6; z <= 6; z++) edge += '<i style="--z:' + z + 'px"></i>';
    return '<span class="coin-wrap' + (opts.big ? ' big' : '') + '" style="--cs:' + size + 'px" aria-hidden="true"><span class="coin t-' + b.tier + (on ? '' : ' locked') + (opts.anim ? ' ' + opts.anim : '') + '">' +
      '<span class="edge">' + edge + '</span>' +
      '<span class="face front"><span class="rim"></span>' + (on ? '<b lang="zh-Hans">' + b.hz + '</b><small>' + esc(b.py) + '</small>' : '<b class="q">?</b>') + '</span>' +
      '<span class="face back"><span class="rim"></span><span class="bk">' + (on ? esc(b.name) : 'Locked') + '</span></span></span></span>';
  }
  function badgePopup() {
    if (!NEWQ.length || !app()) return;
    var list = NEWQ.slice(); NEWQ = [];
    var h = '<h2 id="sheetTitle">' + (list.length > 1 ? 'New badges!' : 'New badge!') + '</h2><p class="sub">You earned ' + (list.length > 1 ? list.length + ' badges' : 'a badge') + '. Drag or tap a coin to turn it.</p><div class="popcoins">' +
      list.map(function (b) { return '<div class="popcoin" data-coin>' + coin(b, list.length > 1 ? 120 : 160, { big: true, anim: reduced() ? '' : 'enter' }) + '<p class="bn">' + esc(b.name) + '</p><p class="bd">' + esc(b.desc) + '</p></div>'; }).join('') + '</div>' +
      '<div class="row"><div class="line"><button class="btn red" data-g="closepop">Wonderful!</button></div><div class="line"><button class="btn ghost" data-g="shelf">See all my badges</button></div></div>';
    app().openSheet(h); AU.play('clap'); app().confetti(); save();
  }
  function shelf() {
    var A_ = app(); A_.setTitle('My badges');
    var h = '<div class="pagehead"><p class="kicker">' + earnedCount() + ' of ' + BADGES.length + ' earned</p><h2>My badges</h2></div><p>Move your pointer or finger over a coin to tilt it. Tap it to flip it over.</p><ul class="badge-grid">' +
      BADGES.map(function (b) {
        var got = G.badges[b.id];
        return '<li><button type="button" class="btile ' + (got ? 'got' : 'lock') + '" data-g="flip" data-b="' + b.id + '" aria-label="' + esc(b.name) + '. ' + (got ? 'Earned.' : 'Not yet earned.') + ' ' + esc(b.desc) + '">' +
          coin(b, 96, {}) + '<span class="bn">' + (got ? esc(b.name) : 'Locked') + '</span><span class="bd">' + esc(b.desc) + '</span></button></li>';
      }).join('') + '</ul><div class="line"><button class="btn ghost" data-g="hub">Back to practice</button></div>';
    A_.show(h);
  }

  /* pointer tilt on any coin */
  var tiltEl = null;
  function tilt(e) {
    var w = e.target.closest && e.target.closest('.coin-wrap'); if (!w) return;
    var r = w.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5, c = w.querySelector('.coin');
    if (!c || c.classList.contains('spin') || c.classList.contains('enter')) return;
    c.style.setProperty('--ry', Math.max(-45, Math.min(45, x * 90)) + 'deg'); c.style.setProperty('--rx', Math.max(-35, Math.min(35, -y * 70)) + 'deg'); tiltEl = c;
  }
  function untilt(e) {
    var w = e.target.closest && e.target.closest('.coin-wrap'); if (!w) return;
    var c = w.querySelector('.coin'); if (c) { c.style.setProperty('--ry', '0deg'); c.style.setProperty('--rx', '0deg'); }
  }
  document.addEventListener('pointermove', tilt); document.addEventListener('pointerout', untilt);
  function spinCoin(host) {
    var c = host.querySelector('.coin'); if (!c) return;
    c.style.setProperty('--ry', '0deg'); c.style.setProperty('--rx', '0deg');
    if (reduced()) { c.classList.toggle('flipped'); return; }
    c.classList.remove('spin'); void c.offsetWidth; c.classList.add('spin');
    c.addEventListener('animationend', function done() { c.classList.remove('spin'); c.removeEventListener('animationend', done); });
  }

  /* ---------- shared UI pieces ---------- */
  var SESS = null, timers = [];
  function stopTimers() { timers.forEach(function (t) { clearInterval(t); clearTimeout(t); }); timers = []; }
  function later(fn, ms) { var t = setTimeout(fn, ms); timers.push(t); return t; }
  function ring(done, goal) {
    var pct = Math.min(1, done / goal), C = 2 * Math.PI * 34;
    return '<svg class="ring" viewBox="0 0 80 80" width="84" height="84" role="img" aria-label="' + Math.min(done, goal) + ' of ' + goal + ' XP today"><circle cx="40" cy="40" r="34" fill="none" stroke="var(--line)" stroke-width="8"/>' +
      '<circle cx="40" cy="40" r="34" fill="none" stroke="' + (pct >= 1 ? 'var(--good)' : 'var(--gold)') + '" stroke-width="8" stroke-linecap="round" stroke-dasharray="' + (C * pct).toFixed(1) + ' ' + C.toFixed(1) + '" transform="rotate(-90 40 40)"/>' +
      '<text x="40" y="45" text-anchor="middle" font-size="17" font-weight="700" fill="currentColor">' + (pct >= 1 ? '✓' : Math.round(pct * 100) + '%') + '</text></svg>';
  }
  function homeHTML() {
    rollDay(); var due = dueCount(), lv = E.levelOf(G.xp), risk = G.lastDay === addDays(-1) && G.dayXP === 0 && G.streak > 0;
    return '<section class="today card" aria-labelledby="tdy"><h2 id="tdy">Today</h2><div class="today-row">' + ring(G.dayXP, G.goal) +
      '<ul class="chips"><li><b>' + G.dayXP + '</b> / ' + G.goal + ' XP today</li><li><span aria-hidden="true">🔥</span> <b>' + liveStreak() + '</b>-day streak' + (risk ? ' · practise today to keep it' : '') + '</li><li><span aria-hidden="true">⭐</span> <b>' + G.xp + '</b> XP · Level <b>' + lv + '</b></li></ul></div>' +
      '<div class="today-btns"><button class="btn red" data-g="review">Daily review' + (due ? ' · ' + due + ' due' : '') + '</button><button class="btn" data-g="hub">Practice games</button><button class="btn ghost" data-g="badges">🏅 Badges ' + earnedCount() + '/' + BADGES.length + '</button></div></section>';
  }
  function footHTML() { return '<div class="line"><button class="btn ghost sm" data-g="settings">Settings: daily goal and AI key</button></div>'; }
  function hub() {
    stopTimers(); SESS = null; var A_ = app(); A_.setTitle('Practice games'); var due = dueCount();
    var cards = [
      ['review', '🔁', 'Daily review', 'About 5 minutes. Words and questions come back just before you forget them.' + (due ? ' ' + due + ' due now.' : '')],
      ['listen', '👂', 'Listen and choose', 'Hear a word, pick the meaning or the pinyin.'],
      ['tone', '🎵', 'Which tone?', 'Hear a syllable and pick its tone, then tone pairs.'],
      ['duel', '⚔️', 'Tone duel', 'Hear one of mā, má, mǎ or mà and pick which one it was.'],
      ['build', '🧩', 'Sentence builder', 'Tap the word tiles into the right order.'],
      ['match', '🃏', 'Memory match', 'Flip cards to pair pinyin with its meaning.'],
      ['speed', '⚡', 'Speed round', 'Right answers as fast as you can in ' + SPEED_SECS + ' seconds.'],
      ['audio', '💾', 'Offline audio', 'Save spoken words on this device so listening works anywhere.'],
      ['badges', '🏅', 'My badges', earnedCount() + ' of ' + BADGES.length + ' earned. Spin the 3D coins.']
    ];
    A_.show('<div class="pagehead"><p class="kicker">Practice</p><h2>Practice games</h2></div><p>Every game uses words from the modules you have opened. Each right answer earns XP toward your daily goal.</p><ul class="hub">' +
      cards.map(function (c) { return '<li><button type="button" class="mode" data-g="' + c[0] + '"><span class="ic" aria-hidden="true">' + c[1] + '</span><span><b>' + c[2] + '</b><br><span class="s">' + c[3] + '</span></span></button></li>'; }).join('') +
      '</ul><div class="line"><button class="btn ghost" data-g="home">All modules</button></div>');
  }

  /* ---------- shared helpers for quiz-style screens ---------- */
  function mkItem(q, key) { var order = shuffle(q.o.map(function (_, i) { return i; })); return { q: q, order: order, right: order.indexOf(q.a), key: key }; }
  function hearCur(cur, auto) {
    var a = cur.q.audio; if (!a) return;
    AU.speak(a.py, a.hz).then(function (v) {
      if (v === 'none' && !cur.revealed) { cur.revealed = true; if (A_quiz() && A_quiz().qs[A_quiz().i] === cur) app().rerenderQuiz(); }
      if (v === 'none' && !auto) app().toast('No Chinese voice on this device. Connect to the internet for AI audio.');
    });
  }
  function A_quiz() { return app() && app().quiz && app().quiz(); }
  function summary(title, big, xp, again, good) {
    var A_ = app(); A_.setTitle(title);
    A_.show('<div class="result ' + (good ? 'pass' : 'fail') + '"><p class="kicker" style="color:var(--soft);margin:0">' + esc(title) + '</p><div class="score">' + esc(big) + '</div>' +
      '<p class="xpline" style="margin-inline:auto"><b>+' + xp + ' XP</b> earned · <span aria-hidden="true">🔥</span> ' + liveStreak() + '-day streak · ' + G.dayXP + '/' + G.goal + ' today</p>' +
      '<div class="actions"><div class="line"><button class="btn red" data-g="' + again + '" style="width:100%">Play again</button></div><div class="line"><button class="btn ghost" data-g="hub">Practice games</button></div></div></div>');
    AU.play(good ? 'clap' : 'sad'); if (good) app().confetti(); later(badgePopup, 700);
  }

  /* ---------- speed round ---------- */
  function startSpeed() {
    stopTimers();
    SESS = { mode: 'speed', pool: vocabUpTo(reach()), end: Date.now() + SPEED_SECS * 1000, correct: 0, wrong: 0, combo: 0, bestCombo: 0, xp: 0, lock: false, q: null };
    location.hash = '#/play/speed'; speedQ();
    timers.push(setInterval(tickSpeed, 200));
  }
  function speedQ() {
    var s = SESS; s.q = null;
    var q = randomQ(s.pool, ['mean', 'mean', 'rev', 'hz2py', 'py2hz', 'blank']); if (!q) q = GEN.mean(rnd(s.pool));
    s.q = mkItem(q, ''); s.lock = false; s.picked = -1; renderSpeed();
  }
  function renderSpeed() {
    var A_ = app(), s = SESS, cur = s.q, q = cur.q, left = Math.max(0, Math.ceil((s.end - Date.now()) / 1000)); A_.setTitle('Speed round');
    var h = '<div class="qtop"><span>Right <b>' + s.correct + '</b>' + (s.combo >= 3 ? ' · combo x' + s.combo : '') + '</span><span id="gTime" aria-hidden="true">' + left + 's</span></div>' +
      '<div class="timer" aria-hidden="true"><i id="gBar" style="width:' + Math.max(0, (s.end - Date.now()) / (SPEED_SECS * 10)) + '%"></i></div>' +
      '<h2 class="qtext" id="qt">' + esc(q.q) + '</h2><ul class="opts" role="group" aria-labelledby="qt">';
    cur.order.forEach(function (oi, pos) {
      var cls = 'opt' + (s.picked >= 0 ? (pos === cur.right ? ' right' : pos === s.picked ? ' wrong' : '') : '');
      h += '<li><button type="button" class="' + cls + '" data-g="sopt" data-pos="' + pos + '"' + (s.picked >= 0 ? ' disabled' : '') + '><span class="k">' + 'ABCD'[pos] + '</span><span>' + esc(q.o[oi]) + '</span></button></li>';
    });
    h += '</ul><p class="hint">Wrong answers cost 3 seconds. Press A, B, C or D.</p><p class="quit"><button class="btn ghost sm" data-g="hub">Stop</button></p><p class="sr" role="status" id="gLive"></p>';
    A_.show(h, false, true);
  }
  function tickSpeed() {
    var s = SESS; if (!s || s.mode !== 'speed') return;
    var left = (s.end - Date.now()) / 1000, t = document.getElementById('gTime'), b = document.getElementById('gBar');
    if (t) t.textContent = Math.max(0, Math.ceil(left)) + 's'; if (b) b.style.width = Math.max(0, left / SPEED_SECS * 100) + '%';
    if (left <= 0) endSpeed();
  }
  function answerSpeed(pos) {
    var s = SESS; if (!s || s.mode !== 'speed' || s.lock || s.picked >= 0) return;
    var cur = s.q, ok = pos === cur.right; s.picked = pos; s.lock = true;
    if (ok) { s.correct++; s.combo++; s.bestCombo = Math.max(s.bestCombo, s.combo); s.xp += addXP(s.combo >= 5 ? 6 : 4); AU.play('clap'); }
    else { s.wrong++; s.combo = 0; s.end -= 3000; AU.play('damage'); }
    renderSpeed(); var live = document.getElementById('gLive'); if (live) live.textContent = ok ? 'Correct' : 'Wrong. Answer ' + cur.q.o[cur.q.a];
    later(function () { if (SESS === s) { if (s.end - Date.now() <= 0) endSpeed(); else speedQ(); } }, ok ? 450 : 1100);
  }
  function endSpeed() {
    var s = SESS; if (!s || s.mode !== 'speed' || s.done) return; s.done = true; stopTimers();
    G.stats.speedBest = Math.max(G.stats.speedBest, s.correct); checkBadges(); save();
    summary('Speed round', s.correct + ' right', s.xp, 'speed', s.correct >= 10);
  }

  /* ---------- memory match ---------- */
  function startMatch() {
    stopTimers();
    var pool = shuffle(vocabUpTo(reach()).filter(function (b) { return b.py.length <= 16 && b.en.length <= 22 && b.py.split(/\s+/).length <= 2; })), pick = [], sp = {}, se = {};
    pool.forEach(function (b) { if (pick.length < 6 && !sp[norm(b.py)] && !se[norm(b.en)]) { sp[norm(b.py)] = 1; se[norm(b.en)] = 1; pick.push(b); } });
    if (pick.length < 6) { app().toast('Open a module first, then come back.'); return hub(); }
    var cards = []; pick.forEach(function (b, i) { cards.push({ pid: i, t: b.py, kind: 'a', it: b }); cards.push({ pid: i, t: b.en, kind: 'b', it: b }); });
    SESS = { mode: 'match', cards: shuffle(cards), open: [], moves: 0, found: 0, lock: false };
    location.hash = '#/play/match'; renderMatch();
  }
  function cardLabel(c, i) { return 'Card ' + (i + 1) + (c.up || c.done ? ': ' + c.t + (c.done ? ', matched' : '') : ', face down'); }
  function renderMatch() {
    var A_ = app(), s = SESS; A_.setTitle('Memory match');
    A_.show('<div class="pagehead"><p class="kicker">Memory match</p><h2>Pair the pinyin with its meaning</h2></div><div class="qtop"><span>Moves <b id="gMoves">' + s.moves + '</b></span><span>Pairs <b id="gPairs">' + s.found + '</b> / 6</span></div>' +
      '<div class="mgrid" role="group" aria-label="Cards">' + s.cards.map(function (c, i) {
        return '<button type="button" class="mcard k-' + c.kind + (c.up ? ' up' : '') + (c.done ? ' done' : '') + '" data-g="card" data-i="' + i + '" aria-label="' + esc(cardLabel(c, i)) + '"><span class="mc-in" aria-hidden="true"><span class="mc-front">?</span><span class="mc-back">' + esc(c.t) + '</span></span></button>';
      }).join('') + '</div><p class="sr" role="status" id="gLive"></p><p class="quit"><button class="btn ghost sm" data-g="hub">Stop and go back</button></p>', false);
  }
  function flipCard(i) {
    var s = SESS; if (!s || s.mode !== 'match' || s.lock) return; var c = s.cards[i]; if (c.up || c.done) return;
    c.up = true; s.open.push(i); updCard(i);
    if (s.open.length < 2) return;
    s.moves++; var a = s.cards[s.open[0]], b = s.cards[s.open[1]], ia = s.open[0], ib = s.open[1]; s.open = []; s.lock = true;
    var mv = document.getElementById('gMoves'); if (mv) mv.textContent = s.moves;
    if (a.pid === b.pid) {
      a.done = b.done = true; s.found++; s.lock = false; updCard(ia); updCard(ib);
      var pf = document.getElementById('gPairs'); if (pf) pf.textContent = s.found;
      var live = document.getElementById('gLive'); if (live) live.textContent = 'Match: ' + a.it.py + ' means ' + a.it.en;
      AU.speak(a.it.py, a.it.hz);
      if (s.found === 6) later(endMatch, 900);
    } else later(function () { a.up = b.up = false; s.lock = false; updCard(ia); updCard(ib); }, 950);
  }
  function updCard(i) {
    var c = SESS.cards[i], el = document.querySelector('.mcard[data-i="' + i + '"]'); if (!el) return;
    el.classList.toggle('up', !!c.up); el.classList.toggle('done', !!c.done); el.setAttribute('aria-label', cardLabel(c, i));
  }
  function endMatch() {
    var s = SESS; if (!s || s.mode !== 'match') return;
    var xp = addXP(20 + (s.moves <= 10 ? 10 : 0));
    if (!G.stats.matchBest || s.moves < G.stats.matchBest) G.stats.matchBest = s.moves;
    checkBadges(); save();
    summary('Memory match', s.moves + ' moves', xp, 'match', s.moves <= 14);
  }

  /* ---------- sentence builder ---------- */
  function startBuild() {
    stopTimers();
    var max = reach(), pool = SENT.filter(function (s) { var n = s.py.split(/\s+/).length; return s.m <= max && n >= 3 && n <= 8; });
    if (pool.length < 5) pool = SENT.filter(function (s) { var n = s.py.split(/\s+/).length; return n >= 3 && n <= 8; });
    var items = shuffle(pool).slice(0, 5).map(function (s) {
      var words = s.py.split(/\s+/).map(function (t) { return cleanTok(t).toLowerCase(); }).filter(Boolean);
      return { s: s, words: words, tiles: shuffle(words.map(function (w, i) { return { w: w, id: i }; })), placed: [], tries: 0, done: false, solved: false };
    });
    SESS = { mode: 'build', items: items, i: 0, score: 0, xp: 0 };
    location.hash = '#/play/build'; renderBuild();
  }
  function renderBuild(msg, cls) {
    var A_ = app(), s = SESS, it = s.items[s.i]; A_.setTitle('Sentence builder');
    var used = {}; it.placed.forEach(function (t) { used[t.id] = 1; });
    var h = '<div class="qtop"><span>Sentence ' + (s.i + 1) + ' of ' + s.items.length + '</span><span>Built ' + s.score + '</span></div><div class="dots" aria-hidden="true">' +
      s.items.map(function (x, i) { return '<i class="' + (x.done ? (x.solved ? 'ok' : 'no') : i === s.i ? 'now' : '') + '"></i>'; }).join('') + '</div>' +
      '<h2 class="qtext" id="qt">Say it in Chinese: “' + esc(it.s.en) + '”</h2><p class="hint">Tap the words in the right order.</p>' +
      '<div class="slots' + (cls === 'shake' ? ' shake' : '') + '" aria-label="Your sentence">' + (it.placed.length ? it.placed.map(function (t, k) { return '<button type="button" class="tile2 placed" data-g="unplace" data-k="' + k + '"' + (it.done ? ' disabled' : '') + '>' + esc(t.w) + '</button>'; }).join('') : '<span class="ph">Your sentence appears here</span>') + '</div>' +
      '<div class="bank" aria-label="Word tiles">' + it.tiles.map(function (t) { return used[t.id] ? '' : '<button type="button" class="tile2" data-g="place" data-id="' + t.id + '">' + esc(t.w) + '</button>'; }).join('') + '</div>' +
      '<p class="fbline ' + (cls || '') + '" role="status">' + (msg || '') + '</p>';
    if (it.done) {
      h += '<div class="fb ' + (it.solved ? 'ok' : 'no') + '"><b>' + (it.solved ? 'Well built!' : 'Here is the answer.') + '</b><div>' + A_.rich(it.s.py) + '</div><div>' + esc(it.s.en) + '</div></div><button class="btn" id="gNext" data-g="bnext" style="width:100%">' + (s.i === s.items.length - 1 ? 'See my result' : 'Next sentence') + '</button>';
    } else {
      h += '<div class="row2"><button class="btn" data-g="check"' + (it.placed.length === it.words.length ? '' : ' disabled') + '>Check</button><button class="btn ghost" data-g="clear"' + (it.placed.length ? '' : ' disabled') + '>Clear</button></div>';
    }
    h += '<p class="quit"><button class="btn ghost sm" data-g="hub">Stop and go back</button></p>';
    A_.show(h, false, true);
    if (it.done) { var nb = document.getElementById('gNext'); if (nb) nb.focus({ preventScroll: true }); }
  }
  function buildClick(act, el) {
    var s = SESS; if (!s || s.mode !== 'build') return false; var it = s.items[s.i];
    if (act === 'place') { var id = +el.dataset.id; it.tiles.forEach(function (t) { if (t.id === id) it.placed.push(t); }); renderBuild(); focusBank(); return true; }
    if (act === 'unplace') { it.placed.splice(+el.dataset.k, 1); renderBuild(); return true; }
    if (act === 'clear') { it.placed = []; renderBuild(); return true; }
    if (act === 'check') {
      var got = it.placed.map(function (t) { return t.w; }).join(' ') === it.words.join(' ');
      it.tries++;
      if (got) {
        it.done = it.solved = true; s.score++; var x = addXP(it.tries === 1 ? 15 : 8); s.xp += x; G.stats.built++; checkBadges(); save();
        AU.play('clap'); AU.speak(it.s.py, ''); renderBuild('+' + x + ' XP', 'ok');
      } else if (it.tries >= 2) {
        it.placed = it.words.map(function (w, i) { return { w: w, id: -1 - i }; }); it.done = true; it.solved = false; save(); AU.play('damage'); renderBuild('', '');
      } else { AU.play('damage'); renderBuild('Not quite. Tap a word to take it back and try again.', 'shake'); }
      return true;
    }
    if (act === 'bnext') {
      if (s.i < s.items.length - 1) { s.i++; renderBuild(); } else { checkBadges(); save(); summary('Sentence builder', s.score + '/' + s.items.length, s.xp, 'build', s.score >= 4); }
      return true;
    }
    return false;
  }
  function focusBank() { var b = document.querySelector('.bank .tile2'); if (b) b.focus({ preventScroll: true }); }

  /* ---------- accessibility choices: text size, contrast, motion ---------- */
  function applyPrefs() {
    var r = document.documentElement, P_ = G.prefs;
    r.setAttribute('data-text', ['normal', 'large', 'xlarge'][P_.text] || 'normal');
    r.setAttribute('data-contrast', P_.contrast ? 'high' : 'normal');
    r.setAttribute('data-motion', P_.motion ? 'reduce' : 'normal');
  }
  applyPrefs();

  /* ---------- settings sheet ---------- */
  function settings() {
    var key = ''; try { key = localStorage.getItem('cp.geminiKey') || ''; } catch (e) {}
    var proxy = !!CFG.GEMINI_PROXY_URL;
    function radios(name, vals, cur) { return vals.map(function (v, i) { return '<label><input type="radio" name="' + name + '" value="' + i + '"' + (cur === i ? ' checked' : '') + '> ' + v + '</label>'; }).join(''); }
    app().openSheet('<h2 id="sheetTitle">Settings</h2><p class="sub">Your choices stay in this browser.</p>' +
      '<fieldset class="goalset"><legend>Daily goal</legend>' + [30, 50, 100].map(function (n) { return '<label><input type="radio" name="goal" value="' + n + '"' + (G.goal === n ? ' checked' : '') + '> ' + n + ' XP' + (n === 30 ? ' (relaxed)' : n === 50 ? ' (steady)' : ' (keen)') + '</label>'; }).join('') + '</fieldset>' +
      '<fieldset class="goalset"><legend>Text size</legend>' + radios('ptext', ['Normal', 'Large', 'Extra large'], G.prefs.text) + '</fieldset>' +
      '<fieldset class="goalset"><legend>Display</legend><label><input type="checkbox" id="pContrast"' + (G.prefs.contrast ? ' checked' : '') + '> High contrast colours</label><label><input type="checkbox" id="pMotion"' + (G.prefs.motion ? ' checked' : '') + '> Reduce motion and confetti</label></fieldset>' +
      '<fieldset class="goalset"><legend>Listening and keys</legend><label><input type="checkbox" id="pRead"' + (G.prefs.read ? ' checked' : '') + '> Read pages, questions and answers aloud automatically</label><label><input type="checkbox" id="pKeys"' + (G.prefs.keys !== 0 ? ' checked' : '') + '> One-key shortcuts (H, S, N, W and so on)</label><label><input type="checkbox" id="pVib"' + (G.prefs.vib !== 0 ? ' checked' : '') + '> Vibrate with the tone pitch (phones)</label><p class="fine">If your screen reader already reads everything, leave automatic reading off. You can always press L to read the current page or question. Alt+Shift with a letter always works, even when your screen reader keeps single letters for itself.</p><div class="line"><button type="button" class="btn ghost sm" data-act="keys">See all keyboard shortcuts</button></div></fieldset>' +
      '<div class="keybox"><label for="gKey"><b>Gemini API key</b> (optional)</label><p class="fine">Turns on natural Mandarin audio and “Ask the tutor”. ' + (proxy ? 'This site already uses a secure server, so you do not need a key.' : 'Paste your own key. It is saved only on this device and is never part of the app files.') + '</p>' +
      '<input id="gKey" type="password" autocomplete="off" spellcheck="false" value="' + esc(key) + '"' + (proxy ? ' disabled' : '') + '></div>' +
      '<div class="row"><div class="line"><button class="btn" data-g="savesettings">Save</button></div><div class="line"><button class="btn ghost" data-g="clearkey">Remove saved key</button></div></div>' +
      '<div class="line"><button class="btn ghost sm" data-g="audio">Offline audio…</button></div>');
  }

  /* ---------- routing, clicks, keys ---------- */
  var PMODE = { review: 'drill', listen: 'ear:listen', tone: 'ear:tone', duel: 'ear:duel' };
  function route(p) {
    var m = p[1], sub = p[2];
    if (window.CPPractice && !(m === 'play' && PMODE[sub])) window.CPPractice.leave();
    if (m === 'badges') { stopTimers(); SESS = null; shelf(); return true; }
    if (m !== 'play') { if (SESS && SESS.mode === 'speed') stopTimers(); SESS = null; return false; }
    if (SESS && SESS.mode === sub && sub !== undefined) { return true; }   // already running (e.g. hash set by the game itself)
    if (!sub) { hub(); return true; }
    if (PMODE[sub]) { stopTimers(); SESS = null; if (window.CPPractice) window.CPPractice.start(PMODE[sub]); else { app().toast('This practice screen did not load. Reload the page.'); hub(); } return true; }
    if (sub === 'speed') return startSpeed(), true;
    if (sub === 'match') return startMatch(), true;
    if (sub === 'build') return startBuild(), true;
    hub(); return true;
  }
  function click(t) {
    var act = t.dataset && t.dataset.g; if (!act) return false;
    var A_ = app();
    if (act === 'sopt') { answerSpeed(+t.dataset.pos); return true; }
    if (act === 'hear') { var cur = A_quiz() && A_quiz().qs[A_quiz().i]; if (cur) hearCur(cur, false); return true; }
    if (act === 'card') { flipCard(+t.dataset.i); return true; }
    if (act === 'flip') { spinCoin(t); if (!G.badges[t.dataset.b]) { var b = BADGES.filter(function (x) { return x.id === t.dataset.b; })[0]; if (b) A_.toast('How to earn it: ' + b.desc); } return true; }
    if (act === 'closepop') { A_.closeSheet(); return true; }
    if (act === 'shelf') { A_.closeSheet(); A_.go('#/badges'); return true; }
    if (act === 'settings') { settings(); return true; }
    if (act === 'savesettings') {
      var r = document.querySelector('input[name="goal"]:checked'); if (r) G.goal = +r.value;
      var pt = document.querySelector('input[name="ptext"]:checked'); if (pt) G.prefs.text = +pt.value;
      var pc = document.getElementById('pContrast'), pm = document.getElementById('pMotion'); if (pc) G.prefs.contrast = pc.checked ? 1 : 0; if (pm) G.prefs.motion = pm.checked ? 1 : 0; applyPrefs();
      var pr = document.getElementById('pRead'), pk = document.getElementById('pKeys'), pv = document.getElementById('pVib'); if (pr) G.prefs.read = pr.checked ? 1 : 0; if (pk) G.prefs.keys = pk.checked ? 1 : 0; if (pv) G.prefs.vib = pv.checked ? 1 : 0;
      var k = document.getElementById('gKey'); if (k && !k.disabled) { try { if (k.value.trim()) localStorage.setItem('cp.geminiKey', k.value.trim()); else localStorage.removeItem('cp.geminiKey'); } catch (e) {} }
      save(); A_.closeSheet(); A_.toast('Settings saved.'); if (!location.hash || location.hash === '#/' || location.hash === '#') A_.go('#/'); return true;
    }
    if (act === 'clearkey') { try { localStorage.removeItem('cp.geminiKey'); } catch (e) {} var kk = document.getElementById('gKey'); if (kk) kk.value = ''; A_.toast('Saved key removed.'); return true; }
    if (act === 'home') { stopTimers(); SESS = null; A_.go('#/'); return true; }
    if (act === 'hub') { stopTimers(); SESS = null; if (location.hash === '#/play') hub(); else A_.go('#/play'); return true; }
    if (act === 'badges') { A_.go('#/badges'); return true; }
    if (PMODE[act]) { stopTimers(); SESS = null; A_.go('#/play/' + act); return true; }
    if (act === 'audio') { A_.closeSheet(); if (window.CPPractice) window.CPPractice.offlineSheet(); else A_.toast('Offline audio did not load. Reload the page.'); return true; }
    if (act === 'speed') { startSpeed(); return true; }
    if (act === 'match') { startMatch(); return true; }
    if (act === 'build') { startBuild(); return true; }
    return buildClick(act, t);
  }
  document.addEventListener('keydown', function (e) {
    if (!SESS || e.metaKey || e.ctrlKey || e.altKey) return;
    var sheet = document.getElementById('sheetWrap'); if (sheet && !sheet.hidden) return;
    var k = 'abcd1234'.indexOf(e.key.toLowerCase()); if (k < 0) return; k = k % 4;
    if (SESS.mode === 'speed' && SESS.q && k < SESS.q.order.length) answerSpeed(k);
  });

  /* ---------- hooks called by app.js ---------- */
  var qxp = 0;
  window.CPGame = {
    BANK: BANK, SENT: SENT, BADGES: BADGES,
    route: route, click: click, homeHTML: homeHTML, footHTML: footHTML,
    /* a module-quiz answer: XP and spaced-repetition bookkeeping */
    onAnswer: function (modId, q, ok) {
      if (ok) qxp += addXP(10);
      var k = srsKey(modId, q); if (k && (!ok || G.srs[k])) srsRecord(k, ok);       // a right answer only counts for words already being reviewed
      if (q.audio && ok) { G.stats.listenOK++; checkBadges(); } save();
    },
    /* a module quiz finished */
    onQuiz: function (r) {
      G.stats.quizzes++; if (r.score === r.len) G.stats.perfect++;
      if (r.pass) qxp += addXP(50 + (r.score === r.len ? 25 : 0)); else addXP(0);
      checkBadges(); save();
    },
    resultHTML: function () { var x = qxp; qxp = 0; rollDay(); return '<p class="xpline" style="margin-inline:auto"><b>+' + x + ' XP</b> this quiz · <span aria-hidden="true">🔥</span> ' + liveStreak() + '-day streak · ' + G.dayXP + '/' + G.goal + ' today</p>'; },
    flushBadges: function () { later(badgePopup, 900); },
    /* up to three new-type questions (listening, fill-the-gap, characters) replace ordinary ones in a module quiz */
    mixNew: function (modId, pool, len) {
      var items = BANK.filter(function (b) { return b.m === modId; }), types = ['blank', 'hz2py', 'py2hz'];
      if (canListen()) types = types.concat(['listen', 'listenpy']);
      if (items.length < 8 || pool.length < 6) return pool;
      var out = pool.slice(), want = Math.min(3, Math.floor(out.length / 3)), seen = {};
      for (var i = 0; i < want; i++) {
        var q = randomQ(items, types); if (!q || seen[q.id]) continue; seen[q.id] = 1;
        out[out.length - 1 - i] = q;
      }
      return shuffle(out).slice(0, len);
    },
    reset: function () { var s = G.goal; G = { xp: 0, streak: 0, best: 0, lastDay: '', day: '', dayXP: 0, goalDay: '', goal: s, srs: {}, badges: {}, mig: 1, prefs: G.prefs, stats: { quizzes: 0, perfect: 0, reviews: 0, speedBest: 0, matchBest: 0, built: 0, listenOK: 0, toneOK: 0 } }; NEWQ = []; SESS = null; stopTimers(); save(); },
    pref: function (k) { return G.prefs[k]; },
    statusText: statusText,
    hud: function () { try { hud(); } catch (e) {} },
    spin: spinCoin,
    state: function () { return G; },
    /* used by practice.js */
    addXP: addXP, record: srsRecord, learned: learnedMods, dueCount: dueCount, level: function () { return E.levelOf(G.xp); }, liveStreak: liveStreak,
    countRight: function (q) {           // badge progress for ear training
      if (q.audio) G.stats.listenOK++;
      if (q.type === 'listen-tone' || q.type === 'duel' || q.type === 'tonepair' || q.type === 'tone') G.stats.toneOK++;
      checkBadges();
    },
    drillDone: function () { G.stats.reviews++; checkBadges(); save(); },
    popBadges: function () { later(badgePopup, 700); },
    save: save
  };
})();
