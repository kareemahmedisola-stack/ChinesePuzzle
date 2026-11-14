/* Know your Chinese – listening and keyboard access: read-aloud, one-key shortcuts and "Where am I?". */
(function () {
  'use strict';
  var timer = 0, lastKey = '', ORIG = new WeakMap(), obs = null, MARKS = /[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/i;
  function AU() { return window.CPAudio; }
  function pref(k) { return window.CPGame && CPGame.pref ? CPGame.pref(k) : 0; }
  function app() { return window.CPApp; }
  function clean(s) { return String(s || '').replace(/\s+/g, ' ').trim(); }

  /* ---------- turn what is on the screen into things to say ---------- */
  function addEn(out, t) { var l = out[out.length - 1]; if (l && !l.zh) l.text += ' ' + t; else out.push({ text: t }); }
  function inline(node, out) {
    [].forEach.call(node.childNodes, function (n) {
      if (n.nodeType === 3) { var t = clean(ORIG.get(n) || n.nodeValue); if (t) addEn(out, t); return; }
      if (n.nodeType !== 1) return;
      if (n.getAttribute('aria-hidden') === 'true' || n.classList.contains('sr')) return;
      if (n.classList.contains('py') || n.classList.contains('hz')) {
        var hz = n.getAttribute('data-hz') || '', py = n.getAttribute('data-py') || '';
        if (!py && !hz) py = clean(n.textContent);
        out.push({ zh: true, py: py, hz: hz }); return;
      }
      if (/^(BUTTON|SVG|SCRIPT)$/i.test(n.tagName)) return;
      if (/^zh/i.test(n.getAttribute('lang') || '')) { var z = clean(n.textContent); if (z) out.push({ zh: true, py: '', hz: z }); return; }
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

  /* ---------- label every run of Chinese characters with lang="zh-Hans" ----------
     Screen readers choose the voice from the language label. Plain Chinese text with no label is read by the English voice, which skips it. */
  var HAN_TEST = /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/, HAN_RUN = /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF][\u3000-\u303F\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\uFF00-\uFFEF]*/g;
  function inZh(n) { var el = n.parentNode; while (el && el.nodeType === 1) { var l = el.getAttribute('lang'); if (l) return /^zh/i.test(l); el = el.parentNode; } return false; }
  function tagText(n) {
    var v = n.nodeValue, p = n.parentNode;
    if (!v || !HAN_TEST.test(v) || !p || p.nodeType !== 1 || /^(SCRIPT|STYLE|TEXTAREA|TITLE)$/.test(p.tagName) || inZh(n)) return;
    var re = new RegExp(HAN_RUN.source, 'g'), last = 0, m, frag = document.createDocumentFragment();
    while ((m = re.exec(v))) {
      if (m.index > last) frag.appendChild(document.createTextNode(v.slice(last, m.index)));
      var sp = document.createElement('span'); sp.setAttribute('lang', 'zh-Hans'); sp.textContent = m[0]; frag.appendChild(sp); last = re.lastIndex;
    }
    if (last < v.length) frag.appendChild(document.createTextNode(v.slice(last)));
    p.replaceChild(frag, n);
  }
  function tagTree(root) {
    if (!root) return;
    if (root.nodeType === 3) return tagText(root);
    if (root.nodeType !== 1) return;
    var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null), list = [], n;
    while ((n = w.nextNode())) if (HAN_TEST.test(n.nodeValue)) list.push(n);
    list.forEach(tagText);
  }

  /* ---------- pinyin style: tone marks (mā) or tone numbers (ma1). Numbers suit braille displays and keyboards. ---------- */
  function numbers() { return pref('pystyle') === 1; }
  function convText(n) { var v = n.nodeValue; if (!v || !MARKS.test(v)) return; var p = n.parentNode; if (p && /^(SCRIPT|STYLE|TEXTAREA)$/.test(p.tagName)) return; ORIG.set(n, v); n.nodeValue = window.CPPinyin.numberize(v); }
  function convEl(el) {
    ['aria-label', 'title'].forEach(function (a) {
      var v = el.getAttribute && el.getAttribute(a);
      if (v && MARKS.test(v)) { el.setAttribute('data-o-' + a, v); el.setAttribute(a, window.CPPinyin.numberize(v)); }
    });
  }
  function convTree(root) {
    if (!root) return;
    if (root.nodeType === 3) return convText(root);
    if (root.nodeType !== 1) return;
    convEl(root);
    var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, null), n;
    while ((n = w.nextNode())) { if (n.nodeType === 3) convText(n); else convEl(n); }
  }
  function restore() {
    var w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, null), n;
    while ((n = w.nextNode())) {
      if (n.nodeType === 3) { if (ORIG.has(n)) { var o = ORIG.get(n); if (n.nodeValue === window.CPPinyin.numberize(o)) n.nodeValue = o; ORIG.delete(n); } }
      else ['aria-label', 'title'].forEach(function (a) { var o = n.getAttribute('data-o-' + a); if (o !== null) { n.setAttribute(a, o); n.removeAttribute('data-o-' + a); } });
    }
  }
  function startObs() {
    if (obs || !window.MutationObserver) return;
    obs = new MutationObserver(function (recs) {
      recs.forEach(function (r) {
        if (r.type === 'characterData') { tagText(r.target); if (numbers() && r.target.parentNode) convText(r.target); }
        else if (r.type === 'attributes') { if (numbers()) convEl(r.target); }
        else [].forEach.call(r.addedNodes, function (nd) { tagTree(nd); if (numbers()) convTree(nd); });
      });
      obs.takeRecords();          // our own changes do not need another pass
    });
    obs.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['aria-label', 'title'] });
  }
  function applyStyle() { startObs(); tagTree(document.body); if (numbers()) convTree(document.body); else restore(); if (obs) obs.takeRecords(); }
  applyStyle();

  window.CPAccess = { applyStyle: applyStyle, on: on, cancel: cancel, toggleRead: toggleRead, speakIf: speakIf };
})();
