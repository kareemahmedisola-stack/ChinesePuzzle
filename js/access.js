/* Know your Chinese – listening and keyboard access: read-aloud, one-key shortcuts and "Where am I?". */
(function () {
  'use strict';
  var timer = 0, lastKey = '';
  function AU() { return window.CPAudio; }
  function pref(k) { return window.CPGame && CPGame.pref ? CPGame.pref(k) : 0; }
  function app() { return window.CPApp; }
  function clean(s) { return String(s || '').replace(/\s+/g, ' ').trim(); }

  /* ---------- turn what is on the screen into things to say ---------- */
  function addEn(out, t) { var l = out[out.length - 1]; if (l && !l.zh) l.text += ' ' + t; else out.push({ text: t }); }
  function inline(node, out) {
    [].forEach.call(node.childNodes, function (n) {
      if (n.nodeType === 3) { var t = clean(n.nodeValue); if (t) addEn(out, t); return; }
      if (n.nodeType !== 1) return;
      if (n.getAttribute('aria-hidden') === 'true' || n.classList.contains('sr')) return;
      if (n.classList.contains('py') || n.classList.contains('hz')) {
        var hz = n.getAttribute('data-hz') || '', py = n.getAttribute('data-py') || '';
        if (!py && !hz) py = clean(n.textContent);
        out.push({ zh: true, py: py, hz: hz }); return;
      }
      if (/^(BUTTON|SVG|SCRIPT)$/i.test(n.tagName)) return;
      inline(n, out);
    });
  }
  function endStop(out) { var l = out[out.length - 1]; if (l && !l.zh && !/[.!?:;,]$/.test(l.text)) l.text += '.'; return out; }
  function block(el) { var out = []; inline(el, out); return endStop(out); }
  function row(tr) {
    var out = [];
    [].forEach.call(tr.querySelectorAll('th,td'), function (c) {
      var part = []; inline(c, part); if (!part.length) return;
      var l = part[part.length - 1]; if (!l.zh) l.text += ','; part.forEach(function (x) { out.push(x); });
    });
    return out;
  }
  function pageChunks() {
    var main = document.getElementById('main'), out = [];
    [].forEach.call(main.querySelectorAll('h1:not(.sr),h2,h3,p,li,tr'), function (el) {
      if (el.closest('.toneset,.nav,.hint,.fine,.crumb,.dots,.tutor,.sr,[aria-hidden="true"]')) return;
      if (el.tagName !== 'TR' && el.parentElement && el.parentElement.closest('p,li,tr,h1,h2,h3')) return;
      out = out.concat(el.tagName === 'TR' ? row(el) : block(el));
    });
    return out;
  }
  function questionChunks() {
    var out = [], top = document.querySelector('.qtop span'), qt = document.getElementById('qt');
    if (top) out.push({ text: clean(top.textContent) + '.' });
    if (qt) out = out.concat(block(qt));
    [].forEach.call(document.querySelectorAll('button.opt'), function (b) {
      var k = b.querySelector('.k'), body = b.querySelector('span:not(.k)'), part = [];
      out.push({ text: 'Option ' + (k ? clean(k.textContent) : '') + '.' });
      if (body) { inline(body, part); out = out.concat(endStop(part)); }
    });
    return out;
  }
  function answerChunks() {
    var fb = document.querySelector('.fb'), out = [];
    if (!fb) return out;
    [].forEach.call(fb.children, function (c) {
      if (c.classList.contains('tutor') || c.querySelector('button:not(.py):not(.hz)')) return;
      out = out.concat(block(c));
    });
    return out;
  }
  function resultChunks() {
    var out = [], h = document.querySelector('[data-focus]'), h2 = document.querySelector('main h2');
    if (h) out.push({ text: clean(h.textContent) });
    if (h2) out = out.concat(block(h2));
    return out;
  }
  function viewKind() {
    if (document.querySelector('.fb')) return 'answer';
    if (document.getElementById('qt')) return 'question';
    if (document.querySelector('[data-focus]')) return 'result';
    return 'page';
  }
  function chunksFor(kind) { return kind === 'answer' ? answerChunks() : kind === 'question' ? questionChunks() : kind === 'result' ? resultChunks() : pageChunks(); }

  /* ---------- reading ---------- */
  function say(chunks, manual) {
    var a = AU();
    if (!a.isSoundOn()) { if (manual) app().toast('Sound is paused. Press Play at the top of the page, then try again.'); return false; }
    if (!window.speechSynthesis) { if (manual) app().toast('This device cannot read text aloud. Your screen reader can read the page instead.'); return false; }
    if (!a.read(chunks)) { if (manual) app().toast('There is nothing to read here.'); return false; }
    return true;
  }
  function readView(manual) { return say(chunksFor(viewKind()), manual); }
  function toggleRead() { if (AU().isSpeaking()) { AU().stopAll(); return; } readView(true); }
  function speakIf(text) { if (pref('read')) say([{ text: text }], false); }
  function cancel() { clearTimeout(timer); }
  /* called by the app when a page, question, answer or result appears: reads it only if the learner turned read-aloud on */
  function on(name, d) {
    clearTimeout(timer);
    if (!pref('read')) return;
    var top = document.querySelector('.qtop span'), key = name + '|' + location.hash + '|' + (top ? top.textContent : '');
    if ((name === 'question' || name === 'page') && key === lastKey) return;
    lastKey = key;
    var delay = name === 'page' ? 500 : name === 'question' ? (d && d.audio ? 1800 : 600) : name === 'answer' ? 800 : 1500;
    timer = setTimeout(function () { readView(false); }, delay);
  }

  /* ---------- keyboard: one key, or Alt+Shift+key for screen readers that keep single letters for themselves ---------- */
  var MAP = { h: 'home', s: 'continue', n: 'next', v: 'prev', l: 'listen', w: 'where', k: 'pause', p: 'practice', g: 'badges', o: 'options', f: 'tones' };
  document.addEventListener('keydown', function (e) {
    if (e.defaultPrevented || e.repeat || !app() || !app().cmd) return;
    var tg = e.target, tag = tg && tg.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (tg && tg.isContentEditable)) return;
    var name = null;
    if (e.key === '?' && !e.ctrlKey && !e.altKey && !e.metaKey) name = 'keys';
    else if (e.altKey && e.shiftKey && !e.ctrlKey && !e.metaKey && /^Key[A-Z]$/.test(e.code)) name = MAP[e.code.slice(3).toLowerCase()];
    else if (!e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && pref('keys') !== 0 && /^[a-z]$/i.test(e.key)) name = MAP[e.key.toLowerCase()];
    if (!name) return;
    var sheet = document.getElementById('sheetWrap');
    if (sheet && !sheet.hidden && !/^(keys|where|pause)$/.test(name)) return;       // a window is open: leave the page behind it alone
    e.preventDefault(); app().cmd(name);
  });

  window.CPAccess = { on: on, cancel: cancel, toggleRead: toggleRead, speakIf: speakIf };
})();
