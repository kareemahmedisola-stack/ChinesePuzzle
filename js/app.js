/* Know your Chinese – app logic: modules, lessons, quizzes, gating. */
(function () {
  'use strict';
  var CFG = window.CP_CONFIG, COURSE = window.COURSE, PY = window.CPPinyin, AU = window.CPAudio;
  var MODS = COURSE.modules, PASS = CFG.PASS_MARK || 8, QLEN = CFG.QUIZ_LENGTH || 10;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var main = $('#main'), toastEl = $('#toast');
  var KEY = 'chinesePuzzle.v1';
  var S = { unlocked: 0, best: {}, attempts: {}, read: {}, page: {}, missed: {}, passed: {}, sound: true, welcomed: false, vis: {}, heard: {} };
  var quiz = null, lastResult = null, deferredInstall = null, onHome = false;

  /* ---------- helpers ---------- */
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function load() { try { var j = JSON.parse(localStorage.getItem(KEY) || 'null'); if (j) Object.keys(S).forEach(function (k) { if (j[k] !== undefined) S[k] = j[k]; }); } catch (e) {} }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }
  function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  var toastT;
  function toast(msg, ms) { toastEl.textContent = msg; toastEl.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(function () { toastEl.classList.remove('show'); }, ms || 3200); }
  /* Module 0 (sounds and tones) is compulsory until it is passed: pages open in order, the tone page needs all five tones heard, and the quiz stays shut until then. */
  function gated(id) { return id === 0 && !S.passed[0]; }
  function toneCount() { return TONE_EX.filter(function (e) { return S.heard[e[0]]; }).length; }
  function tonesDone() { return toneCount() === TONE_EX.length; }
  function allowedIdx(id, pages) {
    if (!gated(id)) return pages.length;
    var vis = S.vis[id] || {}, a = 0;
    for (var i = 0; i < pages.length; i++) {
      if ((vis[i] || i === 0) && (!pages[i].gate || pages[i].gate())) a = i + 1; else break;
    }
    return a;
  }
  function gateOK(id) { return allowedIdx(id, pagesOf(MODS[id])) >= pagesOf(MODS[id]).length; }
  function passedCount() { return MODS.filter(function (m) { return S.passed[m.id]; }).length; }

  /* ---------- rich text: tappable pinyin + characters ---------- */
  var TOKEN = /[A-Za-zÀ-ɏ]+(?:[’'][A-Za-zÀ-ɏ]+)*|[一-鿿]+/g;
  function pyBtn(py, hz, label) { return '<button type="button" class="py" data-py="' + esc(py) + '" data-hz="' + esc(hz || '') + '">' + esc(label || py) + '</button>'; }
  function hzBtn(hz) { return '<button type="button" class="hz" lang="zh-Hans" data-py="" data-hz="' + esc(hz) + '">' + esc(hz) + '</button>'; }
  function rich(text) {
    text = String(text); var out = '', last = 0, m; TOKEN.lastIndex = 0;
    while ((m = TOKEN.exec(text))) {
      out += esc(text.slice(last, m.index)); last = TOKEN.lastIndex;
      var t = m[0];
      if (/[一-鿿]/.test(t)) out += hzBtn(t);
      else if (PY.hasToneMark(t)) {
        var look = /^\s*[(（]\s*([一-鿿]+)/.exec(text.slice(last));
        out += pyBtn(t, look ? look[1] : '');
      } else out += esc(t);
    }
    return out + esc(text.slice(last));
  }
  function plainOrRich(text, on) { return on ? rich(text) : esc(text); }
  /* the same highlighting as rich(), but plain spans: safe to put inside another button (an answer option) */
  function richInline(text) { return rich(text).replace(/<button type="button" class="(py|hz)"/g, '<span class="$1"').replace(/<\/button>/g, '</span>'); }

  /* ---------- blocks ---------- */
  function table(rows) {
    var head = rows[0], body = rows.slice(1);
    var hasCtx = head.some(function (h) { return /^(characters|english)$/i.test(h); });
    var pyCols = [], hzCol = -1;
    head.forEach(function (h, i) { if (/^pinyin$/i.test(h) && hasCtx) pyCols.push(i); if (/^characters$/i.test(h)) hzCol = i; });
    var h = '<div class="tablewrap" tabindex="0" role="region" aria-label="Table"><table><thead><tr>' + head.map(function (c) { return '<th scope="col">' + esc(c) + '</th>'; }).join('') + '</tr></thead><tbody>';
    body.forEach(function (r) {
      h += '<tr>' + r.map(function (c, i) {
        var inner;
        if (!c) inner = '';
        else if (pyCols.indexOf(i) >= 0) inner = pyBtn(c, hzCol >= 0 ? r[hzCol] : '');
        else if (i === hzCol) inner = hzBtn(c);
        else inner = rich(c);
        return '<td>' + inner + '</td>';
      }).join('') + '</tr>';
    });
    return h + '</tbody></table></div>';
  }
  function blocks(list) {
    return list.map(function (b) {
      if (b.p !== undefined) return '<p>' + rich(b.p) + '</p>';
      if (b.ul) return '<ul>' + b.ul.map(function (x) { return '<li>' + rich(x) + '</li>'; }).join('') + '</ul>';
      if (b.note !== undefined) return '<div class="card note">' + rich(b.note) + '</div>';
      if (b.table) return table(b.table);
      if (b.h) return '<h3>' + esc(b.h) + '</h3>';
      if (b.tones) return toneRows() + '<p class="tone-prog" id="toneProg" role="status">' + toneProgText() + '</p>';
      return '';
    }).join('');
  }
  function pagesOf(m) {
    var intro = [];
    m.intro.forEach(function (x) { intro.push(typeof x === 'string' ? { p: x } : { ul: x.ul }); });
    if (m.objectives.length) { intro.push({ h: 'What you will learn' }); intro.push({ ul: m.objectives }); }
    if (m.id === 0 && gated(0)) intro.push({ note: 'This module is compulsory. Every Mandarin word you will meet is built on these sounds and tones, so the lessons open one after another and the quiz opens when you have finished them all.' });
    var pages = m.pages.slice();
    if (m.id === 0) {
      var at = 0; pages.forEach(function (pg, i) { if (/^Lesson 0\.2/.test(pg.title)) at = i + 1; });
      pages.splice(at, 0, { title: 'Hear the four tones', kind: 'tones', blocks: [{ p: 'Same sound, different pitch shape. Each tone has its own line below. Press Hear on every line' + (gated(0) ? ' to continue: all five tones must be heard before the next lesson opens.' : '.') }, { tones: true }], gate: function () { return tonesDone(); } });
    }
    return [{ title: 'Introduction (optional)', kind: 'overview', blocks: intro }].concat(pages);
  }

  /* ---------- views ---------- */
  var NAME = 'Know your Chinese';
  function setTitle(t) { $('#barTitle').textContent = t; document.title = t === NAME ? NAME + ' · 你懂中文吗' : t + ' · ' + NAME; AU.bedMode(/^Quiz/.test(t) ? 'quiz' : 'lesson'); }
  function show(html, focus, keepAudio) {
    if (window.CPAccess) CPAccess.cancel();
    if (!keepAudio) AU.stopAll();
    var hs = location.hash; main.classList.toggle('wide', hs === '' || hs === '#' || hs === '#/' || hs === '#/play' || hs === '#/badges');   // home, practice hub and badges use the full desktop width
    main.innerHTML = html;
    /* every view gets one level-1 heading, so screen-reader heading lists always start in the same place */
    if (!main.querySelector('h1')) main.insertAdjacentHTML('afterbegin', '<h1 class="sr">' + esc($('#barTitle').textContent) + '</h1>');
    window.scrollTo(0, 0);
    if (focus !== false) {          // move focus to the new view's heading so a screen reader starts reading it
      var t = main.querySelector('[data-focus]') || main.querySelector('h1:not(.sr)') || main.querySelector('h2') || main.querySelector('h1');
      try { if (t) { t.setAttribute('tabindex', '-1'); t.focus({ preventScroll: true }); } else main.focus({ preventScroll: true }); } catch (e) {}
    }
  }

  /* one div per tone, one per line; each tone has its own Hear and How-to-say buttons, each in its own div */
  var TONE_EX = [['mā', '妈', 1], ['má', '麻', 2], ['mǎ', '马', 3], ['mà', '骂', 4], ['ma', '吗', 5]];
  function toneProgText() { var n = toneCount(); return n === TONE_EX.length ? 'You have heard all five tones. You can continue.' : 'Tones heard: ' + n + ' of ' + TONE_EX.length + '.'; }
  function toneRows() {
    return '<div class="toneset">' + TONE_EX.map(function (e) {
      var t = PY.TONES[e[2]];
      return '<div class="tone-line">' +
        '<div class="tone-info"><div class="tone-shape">' + PY.contourSVG(e[2], 90) + '</div>' +
        '<div class="tone-name"><div class="ex">' + e[0] + ' <span lang="zh-Hans">' + e[1] + '</span></div><div class="nm">' + t.name + ' · ' + t.shape.toLowerCase() + '</div></div></div>' +
        '<div class="line"><button type="button" class="btn sm tone-hear" data-py="' + e[0] + '" data-hz="' + e[1] + '">🔊 Hear ' + e[0] + '</button></div>' +
        '<div class="line"><button type="button" class="btn ghost sm tone-glide" data-tone="' + e[2] + '" aria-label="Hear the pitch of ' + e[0] + ', ' + t.name + '">〰 Hear the pitch</button></div>' +
        '<div class="line"><button type="button" class="btn ghost sm tone-how" data-py="' + e[0] + '" data-hz="' + e[1] + '">How to say it</button></div>' +
        '</div>';
    }).join('') + '</div>';
  }
  var PHOTO_DESC = 'A man in a black suit, white shirt and dark tie stands in a bright, modern grey hall. He holds a tall silver flagpole in one hand. On it flies the red flag of the People’s Republic of China, with one large yellow star and four smaller yellow stars in the top corner. A leafy green plant in a white square planter stands behind him.';
  var REASONS = [
    ['Mandarin has more native speakers than any other language.', 'It is also the second most spoken language in the world when second-language speakers are counted, after English.', 'Ethnologue, most spoken languages'],
    ['Chinese is one of the six official languages of the United Nations.', 'The others are Arabic, English, French, Russian and Spanish.', 'United Nations'],
    ['China has been Africa’s largest trading partner since 2009.', 'It overtook the United States that year, so Mandarin opens real doors in trade, study and work across Africa.', 'Brookings Institution; China Daily'],
    ['Chinese writing is more than 3,000 years old.', 'The earliest known Chinese characters are carved on oracle bones from the Shang dynasty, and UNESCO lists Chinese calligraphy as Intangible Cultural Heritage.', 'Shang-dynasty oracle-bone inscriptions; UNESCO'],
    ['Mandarin is a tonal language, so learning it trains your ear.', 'The same syllable, such as ma, can mean mother, hemp, horse or scold, depending on the tone. You will hear and see all four tones on this page.', 'Standard Mandarin phonology']
  ];
  function markWelcomed() { if (!S.welcomed) { S.welcomed = true; save(); } }
  function home() {
    quiz = null; onHome = true; setTitle(NAME);
    var done = passedCount(), pct = Math.round(done / MODS.length * 100), started = done > 0 || S.unlocked > 0 || Object.keys(S.attempts).length > 0;
    var first = !S.welcomed, resume = started ? Math.min(S.unlocked, MODS.length - 1) : 0;
    /* line 1: the welcome address */
    var h = '<h1 class="addr"><span class="a1">' + (first ? 'Welcome,' : 'Welcome back,') + '</span> <span class="a2">learner!</span> <span class="a3" lang="zh-Hans">' + (first ? '欢迎' : '欢迎回来') + '</span></h1><div class="addr-bar" aria-hidden="true"></div>';
    h += '<div class="top2"><section class="hero"><p class="zh" lang="zh-Hans">你懂中文吗</p><h2>' + NAME + '</h2>' +
      '<p class="zhpy">' + pyBtn('Nǐ dǒng Zhōngwén ma?', '你懂中文吗') + '</p>' +
      '<div class="meter"><div class="track" role="progressbar" aria-valuemin="0" aria-valuemax="' + MODS.length + '" aria-valuenow="' + done + '" aria-label="Modules passed"><div class="fill" style="width:' + pct + '%"></div></div><span>' + done + ' of ' + MODS.length + ' passed</span></div></section>';
    if (window.CPGame) h += CPGame.homeHTML();
    h += '</div>';
    if (first) {
      /* first visit only: the full welcome. It never comes back once the learner has moved on. */
      h += '<div class="welcome-grid"><figure class="photo"><img src="img/welcome.jpeg" width="1024" height="1024" alt="' + esc(PHOTO_DESC) + '" decoding="async"><figcaption><b>In the picture:</b> ' + esc(PHOTO_DESC) + '</figcaption></figure>';
      h += '<section class="welcome" aria-labelledby="wlcm"><h2 id="wlcm">Before you begin</h2>' +
        '<p class="zhpy">' + pyBtn('Huānyíng', '欢迎') + ' means “welcome” in Mandarin.</p>' +
        '<p>We are glad you are here. Over the coming modules you will learn the Chinese language, explore Chinese culture and discover everyday Chinese lifestyles, one small step at a time. You do not need any earlier knowledge. Read a page, tap any underlined pinyin or character to hear it, and then test yourself with a short quiz.</p>' +
        '<p>Why start? Here are five reasons you can check for yourself:</p>' +
        '<ol class="reasons">' + REASONS.map(function (r) { return '<li><div class="r-main"><b>' + esc(r[0]) + '</b></div><div class="r-more">' + esc(r[1]) + '</div><div class="r-src">Source: ' + esc(r[2]) + '</div></li>'; }).join('') + '</ol>' +
        '<p>Every journey of a thousand miles begins with one step. <span class="py-line">' + pyBtn('Qiān lǐ zhī xíng, shǐ yú zú xià', '千里之行，始于足下') + '</span> So take that step: the first module teaches you the sounds and tones that everything else is built on, and it is compulsory.</p>' +
        '<div class="line"><button type="button" class="btn red cta" data-act="start" data-mod="0">Start the first lesson</button></div>' +
        '<div class="line"><button type="button" class="btn ghost sm" data-act="skipwelcome">Skip the welcome and show me the modules</button></div>' +
        '<p class="fine">First lesson: ' + esc(MODS[0].title) + '. Score ' + PASS + ' out of ' + QLEN + ' on each quiz to open the next module.</p></section></div>';
    } else {
      h += '<div class="line"><button type="button" class="btn red cta" data-act="start" data-mod="' + resume + '">Continue learning</button></div>';
    }
    h += '<h2 class="modhead">All modules</h2><ol class="grid">' + MODS.map(function (m) {
      var locked = m.id > S.unlocked, passed = !!S.passed[m.id], b = S.best[m.id];
      var sub = locked ? 'Locked' : passed ? 'Passed · best ' + b + '/' + QLEN : (S.attempts[m.id] ? 'Best ' + b + '/' + QLEN + ' · try again' : (m.id === 0 ? 'Compulsory · ready to start' : 'Ready to start'));
      var right = passed ? '<span class="seal" aria-hidden="true" lang="zh-Hans">通过<small>' + b + '/' + QLEN + '</small></span>' :
        locked ? '<svg class="lock" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>' : '';
      return '<li><button type="button" class="tile ' + (locked ? 'locked' : 'open') + '" data-mod="' + m.id + '" aria-label="Module ' + m.id + ': ' + esc(m.title) + '. ' + sub + '"' + '>' +
        '<span class="num">' + m.id + '</span><span style="flex:1"><span class="t">' + esc(m.title) + '</span><br><span class="s">' + sub + '</span></span>' + right + '</button></li>';
    }).join('') + '</ol>';
    h += '<div class="foot">' + (window.CPGame ? CPGame.footHTML() : '') + '<div class="line"><button type="button" class="btn ghost sm" data-act="keys">Keyboard shortcuts</button></div><div class="line"><button class="btn ghost sm" id="btnInstall" hidden>Install app</button></div><div class="line"><button class="btn ghost sm" id="btnReset">Reset progress</button></div>' +
      '<footer class="credit-foot"><p>Produced by AwesomeKam of the AwesomePlanet</p></footer></div>';
    show(h);
    if (deferredInstall) $('#btnInstall').hidden = false;
  }

  function reader(id, idx) {
    var m = MODS[id]; quiz = null;
    var pages = pagesOf(m), total = pages.length + 1;          // + finish page
    var want = idx;
    idx = Math.max(0, Math.min(idx, total - 1, allowedIdx(id, pages)));
    if (idx !== want) { try { history.replaceState(null, '', '#/m/' + id + '/' + idx); } catch (e) {} }
    if (gated(id)) { S.vis[id] = S.vis[id] || {}; S.vis[id][idx] = true; }
    S.page[id] = idx; var isFinish = idx === total - 1;
    if (isFinish) S.read[id] = true; save();
    setTitle('Module ' + id + ': ' + m.title);
    var crumb = '<div class="crumb" aria-hidden="true">' + Array.apply(null, Array(total)).map(function (_, i) { return '<i class="' + (i < idx ? 'done' : i === idx ? 'now' : '') + '"></i>'; }).join('') + '</div>';
    var h = crumb;
    if (!isFinish) {
      var p = pages[idx];
      h += '<div class="pagehead"><p class="kicker">' + (idx === 0 ? esc(m.tag) : 'Module ' + id + ' · page ' + (idx + 1) + ' of ' + total) + '</p><h2>' + (idx === 0 ? esc(m.title) : esc(p.title)) + '</h2></div>';
      h += '<div class="content">' + blocks(p.blocks) + '</div>';
      if (idx === 0) h += '<p class="fine">This introduction is optional. You can skip it and go straight to the first lesson.</p><p><button class="btn ghost" data-act="skipintro">Skip the introduction</button></p>';
      h += '<p class="hint"><span aria-hidden="true">👆</span> Tap any underlined pinyin or character to hear it and see how its tone sounds.</p><p><button type="button" class="btn ghost sm" data-act="readpage">🔊 Read this page aloud</button></p>';
      if (idx === 0 && S.read[id] && !gated(id)) h += '<p><button class="btn ghost sm" data-act="quiz">I know this. Go to the quiz</button></p>';
    } else {
      var tries = S.attempts[id] || 0;
      h += '<div class="card finish"><div class="big" lang="zh-Hans">学完了</div><h2>You have finished Module ' + id + '</h2>' +
        '<p>' + (tries ? 'Welcome back. This quiz mixes in questions you missed last time.' : 'The quiz starts when you tap the button.') + '</p>' +
        '<ul class="rules"><li>' + QLEN + ' questions</li><li>Pass mark ' + PASS + '/' + QLEN + '</li><li>Below ' + PASS + ' repeats this module</li></ul>' +
        '<button class="btn red" data-act="quiz">Start quiz</button></div>';
    }
    h += '<nav class="nav" aria-label="Lesson navigation"><div class="nav-in">' +
      '<div class="line">' + (idx > 0 ? '<button class="btn ghost" data-act="prev">Back</button>' : '<button class="btn ghost" data-act="home">All modules</button>') + '</div>' +
      (isFinish ? '' : '<div class="line"><button class="btn" id="btnNextPage" data-act="next"' + ((pages[idx].gate && !pages[idx].gate()) ? ' disabled' : '') + '>' + (idx === total - 2 ? 'Finish module' : 'Next') + '</button></div>') + '</div></nav>';
    show(h);
    if (window.CPAccess) CPAccess.on('page');
  }

  /* ---------- quiz ---------- */
  function buildQuiz(id) {
    var m = MODS[id], n = S.attempts[id] || 0, pool;
    if (n === 0) pool = shuffle(m.questions.filter(function (q) { return q.s === 'quick'; }));
    else {
      var miss = shuffle(m.questions.filter(function (q) { return (S.missed[id] || []).indexOf(q.id) >= 0; })).slice(0, Math.floor(QLEN / 2));
      var rest = shuffle(m.questions.filter(function (q) { return miss.indexOf(q) < 0; }));
      pool = shuffle(miss.concat(rest).slice(0, QLEN));
    }
    pool = pool.slice(0, QLEN);
    if (window.CPGame) pool = CPGame.mixNew(id, pool, QLEN);
    return { id: id, i: 0, score: 0, answered: false, res: [], qs: pool.map(function (q) { var order = shuffle(q.o.map(function (_, i) { return i; })); return { q: q, order: order, right: order.indexOf(q.a) }; }) };
  }
  function startQuiz(id) {
    quiz = buildQuiz(id); location.hash = '#/q/' + id; renderQ(); AU.play('tag');
  }
  function renderQ() {
    var Q = quiz, cur = Q.qs[Q.i], q = cur.q, ans = Q.answered, picked = Q.picked;
    setTitle('Quiz · Module ' + Q.id);
    var h = '<div class="qtop"><span>Question ' + (Q.i + 1) + ' of ' + Q.qs.length + '</span><span>Score ' + Q.score + ' · pass at ' + PASS + '</span></div><div class="dots" aria-hidden="true">' +
      Q.qs.map(function (_, i) { return '<i class="' + (i < Q.res.length ? (Q.res[i] ? 'ok' : 'no') : i === Q.i ? 'now' : '') + '"></i>'; }).join('') + '</div>';
    h += '<h2 class="qtext" id="qt">' + plainOrRich(q.q, ans) + '</h2>' + (q.audio ? '<p><button type="button" class="btn ghost sm" data-g="hear">🔊 Hear it again</button>' + (cur.revealed ? ' <span class="reveal">Audio is not available here. The word is: <b lang="zh-Hans">' + esc(q.audio.hz || q.audio.py) + '</b> ' + (q.audio.hz ? esc(q.audio.py) : '') + '</span>' : '') + '</p>' : '') + '<ul class="opts" role="group" aria-labelledby="qt">';
    cur.order.forEach(function (oi, pos) {
      var cls = 'opt' + (ans ? (pos === cur.right ? ' right' : pos === picked ? ' wrong' : '') : '');
      h += '<li><button type="button" class="' + cls + '" data-pos="' + pos + '"' + (ans ? ' disabled' : '') + '><span class="k">' + 'ABCD'[pos] + '</span><span>' + (ans ? richInline(q.o[oi]) : esc(q.o[oi])) + '</span></button></li>';
    });
    h += '</ul>';
    if (ans) {
      var ok = picked === cur.right, correctTxt = q.o[q.a];
      h += '<div class="fb ' + (ok ? 'ok' : 'no') + '" role="status"><b>' + (ok ? 'Correct!' : 'Not quite.') + '</b>' +
        (ok ? '' : '<div>Answer: ' + rich(correctTxt) + '</div>') + (q.e ? '<div>' + rich(q.e) + '</div>' : '') +
        (!ok && AU.canAsk() ? '<div><button class="btn ghost sm" data-act="why" style="margin-top:.6rem">Ask the tutor why</button></div>' : '') +
        '<div class="tutor" id="tutor"></div></div>' +
        '<button class="btn" id="btnNext" data-act="qnext" style="width:100%">' + (Q.i === Q.qs.length - 1 ? 'See my result' : 'Next question') + '</button><p class="hint">Keyboard: press N for the next question.</p>';
    } else h += '<p class="hint">Pick one answer. You can also press A, B, C or D' + (q.audio ? ', or R to hear it again' : '') + '.</p><p><button type="button" class="btn ghost sm" data-act="readq">🔊 Read the question and answers aloud</button></p>';
    show(h, false, true);
    if (ans) { var fbE = $('.fb'); if (fbE) { fbE.setAttribute('tabindex', '-1'); fbE.focus({ preventScroll: true }); try { fbE.scrollIntoView({ block: 'nearest' }); } catch (e) {} } }     // the screen reader reads the verdict and explanation; Tab reaches Next
    else {
      var qh = $('#qt'); if (qh) { qh.setAttribute('tabindex', '-1'); qh.focus({ preventScroll: true }); }
      if (q.audio && !cur.played) { cur.played = true; setTimeout(function () { if (quiz === Q && Q.qs[Q.i] === cur) CPGame.click({ dataset: { g: 'hear' } }); }, 250); }
    }
    if (window.CPAccess) CPAccess.on(ans ? 'answer' : 'question', { audio: !!q.audio });
  }
  function answer(pos) {
    var Q = quiz; if (!Q || Q.answered) return;
    var cur = Q.qs[Q.i], ok = pos === cur.right;
    Q.answered = true; Q.picked = pos; Q.res.push(ok); if (ok) Q.score++;
    Q.log = Q.log || []; Q.log.push({ q: cur.q, ok: ok });
    if (window.CPGame) CPGame.onAnswer(Q.id, cur.q, ok);
    AU.play(ok ? 'clap' : 'damage');
    renderQ();
  }
  function nextQ() {
    var Q = quiz; if (!Q) return;
    if (Q.i < Q.qs.length - 1) { Q.i++; Q.answered = false; Q.picked = null; renderQ(); } else finishQuiz();
  }
  function finishQuiz() {
    var Q = quiz, id = Q.id, pass = Q.score >= PASS, last = id === MODS.length - 1;
    S.attempts[id] = (S.attempts[id] || 0) + 1;
    S.best[id] = Math.max(S.best[id] || 0, Q.score);
    S.missed[id] = Q.log.filter(function (x) { return !x.ok; }).map(function (x) { return x.q.id; });
    if (pass) { S.passed[id] = true; S.unlocked = Math.max(S.unlocked, Math.min(id + 1, MODS.length - 1)); }
    else { S.read[id] = false; }
    save();
    if (window.CPGame) CPGame.onQuiz({ id: id, score: Q.score, len: Q.qs.length, pass: pass });
    lastResult = { id: id, score: Q.score, pass: pass, last: last, missed: Q.log.filter(function (x) { return !x.ok; }).map(function (x) { return x.q; }) };
    quiz = null; location.hash = '#/r/' + id;
  }
  function result() {
    var R = lastResult; if (!R) return route('#/');
    setTitle('Result · Module ' + R.id);
    var next = MODS[R.id + 1];
    var h = '<h1 class="sr" data-focus>Quiz result for Module ' + R.id + ': you scored ' + R.score + ' out of ' + QLEN + '. ' + (R.pass ? 'Passed.' : 'Not passed yet.') + '</h1><div class="result ' + (R.pass ? 'pass' : 'fail') + '"><p class="kicker" style="color:var(--soft);margin:0">Module ' + R.id + ' · ' + esc(MODS[R.id].title) + '</p>' +
      '<div class="score" aria-hidden="true">' + R.score + '<span>/' + QLEN + '</span></div>' + (window.CPGame ? CPGame.resultHTML() : '');
    if (R.pass) {
      h += '<div class="sealrow"><span class="seal big" lang="zh-Hans" aria-hidden="true">通过<small>passed</small></span></div>' +
        (R.last ? '<h2>You finished the whole course!</h2><p style="margin-inline:auto">Every module is passed. Review any module whenever you like.</p>' :
          '<h2>Module ' + (R.id + 1) + ' is open</h2><p style="margin-inline:auto">' + esc(next.title) + ' is unlocked.</p>');
    } else {
      h += '<h2>Not yet. You need ' + PASS + ' out of ' + QLEN + '.</h2><p style="margin-inline:auto">Read Module ' + R.id + ' again, then retake the quiz. Missed questions come back so you can fix them.</p>';
    }
    if (R.missed.length) {
      h += '<div class="review"><h3>' + (R.pass ? 'Questions to revisit' : 'What you missed') + '</h3>' + R.missed.map(function (q) {
        return '<div class="card"><p class="q">' + rich(q.q) + '</p><p class="a">' + rich(q.o[q.a]) + '</p></div>';
      }).join('') + '</div>';
    }
    h += '<div class="actions">' +
      (R.pass ? (R.last ? '' : '<div class="line"><button class="btn red" data-act="opennext" style="width:100%">Open Module ' + (R.id + 1) + '</button></div>')
              : '<div class="line"><button class="btn red" data-act="repeat" style="width:100%">Repeat Module ' + R.id + '</button></div>') +
      '<div class="line"><button class="btn ghost" data-act="home">All modules</button></div></div></div>';
    show(h);
    if (window.CPAccess) CPAccess.on('result');
    AU.play(R.pass ? 'clap' : 'sad');
    if (R.pass) confetti();
    if (window.CPGame) CPGame.flushBadges();
  }
  function confetti() {
    if ((window.matchMedia && matchMedia('(prefers-reduced-motion:reduce)').matches) || document.documentElement.getAttribute('data-motion') === 'reduce') return;
    var box = document.createElement('div'); box.className = 'confetti'; box.setAttribute('aria-hidden', 'true');
    var cols = ['#c23b2e', '#b8862a', '#1e6a59', '#e8c15a', '#f4faf6'];
    for (var i = 0; i < 46; i++) {
      var p = document.createElement('i');
      p.style.left = Math.random() * 100 + '%'; p.style.background = cols[i % cols.length];
      p.style.animationDuration = (2 + Math.random() * 2.2) + 's'; p.style.animationDelay = (Math.random() * .6) + 's';
      box.appendChild(p);
    }
    document.body.appendChild(box); setTimeout(function () { box.remove(); }, 5200);
  }

  /* ---------- tone describer sheet ---------- */
  var sheetWrap = $('#sheetWrap'), sheetBody = $('#sheetBody'), opener = null;
  function setInert(on) { ['#bar', '#main', '.nav'].forEach(function (q) { var el = $(q); if (el) { if (on) el.setAttribute('inert', ''); else el.removeAttribute('inert'); } }); }
  function openSheet(html) {
    if (sheetWrap.hidden) opener = document.activeElement; sheetBody.innerHTML = html; sheetWrap.hidden = false; setInert(true); $('#sheetClose').focus();   // the page behind cannot be reached while the dialog is open
  }
  function closeSheet() { sheetWrap.hidden = true; setInert(false); sheetBody.innerHTML = ''; AU.stopAll(); if (opener && opener.focus) try { opener.focus(); } catch (e) {} }
  function describeText(a) {
    return a.syllables.map(function (s) { return s.text + '. ' + PY.TONES[s.tone].say; }).join(' ') + ' ' + a.notes.join(' ');
  }
  function openTone(py, hz) {
    var a = py ? PY.analyze(py) : { syllables: [], notes: [] };
    var h = '<h2 id="sheetTitle">' + esc(py || hz) + '</h2><p class="sub">' + (py && hz ? '<span lang="zh-Hans">' + esc(hz) + '</span>' : (py ? '' : 'Chinese characters')) + '</p>';
    a.syllables.forEach(function (s) {
      var t = PY.TONES[s.tone];
      h += '<div class="syl"><div><div class="w">' + esc(s.text) + '</div><div class="tn">' + t.name + ' ' + (s.tone < 5 ? t.mark : '') + '</div></div><div>' + PY.contourSVG(s.tone, 90) + '</div>' +
        '<p class="how"><b>' + t.shape + '.</b> ' + t.how + '</p></div>';
    });
    a.notes.forEach(function (n) { h += '<div class="sandhi">' + esc(n) + '</div>'; });
    h += '<div class="row"><div class="line"><button class="btn sm" id="shListen">🔊 Listen</button></div>' +
      (a.syllables.length ? '<div class="line"><button class="btn ghost sm" id="shPitch">〰 Hear the pitch shapes</button></div>' : '') + (a.syllables.length ? '<div class="line"><button class="btn ghost sm" id="shDescribe">Read the tone description aloud</button></div>' : '') +
      (AU.canAsk() ? '<div class="line"><button class="btn ghost sm" id="shAsk">Ask the tutor</button></div>' : '') + '</div><div class="tutor" id="shTutor"></div>';
    openSheet(h);
    $('#shListen').onclick = function () {
      AU.speak(py, hz).then(function (v) { if (v === 'none') toast('No Chinese voice on this device. Connect to the internet for AI audio.'); });
    };
    var pb = $('#shPitch'); if (pb) pb.onclick = function () { var r = AU.glide(a.syllables.map(function (x) { return x.tone; }), { vibrate: pref('vib') !== 0 }); if (!r.played) toast('Sound is paused. Press Play at the top of the page to hear it.'); };
    var d = $('#shDescribe'); if (d) d.onclick = function () { if (!AU.say(describeText(a))) toast('Sound is off or this device cannot read text aloud.'); };
    var k = $('#shAsk'); if (k) k.onclick = function () {
      var box = $('#shTutor'); box.textContent = 'Thinking…';
      AU.ask('Help me pronounce "' + (py || hz) + '"' + (hz && py ? ' (' + hz + ')' : '') + '. Describe each syllable\'s tone and how my voice should move, then give one memory tip.')
        .then(function (t) { box.textContent = t; }, function () { box.textContent = 'The tutor is not reachable right now. The tone description above works offline.'; });
    };
  }
  function openToneGuide() {
    openSheet('<h2 id="sheetTitle">Four tones and a neutral</h2><p class="sub">Same sound, different pitch shape. Each tone has its own line: hear it, or see how to say it.</p>' + toneRows());
  }

  /* ---------- routing ---------- */
  function route(h) {
    var wasHome = onHome; onHome = false; routeInner(h);
    if (window.CPGame) CPGame.hud();
    if (wasHome && !onHome) markWelcomed();      // the welcome is shown once: it is retired when the learner leaves the home page
  }
  function routeInner(h) {
    h = h || location.hash || '#/'; var p = h.split('/'); // ['#','m','5','2']
    var id = +p[2];
    if (window.CPGame && CPGame.route(p)) return;
    if (p[1] === 'm' && MODS[id] && id <= S.unlocked) return reader(id, p[3] !== undefined ? +p[3] : (S.page[id] || 0));
    if (p[1] === 'q' && MODS[id] && id <= S.unlocked) { if (quiz && quiz.id === id) return renderQ(); if (S.read[id] && gateOK(id)) return startQuiz(id); return go('#/m/' + id); }
    if (p[1] === 'r') return result();
    return home();
  }
  function go(h) { if (location.hash === h) route(h); else location.hash = h; }
  window.addEventListener('hashchange', function () { route(); });

  function pref(k) { return window.CPGame && CPGame.pref ? CPGame.pref(k) : 0; }
  /* ---------- "Where am I?", shortcut commands and the shortcut list ---------- */
  function whereText() {
    var hs = location.hash, m, t = '', up = Math.min(S.unlocked, MODS.length - 1);
    if (quiz) t = 'Quiz for Module ' + quiz.id + ', ' + MODS[quiz.id].title + '. Question ' + (quiz.i + 1) + ' of ' + quiz.qs.length + '. ' + quiz.score + ' correct so far.';
    else if ((m = hs.match(/^#\/m\/(\d+)/))) {
      var id = +m[1], ps = pagesOf(MODS[id]), ix = Math.min(S.page[id] || 0, ps.length);
      t = 'Module ' + id + ', ' + MODS[id].title + '. ' + (ix >= ps.length ? 'Last page, ready for the quiz.' : 'Page ' + (ix + 1) + ' of ' + (ps.length + 1) + ': ' + ps[ix].title + '.');
    } else if (hs === '' || hs === '#' || hs === '#/') t = 'Home page. ' + passedCount() + ' of ' + MODS.length + ' modules passed.' + (passedCount() < MODS.length ? ' Next up: Module ' + up + ', ' + MODS[up].title + '.' : '');
    else t = 'You are on ' + $('#barTitle').textContent + '.';
    if (window.CPGame && CPGame.statusText) t += ' ' + CPGame.statusText();
    return t + ' Sound is ' + (S.sound ? 'playing' : 'paused') + '.';
  }
  function cmd(n) {
    var up = Math.min(S.unlocked, MODS.length - 1), el;
    if (n === 'home') go('#/');
    else if (n === 'continue') go('#/m/' + up + '/' + (S.page[up] || 0));
    else if (n === 'practice') go('#/play');
    else if (n === 'badges') go('#/badges');
    else if (n === 'options') { if (window.CPGame) CPGame.click({ dataset: { g: 'settings' } }); }
    else if (n === 'tones') openToneGuide();
    else if (n === 'keys') openKeys();
    else if (n === 'pause') sb.click();
    else if (n === 'listen') { if (window.CPAccess) CPAccess.toggleRead(); }
    else if (n === 'where') { var w = whereText(); toast(w, 10000); if (window.CPAccess) CPAccess.speakIf(w); }
    else if (n === 'next') {
      if (quiz && quiz.answered) return nextQ();
      if (quiz) return toast('Choose an answer first.');
      el = $('#btnNextPage') || $('[data-act="quiz"]');
      if (!el) return toast('There is no next page here.');
      if (el.disabled) return toast('Hear all five tones first. ' + toneProgText());
      el.click();
    } else if (n === 'prev') { el = $('[data-act="prev"]'); if (el) el.click(); else toast('This is the first page.'); }
  }
  function openKeys() {
    var rows = [['H', 'Home: all modules'], ['S', 'Start or continue learning'], ['N', 'Next page, or next question after you answer'], ['V', 'Previous page'], ['L', 'Listen: read this page or question aloud. Press again to stop'], ['W', 'Where am I? Says your page, streak, XP and badges'], ['K', 'Pause or play all sound'], ['P', 'Practice games'], ['G', 'Badges'], ['O', 'Settings'], ['F', 'Four tones guide'], ['A B C D or 1 2 3 4', 'Choose an answer in a quiz'], ['R', 'Hear a listening question again'], ['?', 'Show this list'], ['Esc', 'Close a window']];
    openSheet('<h2 id="sheetTitle">Keyboard shortcuts</h2><p class="sub">Press the key on its own. If your screen reader keeps single letters for itself, hold <kbd>Alt</kbd> and <kbd>Shift</kbd> together with the letter instead, for example <kbd>Alt+Shift+W</kbd>. You can turn single keys off in Settings.</p>' +
      '<div class="tablewrap"><table class="keys"><caption class="sr">Keyboard shortcuts</caption><thead><tr><th scope="col">Key</th><th scope="col">What it does</th></tr></thead><tbody>' +
      rows.map(function (r) { return '<tr><th scope="row"><kbd>' + esc(r[0]) + '</kbd></th><td>' + esc(r[1]) + '</td></tr>'; }).join('') + '</tbody></table></div>');
  }
  /* ---------- events ---------- */
  document.addEventListener('click', function (e) {
    var pc = e.target.closest('[data-coin]'); if (pc && !e.target.closest('button, a')) { if (window.CPGame) CPGame.spin(pc); return; }
    var t = e.target.closest('button, a'); if (!t) return;
    if (t.dataset.g && window.CPGame && CPGame.click(t)) return;
    if (window.CPPractice && CPPractice.click(t, e)) return;
    if (t.classList.contains('py') || t.classList.contains('hz')) { e.preventDefault(); openTone(t.dataset.py, t.dataset.hz); AU.speak(t.dataset.py, t.dataset.hz); return; }
    if (t.classList.contains('tone-glide')) {
      var r = AU.glide([+t.dataset.tone], { vibrate: pref('vib') !== 0 });
      if (!r.played) toast('Sound is paused. Press Play at the top of the page to hear it.');
      var ln = t.closest('.tone-line'), cp = ln && ln.querySelector('.contour .cp'), cd = ln && ln.querySelector('.contour .cd');
      if (cp && cd && document.documentElement.getAttribute('data-motion') !== 'reduce' && !(window.matchMedia && matchMedia('(prefers-reduced-motion:reduce)').matches)) {   // redraw the line in time with the sound
        cp.style.animation = 'none'; cd.style.animation = 'none'; void cp.getBoundingClientRect();
        cp.style.animation = 'draw ' + r.dur + 's linear forwards'; cd.style.animation = 'pop .2s ' + r.dur + 's forwards';
      }
      return;
    }
    if (t.classList.contains('tone-hear')) {
      if (!S.heard[t.dataset.py]) { S.heard[t.dataset.py] = true; save(); }
      var tp = $('#toneProg'), nb = $('#btnNextPage'); if (tp) tp.textContent = toneProgText(); if (nb && tonesDone() && /^#\/m\/0\//.test(location.hash)) nb.disabled = false;
      AU.speak(t.dataset.py, t.dataset.hz).then(function (v) { if (v === 'none') toast('No Chinese voice on this device. Connect to the internet for AI audio.'); else if (v === 'muted') toast('Sound is paused. Press Play at the top of the page to hear it.'); }); return;
    }
    if (t.classList.contains('tone-how')) { openTone(t.dataset.py, t.dataset.hz); return; }
    if (t.dataset.act === 'start') { go('#/m/' + t.dataset.mod + '/' + (S.page[+t.dataset.mod] || 0)); return; }
    if (t.dataset.mod !== undefined) {
      var id = +t.dataset.mod;
      if (id > S.unlocked) toast('Pass Module ' + (id - 1) + ' with ' + PASS + '/' + QLEN + ' to open this one.'); else go('#/m/' + id + '/' + (S.page[id] || 0));
      return;
    }
    var pos = t.classList.contains('opt') ? +t.dataset.pos : -1; if (pos >= 0) return answer(pos);
    var act = t.dataset.act, id2 = quiz ? quiz.id : (/^#\/m\//.test(location.hash) ? +location.hash.split('/')[2] : (lastResult ? lastResult.id : 0));
    if (act === 'next') go('#/m/' + id2 + '/' + ((S.page[id2] || 0) + 1));
    else if (act === 'prev') go('#/m/' + id2 + '/' + ((S.page[id2] || 0) - 1));
    else if (act === 'home') go('#/');
    else if (act === 'readpage' || act === 'readq') { if (window.CPAccess) CPAccess.toggleRead(); }
    else if (act === 'keys') openKeys();
    else if (act === 'skipintro') go('#/m/' + id2 + '/1');
    else if (act === 'skipwelcome') { markWelcomed(); home(); }
    else if (act === 'quiz') { S.read[id2] = true; save(); startQuiz(id2); }
    else if (act === 'qnext') nextQ();
    else if (act === 'opennext') { S.page[lastResult.id + 1] = 0; go('#/m/' + (lastResult.id + 1) + '/0'); }
    else if (act === 'repeat') { S.page[lastResult.id] = 0; S.read[lastResult.id] = false; if (lastResult.id === 0) S.vis[0] = {}; save(); go('#/m/' + lastResult.id + '/0'); }
    else if (act === 'why') {
      var cur = quiz.qs[quiz.i], q = cur.q, box = $('#tutor'); box.textContent = 'Thinking…';
      AU.ask('Quiz question: "' + q.q + '" Options: ' + q.o.join(' | ') + '. Correct answer: "' + q.o[q.a] + '". The student chose "' + q.o[cur.order[quiz.picked]] + '". Explain briefly why the correct answer is right and how to remember it.')
        .then(function (r) { box.textContent = r; }, function () { box.textContent = 'The tutor is not reachable right now.'; });
    }
    else if (t.id === 'btnReset') { if (confirm('Erase all progress and start again from Module 0?')) { S = { unlocked: 0, best: {}, attempts: {}, read: {}, page: {}, missed: {}, passed: {}, sound: S.sound, welcomed: true, vis: {}, heard: {} }; save(); if (window.CPGame) CPGame.reset(); lastResult = null; home(); } }
    else if (t.id === 'btnInstall' && deferredInstall) { deferredInstall.prompt(); deferredInstall = null; t.hidden = true; }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !sheetWrap.hidden) return closeSheet();
    if (e.key === 'Tab' && !sheetWrap.hidden) {          // keep Tab and Shift+Tab inside the open dialog
      var fs = [].slice.call($('#sheet').querySelectorAll('button, input, a[href], select, textarea, [tabindex]:not([tabindex="-1"])')).filter(function (x) { return !x.disabled && x.offsetParent !== null; });
      if (fs.length) {
        var first = fs[0], last = fs[fs.length - 1], inside = $('#sheet').contains(document.activeElement);
        if (e.shiftKey && (document.activeElement === first || !inside)) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && (document.activeElement === last || !inside)) { e.preventDefault(); first.focus(); }
      }
    }
    if (quiz && !quiz.answered && sheetWrap.hidden && !e.metaKey && !e.ctrlKey && !e.altKey) {
      var k = 'abcd1234'.indexOf(e.key.toLowerCase());
      if (k >= 0 && (k % 4) < quiz.qs[quiz.i].order.length) answer(k % 4);
    }
    if (quiz && sheetWrap.hidden && !e.metaKey && !e.ctrlKey && !e.altKey && e.key.toLowerCase() === 'r' && quiz.qs[quiz.i].q.audio && !/^(INPUT|TEXTAREA)$/.test((e.target || {}).tagName || '')) { e.preventDefault(); CPGame.click({ dataset: { g: 'hear' } }); }
  });
  $('#sheetClose').onclick = closeSheet; $('#scrim').onclick = closeSheet;
  $('#btnHome').onclick = function () { go('#/'); };
  $('#btnTones').onclick = openToneGuide;
  var sb = $('#btnSound');
  /* One all-inclusive Pause/Play control: lesson music, effects, Mandarin voices and read-aloud all stop and resume together.
     It shows its state (icon and label), announces it, and also makes a short sound so it can be heard as well as seen. */
  var PAUSE_D = 'M8 5v14M16 5v14', PLAY_D = 'M7 4.5v15l12-7.5z';
  function syncSound() {
    sb.setAttribute('aria-label', S.sound ? 'Pause all sound' : 'Play sound'); sb.title = S.sound ? 'Pause all sound' : 'Play sound'; sb.removeAttribute('aria-pressed');
    var ic = $('#sndIcon'); if (ic) { ic.setAttribute('d', S.sound ? PAUSE_D : PLAY_D); ic.setAttribute('fill', S.sound ? 'none' : 'currentColor'); }
    AU.setSound(S.sound);
  }
  sb.onclick = function () {
    S.sound = !S.sound; save(); syncSound(); AU.cue(S.sound);
    toast(S.sound ? 'Sound playing' : 'All sound paused. Press Play to continue.');
  };
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); deferredInstall = e; var b = $('#btnInstall'); if (b) b.hidden = false; });

  window.CPApp = { cmd: cmd, AU: AU, MODS: MODS, richInline: richInline, unlocked: function () { return S.unlocked; }, clearQuiz: function () { quiz = null; }, S: function () { return S; }, toast: toast, show: show, setTitle: setTitle, rich: rich, esc: esc, openSheet: openSheet, closeSheet: closeSheet, confetti: confetti, go: go, quiz: function () { return quiz; }, rerenderQuiz: function () { if (quiz) renderQ(); } };
  /* ---------- start ---------- */
  load();
  if (!S.welcomed && (passedCount() > 0 || S.unlocked > 0 || Object.keys(S.attempts).length > 0)) { S.welcomed = true; save(); }   // people who already have progress do not need the welcome
  syncSound(); AU.preload();
  function firstGesture() { ['pointerdown', 'keydown', 'touchstart'].forEach(function (n) { document.removeEventListener(n, firstGesture, true); }); AU.startBed(); }
  ['pointerdown', 'keydown', 'touchstart'].forEach(function (n) { document.addEventListener(n, firstGesture, true); });
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) navigator.serviceWorker.register('sw.js').catch(function () {});
  if (window.CPPractice) CPPractice.init(window.CPApp);
  route();
})();
