/* engine.js - question generator, spaced repetition and streak (pure logic: no screen, no sound)

   WHAT IT DOES
   1. Reads every vocabulary table in COURSE and builds a word database (about 400 words with characters).
   2. Makes fresh questions from those words, with clever wrong answers:
        meaning        what does this word mean?
        pinyin         how do you say it? (wrong answers differ mostly by TONE)
        char           which characters mean this? (wrong answers share a character)
        tone           what tone is this syllable?
        listen-meaning hear it, pick the meaning            (needs audio)
        listen-pinyin  hear it, pick the pinyin             (needs audio, tone-sensitive)
        listen-tone    hear a syllable, pick its tone       (needs audio)
        duel           hear one of a tone pair (mā / má / mǎ / mà) and pick which one (needs audio)
   3. Schedules reviews: every word and every missed quiz question has a box from 0 to 5.
      Right answer: up a box, due later. Wrong answer: back two boxes, due again in 10 minutes.
   4. Builds the Daily Drill (10 questions: due reviews first, then new words, then extra practice).
   5. Tracks the daily streak.

   Works in the browser (window.CPEngine) and in Node (module.exports) so it can be tested.        */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CPEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var PY = null, COURSE = null, ITEMS = [], BYKEY = {}, STATIC = {}, MIN = 60000, DAY = 86400000;
  var INTERVAL = [10 * MIN, 1 * DAY, 2 * DAY, 4 * DAY, 8 * DAY, 16 * DAY];

  /* ------------------------------------------------------------------ helpers */
  function rngOf(r) { return typeof r === 'function' ? r : Math.random; }
  function shuffle(a, rng) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(rng() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function pick(a, rng) { return a[Math.floor(rng() * a.length)]; }
  function hash(s) { var h = 5381; for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }
  function cleanEn(en) { return String(en || '').replace(/\s*\((?:first|second|third|fourth|neutral|1st|2nd|3rd|4th)[^)]*\)/ig, '').replace(/\s+/g, ' ').trim(); }
  function norm(s) { return String(s || '').toLowerCase().replace(/\([^)]*\)/g, '').replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim(); }
  function stripTone(s) {
    return s.normalize('NFC').replace(/[āáǎà]/g, 'a').replace(/[ĀÁǍÀ]/g, 'A').replace(/[ēéěè]/g, 'e').replace(/[ĒÉĚÈ]/g, 'E').replace(/[īíǐì]/g, 'i').replace(/[ĪÍǏÌ]/g, 'I')
      .replace(/[ōóǒò]/g, 'o').replace(/[ŌÓǑÒ]/g, 'O').replace(/[ūúǔù]/g, 'u').replace(/[ŪÚǓÙ]/g, 'U').replace(/[ǖǘǚǜ]/g, 'ü').replace(/[ǕǗǙǛ]/g, 'Ü');
  }
  var MARKS = { a: 'aāáǎà', e: 'eēéěè', i: 'iīíǐì', o: 'oōóǒò', u: 'uūúǔù', 'ü': 'üǖǘǚǜ' };
  function setTone(syl, t) {                       /* put tone t (1-4, 5 = none) on a pinyin syllable */
    var b = stripTone(syl), low = b.toLowerCase(), idx = -1, i;
    if ((i = low.indexOf('a')) >= 0) idx = i; else if ((i = low.indexOf('e')) >= 0) idx = i;
    else if ((i = low.indexOf('ou')) >= 0) idx = i;
    else { for (i = low.length - 1; i >= 0; i--) if ('iouü'.indexOf(low[i]) >= 0) { idx = i; break; } }
    if (idx < 0 || t === 5) return b;
    var ch = low[idx], rep = MARKS[ch][t]; if (b[idx] !== ch) rep = rep.toUpperCase();
    return b.slice(0, idx) + rep + b.slice(idx + 1);
  }
  function wordSyllables(py) {                     /* [[syllable, ...] per word] */
    return py.split(/\s+/).filter(Boolean).map(function (w) { return PY.segment(w.replace(/[.,;:!?]/g, '')); });
  }
  function varyTone(py, rng) {                     /* same pinyin with one syllable's tone changed */
    var words = wordSyllables(py), flat = [];
    words.forEach(function (w, wi) { w.forEach(function (s, si) { if (/[a-zü]/i.test(s)) flat.push([wi, si]); }); });
    if (!flat.length) return null;
    var tries = 0;
    while (tries++ < 12) {
      var p = pick(flat, rng), old = PY.toneOf(words[p[0]][p[1]]), t = 1 + Math.floor(rng() * 4);
      if (t === old) continue;
      var copy = words.map(function (w) { return w.slice(); }); copy[p[0]][p[1]] = setTone(copy[p[0]][p[1]], t);
      var out = copy.map(function (w) { return w.map(function (s, i) { return (i && /^[aeo]/i.test(s) ? "'" : '') + s; }).join(''); }).join(' ');
      if (out !== py) return out;
    }
    return null;
  }
  function ordinal(n) { return ['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh'][n] || (n + 'th'); }
  function toneLine(py) {
    var a = PY.analyze(py), out = a.syllables.filter(function (s) { return /[a-zü]/i.test(s.text); }).map(function (s) { return s.text + ' is ' + PY.TONES[s.tone].name.toLowerCase() + ' (' + PY.TONES[s.tone].shape.toLowerCase() + ')'; });
    var line = out.length ? 'Tones: ' + out.join(', ') + '.' : '';
    if (a.notes && a.notes.length) line += ' ' + a.notes.join(' ');
    return line;
  }
  function isMono(py) { var s = PY.analyze(py).syllables; return s.length === 1 && /[a-zü]/i.test(s[0].text); }
  function disp(it) { return it.hz ? it.hz + ' (' + it.py + ')' : it.py; }

  /* ------------------------------------------------------------------ tone families (hand-checked) */
  var TONESETS = [
    { base: 'ma', w: [[1, 'mā', '妈', 'mother'], [2, 'má', '麻', 'hemp'], [3, 'mǎ', '马', 'horse'], [4, 'mà', '骂', 'to scold']] },
    { base: 'ba', w: [[1, 'bā', '八', 'eight'], [2, 'bá', '拔', 'to pull up'], [3, 'bǎ', '把', 'to hold'], [4, 'bà', '爸', 'dad']] },
    { base: 'shi', w: [[1, 'shī', '师', 'master, teacher'], [2, 'shí', '十', 'ten'], [3, 'shǐ', '史', 'history'], [4, 'shì', '是', 'to be']] },
    { base: 'yi', w: [[1, 'yī', '衣', 'clothes'], [2, 'yí', '姨', 'aunt'], [3, 'yǐ', '椅', 'chair'], [4, 'yì', '亿', 'hundred million']] },
    { base: 'tang', w: [[1, 'tāng', '汤', 'soup'], [2, 'táng', '糖', 'sugar'], [3, 'tǎng', '躺', 'to lie down'], [4, 'tàng', '烫', 'scalding hot']] },
    { base: 'wen', w: [[1, 'wēn', '温', 'warm'], [2, 'wén', '文', 'writing, culture'], [3, 'wěn', '稳', 'steady'], [4, 'wèn', '问', 'to ask']] },
    { base: 'qi', w: [[1, 'qī', '七', 'seven'], [2, 'qí', '骑', 'to ride'], [3, 'qǐ', '起', 'to rise'], [4, 'qì', '气', 'air, gas']] },
    { base: 'ji', w: [[1, 'jī', '鸡', 'chicken'], [2, 'jí', '急', 'urgent'], [3, 'jǐ', '几', 'how many'], [4, 'jì', '记', 'to remember']] },
    { base: 'xiang', w: [[1, 'xiāng', '香', 'fragrant'], [3, 'xiǎng', '想', 'to think, to want'], [4, 'xiàng', '象', 'elephant']] },
    { base: 'fu', w: [[1, 'fū', '夫', 'husband'], [2, 'fú', '福', 'good fortune'], [3, 'fǔ', '府', 'government office'], [4, 'fù', '父', 'father']] },
    { base: 'tu', w: [[1, 'tū', '秃', 'bald'], [2, 'tú', '图', 'picture'], [3, 'tǔ', '土', 'earth, soil'], [4, 'tù', '兔', 'rabbit']] },
    { base: 'shu', w: [[1, 'shū', '书', 'book'], [2, 'shú', '熟', 'ripe, familiar'], [3, 'shǔ', '鼠', 'rat'], [4, 'shù', '树', 'tree']] },
    { base: 'guo', w: [[1, 'guō', '锅', 'pot'], [2, 'guó', '国', 'country'], [3, 'guǒ', '果', 'fruit'], [4, 'guò', '过', 'to pass, to cross']] },
    { base: 'hua', w: [[1, 'huā', '花', 'flower'], [2, 'huá', '华', 'magnificent, Chinese'], [4, 'huà', '话', 'speech, words']] }
  ].map(function (s) { return { base: s.base, words: s.w.map(function (x) { return { tone: x[0], py: x[1], hz: x[2], en: x[3] }; }) }; });

  /* ------------------------------------------------------------------ word database */
  function init(course, pinyin) {
    COURSE = course; PY = pinyin; ITEMS = []; BYKEY = {}; STATIC = {}; var SEEN = {};
    course.modules.forEach(function (m) {
      m.pages.forEach(function (p) {
        (p.blocks || []).forEach(function (b) {
          if (!b.table || b.table.length < 2) return;
          var h = b.table[0].map(function (x) { return String(x).toLowerCase().trim(); });
          var pyCols = [], hzCol = h.indexOf('characters');
          h.forEach(function (c, i) { if (c === 'pinyin') pyCols.push(i); });
          if (!pyCols.length) return;
          for (var r = 1; r < b.table.length; r++) {
            pyCols.forEach(function (pc) {
              var enc = h.indexOf('english', pc + 1); if (enc < 0) return;
              var row = b.table[r], py = (row[pc] || '').trim(), en = cleanEn(row[enc]), hz = hzCol >= 0 && pc < hzCol && hzCol < enc ? (row[hzCol] || '').trim() : '';
              if (!py || !en || /\.\s/.test(py) || py.split(/\s+/).length > 6) return;
              /* shared quality rules: sentences go to the Sentence builder, not the word bank */
              if (/[.?!]$/.test(py) || py.split(/\s+/).length > 4) return;
              if (en.charAt(0) === '(' || en.length > 40 || py.length > 26 || /[…\/]/.test(py)) return;
              var dup = py.toLowerCase().replace(/\s+/g, ' ') + '|' + en.toLowerCase().replace(/\s+/g, ' ');
              if (SEEN[dup]) return; SEEN[dup] = 1;                 /* the same word in two modules is one word */
              var key = 'v:' + hash(m.id + '|' + py + '|' + en);
              if (BYKEY[key]) return;
              var it = { key: key, id: key, mod: m.id, py: py, hz: hz, en: en, page: p.title || '' }; ITEMS.push(it); BYKEY[key] = it;
            });
          }
        });
      });
      (m.questions || []).forEach(function (q) { if (q.id) STATIC['q:' + q.id] = { q: q, mod: m.id }; });
    });
    return ITEMS.length;
  }

  /* ------------------------------------------------------------------ distractors */
  function itemsUpTo(maxMod) { return ITEMS.filter(function (i) { return i.mod <= maxMod; }); }
  function sameKind(a, b) { return (/^to /i.test(a.en) === /^to /i.test(b.en)); }
  function distinctPick(cands, correctNorm, rng, n, keyFn, taken) {
    var out = [], seen = {}; seen[correctNorm] = 1; (taken || []).forEach(function (t) { seen[t] = 1; });
    cands = shuffle(cands, rng);
    for (var i = 0; i < cands.length && out.length < n; i++) { var k = keyFn(cands[i]); if (!k || seen[k]) continue; seen[k] = 1; out.push(cands[i]); }
    return out;
  }
  function enOk(a, b) { var x = norm(a.en), y = norm(b.en); if (!y || x === y) return false; if (x.length > 3 && y.length > 3 && (x.indexOf(y) >= 0 || y.indexOf(x) >= 0)) return false; return true; }
  function meaningDistractors(item, maxMod, rng, n) {
    var all = itemsUpTo(maxMod).filter(function (x) { return x.key !== item.key && enOk(item, x); });
    var near = all.filter(function (x) { return x.mod === item.mod && sameKind(item, x); }), mid = all.filter(function (x) { return sameKind(item, x); });
    var got = distinctPick(near, norm(item.en), rng, n, function (x) { return norm(x.en); });
    if (got.length < n) got = got.concat(distinctPick(mid, norm(item.en), rng, n - got.length, function (x) { return norm(x.en); }, got.map(function (x) { return norm(x.en); })));
    if (got.length < n) got = got.concat(distinctPick(all, norm(item.en), rng, n - got.length, function (x) { return norm(x.en); }, got.map(function (x) { return norm(x.en); })));
    return got.map(function (x) { return x.en; });
  }
  function pinyinDistractors(item, maxMod, rng, n) {
    var out = [], seen = {}; seen[item.py] = 1;
    for (var t = 0; t < 8 && out.length < Math.min(2, n); t++) { var v = varyTone(item.py, rng); if (v && !seen[v]) { seen[v] = 1; out.push(v); } }
    var syl = PY.analyze(item.py).syllables.length;
    var pool = itemsUpTo(maxMod).filter(function (x) { return x.key !== item.key && !seen[x.py] && PY.analyze(x.py).syllables.length === syl; });
    shuffle(pool, rng).forEach(function (x) { if (out.length < n && !seen[x.py]) { seen[x.py] = 1; out.push(x.py); } });
    for (var u = 0; u < 12 && out.length < n; u++) { var w = varyTone(item.py, rng); if (w && !seen[w]) { seen[w] = 1; out.push(w); } }
    return out;
  }
  function charDistractors(item, maxMod, rng, n) {
    var len = item.hz.length, pool = itemsUpTo(maxMod).filter(function (x) { return x.hz && x.key !== item.key && x.hz !== item.hz && x.hz.length === len; });
    var share = pool.filter(function (x) { for (var i = 0; i < x.hz.length; i++) if (item.hz.indexOf(x.hz[i]) >= 0) return true; return false; });
    var got = distinctPick(share, item.hz, rng, n, function (x) { return x.hz; });
    if (got.length < n) got = got.concat(distinctPick(pool, item.hz, rng, n - got.length, function (x) { return x.hz; }, got.map(function (x) { return x.hz; })));
    if (got.length < n) got = got.concat(distinctPick(itemsUpTo(maxMod).filter(function (x) { return x.hz && x.hz !== item.hz; }), item.hz, rng, n - got.length, function (x) { return x.hz; }, got.map(function (x) { return x.hz; })));
    return got.map(function (x) { return x.hz; });
  }

  /* ------------------------------------------------------------------ question builders */
  function finish(base, correct, wrongs, rng) {
    var opts = shuffle([correct].concat(wrongs), rng); base.o = opts; base.a = opts.indexOf(correct); base.s = 'gen'; return base;
  }
  function explainItem(it) { return it.py + (it.hz ? ' (' + it.hz + ')' : '') + ' means "' + it.en + '". ' + toneLine(it.py); }
  var TONEOPT = ['First tone: high and level', 'Second tone: rising', 'Third tone: dipping', 'Fourth tone: falling'];

  function make(type, item, ctxo) {
    ctxo = ctxo || {}; var rng = rngOf(ctxo.rng), maxMod = ctxo.maxMod != null ? ctxo.maxMod : item.mod, q, w;
    var base = { id: 'g:' + type + ':' + item.key, key: item.key, type: type, mod: item.mod, e: explainItem(item), item: item.key };
    if (type === 'meaning') {
      w = meaningDistractors(item, maxMod, rng, 3); if (w.length < 3) return null;
      base.q = 'What does ' + disp(item) + ' mean?'; return finish(base, item.en, w, rng);
    }
    if (type === 'pinyin') {
      w = pinyinDistractors(item, maxMod, rng, 3); if (w.length < 3) return null;
      base.q = 'How do you say "' + item.en + '" in Chinese? Choose the pinyin.'; return finish(base, item.py, w, rng);
    }
    if (type === 'char') {
      if (!item.hz) return null; w = charDistractors(item, maxMod, rng, 3); if (w.length < 3) return null;
      base.q = 'Which characters mean "' + item.en + '"?'; return finish(base, item.hz, w, rng);
    }
    if (type === 'tone') {
      if (!isMono(item.py)) return null; var t = PY.toneOf(item.py); if (t > 4) return null;
      base.q = 'What tone is ' + disp(item) + '?'; base.o = TONEOPT.slice(); base.a = t - 1; base.s = 'gen'; return base;
    }
    if (type === 'listen-meaning') {
      if (!item.hz) return null; w = meaningDistractors(item, maxMod, rng, 3); if (w.length < 3) return null;
      base.q = 'Listen. What does it mean?'; base.audio = { py: item.py, hz: item.hz }; return finish(base, item.en, w, rng);
    }
    if (type === 'listen-pinyin') {
      if (!item.hz) return null; w = pinyinDistractors(item, maxMod, rng, 3); if (w.length < 3) return null;
      base.q = 'Listen. Which pinyin did you hear?'; base.audio = { py: item.py, hz: item.hz }; return finish(base, item.py, w, rng);
    }
    if (type === 'listen-tone') {
      if (!item.hz || !isMono(item.py)) return null; var tt = PY.toneOf(item.py); if (tt > 4) return null;
      base.q = 'Listen. Which tone did you hear?'; base.audio = { py: item.py, hz: item.hz }; base.o = TONEOPT.slice(); base.a = tt - 1; base.s = 'gen'; return base;
    }
    return null;
  }
  function makeDuel(ctxo) {
    ctxo = ctxo || {}; var rng = rngOf(ctxo.rng), n = ctxo.n || 2, set = ctxo.set || pick(TONESETS, rng), target = ctxo.target || pick(set.words, rng);
    var others = shuffle(set.words.filter(function (x) { return x !== target; }), rng).slice(0, n - 1);
    var label = function (x) { return x.py + '  ' + x.hz + '  ' + x.en; };
    var opts = shuffle([target].concat(others), rng);
    var all = set.words.map(function (x) { return x.py + ' (' + x.hz + ', ' + x.en + ')'; }).join('; ');
    return { id: 'g:duel:' + set.base + ':' + target.tone, key: 'd:' + set.base, type: 'duel', mod: -1, q: 'Listen. Which one did you hear?', audio: { py: target.py, hz: target.hz },
      o: opts.map(label), a: opts.indexOf(target), s: 'gen', e: target.py + ' (' + target.hz + ') means "' + target.en + '", said with the ' + PY.TONES[target.tone].name.toLowerCase() + ' (' + PY.TONES[target.tone].shape.toLowerCase() + '). The same sound in every tone: ' + all + '.' };
  }
  function makeTonePair(ctxo) {                    /* text version of a duel, for when no audio is available */
    ctxo = ctxo || {}; var rng = rngOf(ctxo.rng), set = pick(TONESETS, rng), target = pick(set.words, rng);
    var others = shuffle(set.words.filter(function (x) { return x !== target; }), rng).slice(0, 3), opts = shuffle([target].concat(others), rng);
    return { id: 'g:tp:' + set.base + ':' + target.tone, key: 'd:' + set.base, type: 'tonepair', mod: -1, q: 'Which word is "' + target.en + '" (' + target.hz + ')?', o: opts.map(function (x) { return x.py; }), a: opts.indexOf(target), s: 'gen',
      e: target.py + ' (' + target.hz + ') means "' + target.en + '". Same sound, different tones: ' + set.words.map(function (x) { return x.py + ' (' + x.en + ')'; }).join('; ') + '.' };
  }

  /* ------------------------------------------------------------------ spaced repetition */
  function review(state, key, ok, now) {
    now = now || Date.now(); state.srs = state.srs || {};
    var r = state.srs[key] || { box: 0, n: 0, ok: 0, bad: 0 };
    r.n++; if (ok) { r.ok++; r.box = Math.min(5, r.box + 1); } else { r.bad++; r.box = Math.max(0, r.box - 2); }
    r.due = now + INTERVAL[r.box]; r.last = now; state.srs[key] = r; return r;
  }
  function dueKeys(state, now) {
    var out = []; Object.keys(state.srs || {}).forEach(function (k) { var r = state.srs[k]; if (r.due <= now && (BYKEY[k] || STATIC[k])) out.push(k); });
    return out.sort(function (a, b) { return state.srs[a].due - state.srs[b].due; });
  }
  function typesFor(item, box, voice, rng) {
    var t = [];
    if (box <= 0) t = voice && item.hz ? ['listen-meaning', 'meaning', 'meaning'] : ['meaning'];
    else if (box === 1) t = voice && item.hz ? ['listen-pinyin', 'pinyin'] : ['pinyin'];
    else if (box === 2) t = item.hz ? (voice ? ['char', 'listen-meaning', 'pinyin'] : ['char', 'pinyin']) : ['pinyin', 'meaning'];
    else t = item.hz ? (voice ? ['listen-pinyin', 'char'] : ['char', 'pinyin']) : ['pinyin'];
    if (isMono(item.py) && item.hz) t = t.concat(voice ? ['listen-tone', 'tone'] : ['tone']);
    return shuffle(t, rng);
  }
  /* state: { srs }.  opts: { now, n, learned:[module ids], unlocked:max module id, voice:bool, rng } */
  function buildDrill(state, opts) {
    opts = opts || {}; var now = opts.now || Date.now(), n = opts.n || 10, rng = rngOf(opts.rng), voice = !!opts.voice, learned = opts.learned || [];
    var maxMod = learned.length ? Math.max.apply(null, learned) : (opts.unlocked || 0), qs = [], used = {}, counts = { due: 0, fresh: 0, extra: 0, filler: 0 };
    function addItem(key, box, kind) {
      if (qs.length >= n || used[key]) return;
      if (STATIC[key]) {
        var sq = STATIC[key].q; qs.push({ id: sq.id, key: key, type: 'static', mod: STATIC[key].mod, q: sq.q, o: sq.o.slice(), a: sq.a, e: sq.e || '', s: sq.s, fromQuiz: true }); used[key] = 1; counts[kind]++; return;
      }
      var it = BYKEY[key]; if (!it) return;
      var types = typesFor(it, box, voice, rng);
      for (var i = 0; i < types.length; i++) { var q = make(types[i], it, { rng: rng, maxMod: Math.max(maxMod, it.mod) }); if (q) { qs.push(q); used[key] = 1; counts[kind]++; return; } }
    }
    var allowed = function (k) { var it = BYKEY[k]; return STATIC[k] || (it && (learned.indexOf(it.mod) >= 0 || (!learned.length && it.mod <= (opts.unlocked || 0)))); };
    dueKeys(state, now).filter(allowed).slice(0, 6).forEach(function (k) { addItem(k, state.srs[k].box, 'due'); });
    var seen = state.srs || {}, mods = learned.length ? learned : [opts.unlocked || 0];
    var fresh = ITEMS.filter(function (i) { return mods.indexOf(i.mod) >= 0 && !seen[i.key]; }).sort(function (a, b) { return b.mod - a.mod; });
    var seenKeys = Object.keys(state.srs || {}).filter(function (k) { return BYKEY[k] && allowed(k) && !used[k]; }).length;
    var cap = (qs.length + seenKeys) >= 6 ? 4 : 7;                  /* plenty to review: introduce 4 new words; little to review: introduce up to 7 */
    var take = Math.min(cap, n - qs.length), freshPicked = shuffle(fresh.slice(0, 20), rng);
    freshPicked.forEach(function (it) { if (counts.fresh < take) addItem(it.key, 0, 'fresh'); });
    if (qs.length < n) {                           /* extra practice: the weakest words that are not due yet */
      var weak = Object.keys(seen).filter(function (k) { return BYKEY[k] && allowed(k) && !used[k]; }).sort(function (a, b) { return seen[a].box - seen[b].box; });
      weak.forEach(function (k) { if (qs.length < n) addItem(k, seen[k].box, 'extra'); });
    }
    var guard = 0;
    while (qs.length < n && guard++ < 60) {        /* filler: tone training never runs out */
      var q = voice && rng() < .6 ? makeDuel({ rng: rng, n: 2 + (rng() < .4 ? 2 : 0) }) : makeTonePair({ rng: rng }); if (!used[q.id]) { used[q.id] = 1; qs.push(q); counts.filler++; }
    }
    return { qs: interleave(qs, rng), counts: counts };
  }
  function interleave(qs, rng) { return shuffle(qs, rng); }
  /* extra questions to top up a module quiz so a retry is never the same ten */
  function topUp(mod, n, ctxo) {
    ctxo = ctxo || {}; var rng = rngOf(ctxo.rng), out = [], avoid = ctxo.avoid || {}, pool = shuffle(ITEMS.filter(function (i) { return i.mod === mod; }), rng).concat(shuffle(ITEMS.filter(function (i) { return i.mod < mod; }), rng).slice(0, 12));
    var types = ['meaning', 'pinyin', 'char', 'tone'], ti = 0;
    for (var i = 0; i < pool.length && out.length < n; i++) {
      if (avoid[pool[i].key]) continue;
      for (var k = 0; k < types.length; k++) { var q = make(types[(ti + k) % types.length], pool[i], { rng: rng, maxMod: mod }); if (q) { out.push(q); ti++; break; } }
    }
    return out;
  }

  /* ------------------------------------------------------------------ streak and levels */
  function dayStr(d) { d = d || new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function addDays(s, k) { var p = s.split('-'), d = new Date(+p[0], +p[1] - 1, +p[2] + k); return dayStr(d); }
  function touchStreak(state, today) {
    today = today || dayStr(); var s = state.streak = state.streak || { count: 0, last: '', best: 0 };
    if (s.last === today) return { count: s.count, changed: false };
    s.count = (s.last === addDays(today, -1)) ? s.count + 1 : 1; s.last = today; s.best = Math.max(s.best || 0, s.count);
    return { count: s.count, changed: true };
  }
  function liveStreak(state, today) {               /* what to show on the home screen */
    today = today || dayStr(); var s = state.streak; if (!s || !s.last) return { count: 0, doneToday: false, atRisk: false };
    if (s.last === today) return { count: s.count, doneToday: true, atRisk: false };
    if (s.last === addDays(today, -1)) return { count: s.count, doneToday: false, atRisk: true };
    return { count: 0, doneToday: false, atRisk: false };
  }
  function levelOf(xp) { return 1 + Math.floor((xp || 0) / 250); }

  return { init: init, items: function () { return ITEMS; }, byKey: function (k) { return BYKEY[k]; }, staticQ: function (k) { return STATIC[k]; }, toneSets: function () { return TONESETS; },
    make: make, makeDuel: makeDuel, makeTonePair: makeTonePair, review: review, dueKeys: dueKeys, buildDrill: buildDrill, topUp: topUp, touchStreak: touchStreak, liveStreak: liveStreak, levelOf: levelOf, dayStr: dayStr,
    setTone: setTone, varyTone: varyTone, stripTone: stripTone, INTERVAL: INTERVAL, cleanEn: cleanEn, norm: norm };
});
