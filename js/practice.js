/* practice.js - Daily review, ear training and offline audio. Loaded after game.js, before app.js.
   XP, streak, badges and the review schedule are shared with game.js (CPGame); questions come from engine.js.

   Screens (keyboard and screen-reader friendly, like the module quizzes), reached from Practice games:
     #/play/review   Daily review: 10 questions, due reviews first, then new words, then extra practice
     #/play/listen   Listen and choose: hear a word, pick the meaning or the pinyin
     #/play/tone     Which tone? hear a syllable, pick its tone (then tone duels)
     #/play/duel     Tone duel: hear one of mā / má / mǎ / mà and pick which one
   Keys during a question: A to D (or 1 to 4) answer, R plays again, S plays it slowly, Esc leaves.   */
(function () {
  'use strict';
  var API = null, E = window.CPEngine, P = null, N = 10, TOK = 0, lastMode = 'drill';
  function S() { return window.CPGame.state(); }
  function AU() { return API.AU; }
  function esc(s) { return API.esc(s); }
  function learned() { return window.CPGame.learned(); }
  function voiceNow() { return AU().isSoundOn() && (AU().canMakeAudio() || AU().hasZhVoice()); }
  function plural(n, w) { return n + ' ' + w + (n === 1 ? '' : 's'); }

  /* ------------------------------------------------------------------ setup */
  function init(api) { API = api; }

  /* ------------------------------------------------------------------ building a session */
  var rng = Math.random;
  function leastSeen(items) {
    var srs = S().srs || {};
    return items.slice().sort(function (a, b) { var x = srs[a.key] ? srs[a.key].box : -1, y = srs[b.key] ? srs[b.key].box : -1; return x - y || rng() - .5; });
  }
  function build(mode) {
    var s = S(), unlocked = API.unlocked(), voice = voiceNow();
    if (mode === 'drill') return { title: 'Daily review', qs: E.buildDrill(s, { now: Date.now(), n: N, learned: learned(), unlocked: unlocked, voice: voice, rng: rng }).qs, needsAudio: false };
    var pool = E.items().filter(function (i) { return i.hz && i.mod <= unlocked; }), qs = [], i;
    if (mode === 'ear:listen') {
      var pick = leastSeen(pool).slice(0, 24).sort(function () { return rng() - .5; });
      for (i = 0; i < pick.length && qs.length < N; i++) { var q = E.make(qs.length % 2 ? 'listen-pinyin' : 'listen-meaning', pick[i], { rng: rng, maxMod: unlocked }); if (q) qs.push(q); }
      return { title: 'Listen and choose', qs: qs, needsAudio: true };
    }
    if (mode === 'ear:tone') {
      var mono = leastSeen(pool.filter(function (x) { return E.make('listen-tone', x, { rng: rng }); })).slice(0, 12).sort(function () { return rng() - .5; });
      for (i = 0; i < mono.length && qs.length < 5; i++) qs.push(E.make('listen-tone', mono[i], { rng: rng }));
      for (i = 0; qs.length < N; i++) qs.push(E.makeDuel({ rng: rng, n: i < 2 ? 2 : 4 }));
      return { title: 'Which tone?', qs: qs, needsAudio: true };
    }
    for (i = 0; i < N; i++) qs.push(E.makeDuel({ rng: rng, n: i < 4 ? 2 : 4 }));
    return { title: 'Tone duel', qs: qs, needsAudio: true };
  }
  /* a listening question that cannot be heard right now becomes its reading twin, so a drill never gets stuck */
  var TWIN = { 'listen-meaning': 'meaning', 'listen-pinyin': 'pinyin', 'listen-tone': 'tone' };
  function prepare(session) {
    var jobs = session.qs.map(function (q, i) {
      if (!q.audio) return Promise.resolve(true);
      return AU().available(q.audio.py, q.audio.hz).then(function (ok) { if (ok) return true; session.qs[i] = twin(q); return false; });
    });
    return Promise.all(jobs).then(function (r) { session.textOnly = r.filter(function (x) { return !x; }).length; return session; });
  }
  function twin(q) {
    var it = q.item && E.byKey(q.item), t = it && TWIN[q.type] ? E.make(TWIN[q.type], it, { rng: rng, maxMod: Math.max(API.unlocked(), it.mod) }) : null;
    return t || E.makeTonePair({ rng: rng });
  }

  /* ------------------------------------------------------------------ messages when audio is needed but not possible */
  function blocked(title, msg, extra) {
    API.setTitle(title);
    API.show('<section class="card note"><h2 id="pm" tabindex="-1">' + esc(title) + '</h2><p>' + msg + '</p>' + (extra || '') + '<p><button class="btn" data-act="home" style="width:100%">Back to home</button></p></section>');
    var h = document.getElementById('pm'); if (h) h.focus();
  }
  function start(mode) {
    var tok = ++TOK; lastMode = mode;
    API.clearQuiz();
    var au = AU();
    if (mode !== 'drill' && !au.isSoundOn()) return blocked('Turn the sound on', 'Listening practice needs sound. Use the Play button at the top of the page, then try again.');
    var session = build(mode);
    prepare(session).then(function (sess) {
      if (tok !== TOK) return;                                    /* the learner has already moved on */
      if (mode !== 'drill' && sess.textOnly >= Math.ceil(sess.qs.length / 2) && !voiceNow()) {
        return blocked('No audio available', 'This device has no Chinese voice and cannot reach the internet, and no words are saved yet. Connect once and use <b>Offline audio</b> to save words, and listening practice will work anywhere.', '<p><button class="btn red" data-pr="audio" style="width:100%">Open Offline audio</button></p>');
      }
      P = { lv0: window.CPGame.level(), mode: mode, title: sess.title, qs: sess.qs, i: 0, score: 0, res: [], answered: false, picked: null, xp: 0, retried: {}, missed: [], active: true, textOnly: sess.textOnly || 0 };
      render(true);
    });
  }

  /* ------------------------------------------------------------------ one question */
  function speak(slow) {
    var q = P && P.qs[P.i]; if (!q || !q.audio) return;
    AU().speak(q.audio.py, q.audio.hz, { slow: !!slow }).then(function (v) { if (v === 'none') API.toast('No Chinese voice on this device. Connect to the internet once to save audio.'); });
  }
  function render(isNew) {
    var q = P.qs[P.i], ans = P.answered, picked = P.picked, h;
    API.setTitle(P.title + ' · ' + (P.i + 1) + ' of ' + P.qs.length);
    h = '<div class="qtop"><span>' + esc(P.title) + ' · Question ' + (P.i + 1) + ' of ' + P.qs.length + '</span><span>Score ' + P.score + '</span></div><div class="dots" aria-hidden="true">' +
      P.qs.map(function (_, i) { return '<i class="' + (i < P.res.length ? (P.res[i] ? 'ok' : 'no') : i === P.i ? 'now' : '') + '"></i>'; }).join('') + '</div>';
    if (q.audio) h += '<div class="listen"><button type="button" class="btn red" data-pr="play" id="btnPlay" aria-label="Play the sound again. Shortcut R."><span aria-hidden="true">🔊</span> Play (R)</button>' +
      '<button type="button" class="btn ghost" data-pr="slow" aria-label="Play it slowly. Shortcut S."><span aria-hidden="true">🐢</span> Slow (S)</button></div>';
    h += '<h2 class="qtext" id="qt" tabindex="-1">' + (ans ? API.rich(q.q) : esc(q.q)) + '</h2><ul class="opts" role="group" aria-labelledby="qt">';
    q.o.forEach(function (o, pos) {
      var cls = 'opt popt' + (ans ? (pos === q.a ? ' right' : pos === picked ? ' wrong' : '') : '');
      h += '<li><button type="button" class="' + cls + '" data-pos="' + pos + '"' + (ans ? ' disabled' : '') + '><span class="k">' + 'ABCD'[pos] + '</span><span>' + (ans || !q.audio ? API.richInline(o) : esc(o)) + '</span></button></li>';
    });
    h += '</ul>';
    if (ans) {
      var ok = picked === q.a;
      h += '<div class="fb ' + (ok ? 'ok' : 'no') + '" role="status"><b>' + (ok ? 'Correct!' : 'Not quite.') + '</b>' +
        (q.audio ? '<div class="heard">You heard: ' + API.rich((q.audio.hz ? q.audio.hz + ' ' : '') + q.audio.py) + '</div>' : '') +
        (ok ? '' : '<div>Answer: ' + API.rich(q.o[q.a]) + '</div>') + (q.e ? '<div>' + API.rich(q.e) + '</div>' : '') + '</div>' +
        '<button class="btn" id="btnPNext" data-pr="next" style="width:100%">' + (P.i === P.qs.length - 1 ? 'See my result' : 'Next question') + '</button>';
    } else h += '<p class="hint">Pick one answer. You can press A, B, C or D' + (q.audio ? ', R to hear it again, S for slow' : '') + '.</p>';
    API.show(h, false, true);
    var focus = ans ? document.getElementById('btnPNext') : document.getElementById('qt');
    if (focus) try { focus.focus({ preventScroll: true }); } catch (e) {}
    if (!ans && q.audio) setTimeout(function () { if (P && P.qs[P.i] === q && !P.answered) speak(false); }, 900);   /* after the question has been announced */
  }
  function answer(pos) {
    if (!P || P.answered) return;
    var q = P.qs[P.i], ok = pos === q.a, G = window.CPGame;
    P.answered = true; P.picked = pos; P.res.push(ok); if (ok) P.score++;
    if (q.key && (q.key.charAt(0) === 'v' || q.key.charAt(0) === 'q')) G.record(q.key, ok);
    P.xp += G.addXP(ok ? (q.audio ? 12 : 10) : 2); if (ok) G.countRight(q);
    if (!ok) {
      P.missed.push(q);
      if (q.item && !P.retried[q.key] && P.i < P.qs.length - 1) {          /* a second chance a few questions later, in an easier form */
        P.retried[q.key] = 1; var it = E.byKey(q.item), again = it ? E.make(q.audio ? TWIN[q.type] || 'meaning' : 'meaning', it, { rng: rng, maxMod: Math.max(API.unlocked(), it.mod) }) : null;
        if (again) P.qs.splice(Math.min(P.qs.length, P.i + 3), 0, again);
      }
    }
    G.save(); AU().play(ok ? 'clap' : 'damage'); render(false);
    if (q.audio) setTimeout(function () { if (P && P.answered && P.qs[P.i] === q) speak(false); }, 1300);   /* say the right answer again, so the ear learns it */
  }
  function next() { if (!P) return; if (P.i < P.qs.length - 1) { P.i++; P.answered = false; P.picked = null; render(true); } else finish(); }

  /* ------------------------------------------------------------------ result */
  function finish() {
    var G = window.CPGame, bonus = G.addXP(20), total = P.qs.length, before = P.lv0, after = G.level();
    if (P.mode === 'drill') G.drillDone(); else G.save();
    var pct = P.score / total, good = pct >= .7, st = G.liveStreak();
    API.setTitle('Result · ' + P.title);
    var h = '<div class="result ' + (good ? 'pass' : 'fail') + '"><p class="kicker" style="color:var(--soft);margin:0">' + esc(P.title) + '</p>' +
      '<div class="score" aria-label="You scored ' + P.score + ' out of ' + total + '">' + P.score + '<span>/' + total + '</span></div>' +
      '<h2 id="pres" tabindex="-1">' + (pct === 1 ? 'Perfect!' : good ? 'Well done!' : 'Good effort. Every miss teaches your ear.') + '</h2>' +
      '<p class="pstat" style="margin-inline:auto"><span aria-hidden="true">🔥</span> ' + plural(st, 'day') + ' streak · +' + (P.xp + bonus) + ' XP · Level ' + after + (after > before ? ' <b>(level up!)</b>' : '') + '</p>' +
      (P.textOnly ? '<p class="hint" style="justify-content:center">' + plural(P.textOnly, 'listening question') + ' became reading questions because audio was not available.</p>' : '');
    var seen = {}, miss = P.missed.filter(function (q) { var k = q.id; if (seen[k]) return false; seen[k] = 1; return true; });
    if (miss.length) h += '<div class="review"><h3>Worth another look</h3>' + miss.map(function (q) { return '<div class="card"><p class="q">' + (q.audio ? 'You heard: ' + API.rich((q.audio.hz ? q.audio.hz + ' ' : '') + q.audio.py) : API.rich(q.q)) + '</p><p class="a">' + API.rich(q.o[q.a]) + '</p></div>'; }).join('') + '</div>';
    h += '<div class="actions"><div class="line"><button class="btn red" data-pr="again" style="width:100%">' + (P.mode === 'drill' ? 'Another review' : 'Practise again') + '</button></div>' +
      '<div class="line"><button class="btn ghost" data-g="hub">Practice games</button></div><div class="line"><button class="btn ghost" data-act="home">All modules</button></div></div></div>';
    P.active = false; API.show(h); var r = document.getElementById('pres'); if (r) r.focus(); AU().play(good ? 'clap' : 'sad');
    if (good) API.confetti(); G.popBadges();
    P = null;
  }

  /* ------------------------------------------------------------------ offline audio sheet */
  function words(which) {
    var ln = learned(), un = API.unlocked();
    return E.items().filter(function (i) { return i.hz && (which === 'all' || ln.indexOf(i.mod) >= 0 || i.mod <= (ln.length ? -1 : un)); }).map(function (i) { return { py: i.py, hz: i.hz }; });
  }
  function offlineSheet(msg) {
    AU().store.count().then(function (n) {
      var ln = words('learned').length, all = words('all').length, canMake = AU().canMakeAudio();
      API.openSheet('<h2 id="shTitle" tabindex="-1">Offline audio</h2>' +
        '<p>Each word is spoken once by the AI voice and then saved on this device. <b>' + plural(n || 0, 'clip') + ' saved.</b> Saved words play instantly and work with no internet.</p>' +
        '<p class="hint">Chinese voice on this device: ' + (AU().hasZhVoice() ? 'yes' : 'no') + '. Internet audio: ' + (canMake ? 'ready' : 'not available right now') + '.</p>' +
        '<p id="pfstat" role="status" aria-live="polite">' + esc(msg || '') + '</p>' +
        '<button class="btn red" data-pr="pf:learned" style="width:100%;margin:.3rem 0"' + (canMake ? '' : ' disabled') + '>Save the words I have studied (' + ln + ')</button>' +
        '<button class="btn" data-pr="pf:all" style="width:100%;margin:.3rem 0"' + (canMake ? '' : ' disabled') + '>Save every word with characters (' + all + ')</button>' +
        '<button class="btn ghost" data-pr="pf:stop" style="width:100%;margin:.3rem 0">Stop saving</button>' +
        '<button class="btn ghost" data-pr="pf:clear" style="width:100%;margin:.3rem 0">Remove saved audio</button>');
      var t = document.getElementById('shTitle'); if (t) t.focus();
    });
  }
  function save(which) {
    var list = words(which), stat = document.getElementById('pfstat');
    if (!list.length) { if (stat) stat.textContent = 'There are no words to save yet. Read a module first.'; return; }
    AU().prefetch(list, function (p) { var el = document.getElementById('pfstat'); if (el) el.textContent = 'Saving… ' + (p.done + p.have + p.failed) + ' of ' + p.total + ' checked, ' + p.done + ' new.'; }).then(function (r) {
      if (r.busy) return;
      var el = document.getElementById('pfstat'); if (!el) return;
      el.textContent = r.stopped ? 'Stopped. ' + (r.why === 'offline' ? 'Connect to the internet to save more.' : '') + ' ' + r.done + ' new clips saved.' : 'Done. ' + r.done + ' new clips saved' + (r.have ? ', ' + r.have + ' were already saved' : '') + (r.failed ? ', ' + r.failed + ' could not be made' : '') + '.';
      AU().store.count().then(function (n) { var c = document.querySelector('#sheetBody p b'); if (c) c.textContent = plural(n || 0, 'clip') + ' saved.'; });
    });
  }

  /* ------------------------------------------------------------------ events */
  function click(t) {
    if (t.classList && t.classList.contains('popt')) { answer(+t.dataset.pos); return true; }
    var a = t.dataset && t.dataset.pr; if (!a) return false;
    if (a === 'again') { start(lastMode); return true; }
    if (a === 'play') { speak(false); return true; }
    if (a === 'slow') { speak(true); return true; }
    if (a === 'next') { next(); return true; }
    if (a === 'audio') { offlineSheet(); return true; }
    if (a === 'pf:learned' || a === 'pf:all') { save(a.slice(3)); return true; }
    if (a === 'pf:stop') { AU().cancelPrefetch(); return true; }
    if (a === 'pf:clear') { if (confirm('Remove all saved audio from this device?')) AU().store.clear().then(function () { offlineSheet('Saved audio removed.'); }); return true; }
    return false;
  }
  function leave() { TOK++; if (P) P.active = false; }
  document.addEventListener('keydown', function (e) {
    if (!P || !P.active || e.ctrlKey || e.metaKey || e.altKey) return;
    var q = P.qs[P.i], k = e.key.toLowerCase(), tag = e.target && e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (!P.answered) {
      var pos = 'abcd'.indexOf(k); if (pos < 0 && /^[1-4]$/.test(k)) pos = +k - 1;
      if (pos >= 0 && pos < q.o.length) { e.preventDefault(); answer(pos); return; }
    }
    if (q.audio && k === 'r') { e.preventDefault(); speak(false); return; }
    if (q.audio && k === 's') { e.preventDefault(); speak(true); return; }
    if (k === 'escape') { e.preventDefault(); leave(); AU().stopAll(); API.go('#/play'); return; }
    if (P.answered && (k === 'enter' || k === ' ') && tag !== 'BUTTON') { e.preventDefault(); next(); }
  });

  window.CPPractice = { init: init, start: start, click: click, leave: leave, offlineSheet: offlineSheet };
})();
