/* Know your Chinese – background bed, sound effects, Mandarin audio (Gemini TTS with device-voice fallback) and the optional AI tutor. */
(function () {
  'use strict';
  var CFG = window.CP_CONFIG || {};
  var BED_FILE = 'sounds/bed.mp3';
  var FILES = { clap: 'sounds/clap.mp3', sad: 'sounds/sad-tune.mp3', damage: 'sounds/emotional-damage.mp3', tag: 'sounds/QuestionTag.mp3' };
  var els = {}, soundOn = true, voiceEl = null, cache = {}, failures = 0, current = null;

  /* ---------- background bed: gapless loop under the lessons, ducked under effects and voices ---------- */
  var bed = { ctx: null, gain: null, el: null, started: false, gesture: false, mode: 'lesson', fx: false, voice: false };
  function bedLevel() {
    var base = bed.mode === 'quiz' ? (CFG.BED_QUIZ_VOLUME != null ? CFG.BED_QUIZ_VOLUME : 0.05) : (CFG.BED_VOLUME != null ? CFG.BED_VOLUME : 0.15);
    return soundOn ? base * ((bed.fx || bed.voice) ? 0.22 : 1) : 0;
  }
  function applyBed() {
    var v = bedLevel();
    if (bed.gain && bed.ctx) { try { var t = bed.ctx.currentTime; bed.gain.gain.cancelScheduledValues(t); bed.gain.gain.setTargetAtTime(v, t, 0.4); } catch (e) {} }
    if (bed.el) bed.el.volume = Math.max(0, Math.min(1, v));
    if (bed.ctx && bed.ctx.state) {
      if (!soundOn || document.hidden) { try { bed.ctx.suspend(); } catch (e) {} }
      else if (bed.ctx.state === 'suspended') { try { bed.ctx.resume(); } catch (e) {} }
    }
    if (bed.el) { if (!soundOn || document.hidden) bed.el.pause(); else { var p = bed.el.play(); if (p && p.catch) p.catch(function () {}); } }
  }
  function bedFallback() {
    if (bed.el) return;
    bed.el = new Audio(BED_FILE); bed.el.loop = true; bed.el.preload = 'auto'; applyBed();
  }
  function startBed() {
    bed.gesture = true;                                   // browsers only allow sound after a tap or key press
    if (!soundOn || bed.started) { applyBed(); return; }
    bed.started = true;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { bedFallback(); return; }
    try {
      bed.ctx = new AC(); bed.gain = bed.ctx.createGain(); bed.gain.gain.value = 0; bed.gain.connect(bed.ctx.destination);
      fetch(BED_FILE).then(function (r) { if (!r.ok) throw new Error('bed'); return r.arrayBuffer(); })
        .then(function (ab) { return new Promise(function (ok, no) { bed.ctx.decodeAudioData(ab, ok, no); }); })
        .then(function (buf) {
          var src = bed.ctx.createBufferSource(); src.buffer = buf; src.loop = true; src.connect(bed.gain); src.start(0); applyBed();
        })
        .catch(function () { bed.ctx = null; bed.gain = null; bedFallback(); });
      applyBed();
    } catch (e) { bed.ctx = null; bed.gain = null; bedFallback(); }
  }
  function bedMode(m) { if (bed.mode !== m) { bed.mode = m; applyBed(); } }
  document.addEventListener('visibilitychange', applyBed);

  function el(name) {
    if (!els[name]) { var a = new Audio(FILES[name]); a.preload = 'auto'; els[name] = a; }
    return els[name];
  }
  function stopAll() {
    Object.keys(els).forEach(function (k) { try { els[k].pause(); els[k].currentTime = 0; } catch (e) {} });
    if (voiceEl) { try { voiceEl.pause(); } catch (e) {} }
    if (window.speechSynthesis) { try { speechSynthesis.cancel(); } catch (e) {} }
    if (bed.fx || bed.voice) { bed.fx = false; bed.voice = false; applyBed(); }
  }
  function play(name) {
    if (!soundOn) return;
    stopAll();
    try {
      var a = el(name); a.currentTime = 0; bed.fx = true; applyBed();
      a.onended = function () { bed.fx = false; applyBed(); };
      var p = a.play(); if (p && p.catch) p.catch(function () { bed.fx = false; applyBed(); });
    } catch (e) { bed.fx = false; applyBed(); }
  }
  function preload() { Object.keys(FILES).forEach(function (k) { try { el(k).load(); } catch (e) {} }); }

  function duckFor(u) { bed.voice = true; applyBed(); u.onend = u.onerror = function () { bed.voice = false; applyBed(); }; }
  function b64ToBytes(b64) { var bin = atob(b64), n = bin.length, u = new Uint8Array(n); for (var i = 0; i < n; i++) u[i] = bin.charCodeAt(i); return u; }
  function pcmToWav(pcm, rate) {
    var len = pcm.length, buf = new ArrayBuffer(44 + len), v = new DataView(buf);
    function s(o, t) { for (var i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i)); }
    s(0, 'RIFF'); v.setUint32(4, 36 + len, true); s(8, 'WAVE'); s(12, 'fmt '); v.setUint32(16, 16, true);
    v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true);
    v.setUint16(32, 2, true); v.setUint16(34, 16, true); s(36, 'data'); v.setUint32(40, len, true);
    new Uint8Array(buf, 44).set(pcm);
    return new Blob([buf], { type: 'audio/wav' });
  }
  function geminiOn(kind) {
    var on = kind === 'tts' ? CFG.USE_GEMINI_TTS : CFG.USE_GEMINI_TUTOR;
    return !!(on && (CFG.GEMINI_PROXY_URL || userKey()) && navigator.onLine !== false && failures < 3);
  }
  /* The key is never stored in the shipped files: it comes from a proxy, or from the learner's own browser storage. */
  function userKey() { try { return CFG.GEMINI_API_KEY || localStorage.getItem('cp.geminiKey') || ''; } catch (e) { return CFG.GEMINI_API_KEY || ''; } }
  function post(model, body, ms) {
    var ctl = new AbortController(), t = setTimeout(function () { ctl.abort(); }, ms || 15000);
    var headers = { 'Content-Type': 'application/json' };
    if (!CFG.GEMINI_PROXY_URL) headers['x-goog-api-key'] = userKey();
    return fetch((CFG.GEMINI_PROXY_URL || CFG.GEMINI_BASE) + '/models/' + model + ':generateContent', {
      method: 'POST', signal: ctl.signal,
      headers: headers,
      body: JSON.stringify(body)
    }).then(function (r) {
      clearTimeout(t);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (j) { failures = 0; return j; }, function (e) { clearTimeout(t); failures++; throw e; });
  }
  /* ---------- clips saved on this device ----------
     Every Mandarin clip is stored in IndexedDB the first time it is made, so it is generated once,
     then plays instantly and works with no internet. IndexedDB also works when the page is opened as a file. */
  var dbp = null;
  function db() {
    if (dbp) return dbp;
    dbp = new Promise(function (res) {
      try {
        var rq = indexedDB.open('cp-audio', 1);
        rq.onupgradeneeded = function () { rq.result.createObjectStore('clips'); };
        rq.onsuccess = function () { res(rq.result); }; rq.onerror = rq.onblocked = function () { res(null); };
      } catch (e) { res(null); }
    });
    return dbp;
  }
  function idb(mode, fn) {
    return db().then(function (d) {
      if (!d) return null;
      return new Promise(function (res) {
        try { var tx = d.transaction('clips', mode), out = fn(tx.objectStore('clips')); tx.oncomplete = function () { res(out && out.result !== undefined ? out.result : true); }; tx.onerror = tx.onabort = function () { res(null); }; }
        catch (e) { res(null); }
      });
    });
  }
  function clipKey(py, hz, slow) { return (hz || '') + '|' + py + (slow ? '|slow' : ''); }
  function idbHas(key) { return idb('readonly', function (st) { return st.count(key); }).then(function (n) { return n > 0; }); }
  function fetchClip(py, hz, slow) {
    var text = hz ? hz + ' (pinyin: ' + py + ')' : py;
    var how = slow ? 'very slowly and clearly, pausing between syllables, ' : 'in clear, slow, ';
    var prompt = 'Say this ' + how + 'standard Mandarin (putonghua) with exactly the correct tones, as a teacher would for a beginner. Say only the Mandarin, nothing else: ' + text;
    return post(CFG.TTS_MODEL, {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: CFG.TTS_VOICE || 'Kore' } } } }
    }).then(function (j) {
      var part = j.candidates[0].content.parts.filter(function (p) { return p.inlineData; })[0].inlineData;
      var m = /rate=(\d+)/.exec(part.mimeType || ''), rate = m ? +m[1] : 24000;
      return pcmToWav(b64ToBytes(part.data), rate);
    });
  }
  /* memory, then the device store, then the network. Resolves { url, src: 'cache' | 'gemini' }. */
  function getClip(py, hz, slow) {
    var key = clipKey(py, hz, slow);
    if (cache[key]) return Promise.resolve({ url: cache[key], src: 'cache' });
    return idb('readonly', function (st) { return st.get(key); }).then(function (rec) {
      if (rec && rec.blob) { var u = URL.createObjectURL(rec.blob); cache[key] = u; return { url: u, src: 'cache' }; }
      if (!geminiOn('tts')) throw new Error('offline');
      return fetchClip(py, hz, slow).then(function (blob) {
        var url = URL.createObjectURL(blob); cache[key] = url;
        idb('readwrite', function (st) { return st.put({ blob: blob, t: Date.now() }, key); });
        return { url: url, src: 'gemini' };
      });
    });
  }
  function zhVoice() { try { return !!(window.speechSynthesis && speechSynthesis.getVoices().some(function (v) { return /^zh/i.test(v.lang); })); } catch (e) { return false; } }
  function deviceVoice(py, hz, slow) {
    if (!window.speechSynthesis) return false;
    var voices = speechSynthesis.getVoices(), zh = voices.filter(function (v) { return /^zh/i.test(v.lang); })[0];
    if (!zh && !hz) return false;
    var u = new SpeechSynthesisUtterance(hz || py);
    u.lang = zh ? zh.lang : 'zh-CN'; if (zh) u.voice = zh; u.rate = slow ? 0.5 : 0.8;
    duckFor(u);
    speechSynthesis.cancel(); speechSynthesis.speak(u); return true;
  }
  /* Speak Mandarin. Resolves to 'cache' | 'gemini' | 'device' | 'none' | 'muted'. opts.slow plays a slower take. */
  function speak(py, hz, opts) {
    var slow = !!(opts && opts.slow);
    if (!soundOn) return Promise.resolve('muted');
    stopAll();
    function fallback() { return deviceVoice(py, hz, slow) ? 'device' : 'none'; }
    return getClip(py, hz, slow).then(function (c) {
      if (!voiceEl) voiceEl = new Audio();
      voiceEl.src = c.url; bed.voice = true; applyBed(); voiceEl.onended = voiceEl.onerror = function () { bed.voice = false; applyBed(); };
      var p = voiceEl.play(); if (p && p.catch) p.catch(function () { bed.voice = false; applyBed(); });
      return c.src;
    }, function () { return fallback(); });
  }
  /* Can this word be heard right now? (saved on the device, or online, or the device has a Chinese voice) */
  function available(py, hz) {
    if (!soundOn) return Promise.resolve(false);
    return idbHas(clipKey(py, hz, false)).then(function (h) { return h || geminiOn('tts') || zhVoice(); });
  }
  /* Save a whole list of words for offline use. Two at a time, gently. */
  var pf = { run: false, stop: false };
  function prefetch(list, cb) {
    if (pf.run) return Promise.resolve({ busy: true });
    pf.run = true; pf.stop = false; var i = 0, done = 0, have = 0, failed = 0, total = list.length, why = '';
    function tell() { if (cb) cb({ done: done, have: have, failed: failed, total: total }); }
    function next() {
      if (pf.stop || i >= total) return Promise.resolve();
      var it = list[i++];
      return idbHas(clipKey(it.py, it.hz, false)).then(function (h) {
        if (h) { have++; tell(); return; }
        if (!geminiOn('tts')) { pf.stop = true; why = 'offline'; return; }
        return getClip(it.py, it.hz, false).then(function () { done++; }, function () { failed++; })
          .then(function () { tell(); return new Promise(function (r) { setTimeout(r, 120); }); });
      }).then(next);
    }
    return Promise.all([next(), next()]).then(function () { pf.run = false; return { done: done, have: have, failed: failed, total: total, stopped: pf.stop, why: why }; });
  }
  window.addEventListener('online', function () { failures = 0; });
  /* Read English text aloud with the device voice (used for tone descriptions). */
  function say(text) {
    if (!soundOn || !window.speechSynthesis) return false;
    stopAll();
    var u = new SpeechSynthesisUtterance(text); u.lang = 'en'; u.rate = 0.95; duckFor(u); speechSynthesis.speak(u); return true;
  }
  function ask(prompt) {
    if (!geminiOn('text')) return Promise.reject(new Error('offline'));
    return post(CFG.TEXT_MODEL, {
      systemInstruction: { parts: [{ text: 'You are a warm, concise Mandarin tutor for absolute beginners. Use simplified characters with pinyin tone marks. Answer in plain text, at most 90 words, no markdown.' }] },
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.4, maxOutputTokens: 300 }
    }, 20000).then(function (j) {
      return j.candidates[0].content.parts.map(function (p) { return p.text || ''; }).join('').trim();
    });
  }
  /* A short two-note chime that confirms Pause or Play. It uses its own tiny audio context, so it can still be heard
     at the moment everything else is paused. Rising notes = playing, falling notes = paused. */
  var cueCtx = null;
  function cue(playing) {
    try {
      var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      if (!cueCtx) cueCtx = new AC(); if (cueCtx.state === 'suspended') cueCtx.resume();
      var notes = playing ? [523.25, 783.99] : [659.25, 392.0], t0 = cueCtx.currentTime + 0.02;
      notes.forEach(function (f, i) {
        var o = cueCtx.createOscillator(), g = cueCtx.createGain(), t = t0 + i * 0.16;
        o.type = 'sine'; o.frequency.value = f; o.connect(g); g.connect(cueCtx.destination);
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.28, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
        o.start(t); o.stop(t + 0.25);
      });
    } catch (e) {}
  }
  window.CPAudio = {
    cue: cue,
    play: play, stopAll: stopAll, preload: preload, speak: speak, say: say, ask: ask,
    setSound: function (on) { soundOn = !!on; if (!on) stopAll(); if (bed.gesture) startBed(); else applyBed(); },
    startBed: startBed, bedMode: bedMode,
    canAsk: function () { return geminiOn('text'); },
    isSoundOn: function () { return soundOn; }, available: available, hasZhVoice: zhVoice, canMakeAudio: function () { return geminiOn('tts'); },
    prefetch: prefetch, cancelPrefetch: function () { pf.stop = true; },
    store: {
      count: function () { return idb('readonly', function (st) { return st.count(); }).then(function (n) { return n || 0; }); },
      clear: function () { Object.keys(cache).forEach(function (k) { try { URL.revokeObjectURL(cache[k]); } catch (e) {} delete cache[k]; }); return idb('readwrite', function (st) { return st.clear(); }); }
    }
  };
  if (window.speechSynthesis) { try { speechSynthesis.getVoices(); } catch (e) {} }
})();
