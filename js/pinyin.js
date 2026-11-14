/* Pinyin segmenting and tone description (works fully offline). */
(function () {
  'use strict';
  var MARK = {'ā':1,'á':2,'ǎ':3,'à':4,'ē':1,'é':2,'ě':3,'è':4,'ī':1,'í':2,'ǐ':3,'ì':4,'ō':1,'ó':2,'ǒ':3,'ò':4,'ū':1,'ú':2,'ǔ':3,'ù':4,'ǖ':1,'ǘ':2,'ǚ':3,'ǜ':4};
  var V = 'aeiouüvāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ';
  var SYL = new RegExp('(?:zh|ch|sh|[bpmfdtnlgkhjqxzcsrwy])?[' + V + ']+(?:ng(?![' + V + '])|n(?![' + V + '])|r$)?', 'gi');
  var TONES = {
    1: { name: 'First tone', mark: 'ˉ', shape: 'High and level',
         how: 'Start high and hold the pitch flat, like a steady sung note.',
         say: 'First tone. High and level. Start high and hold the pitch flat, like a steady sung note.' },
    2: { name: 'Second tone', mark: 'ˊ', shape: 'Rising',
         how: 'Start in the middle and glide up, like asking "What?"',
         say: 'Second tone. Rising. Start in the middle and glide up, like asking, what?' },
    3: { name: 'Third tone', mark: 'ˇ', shape: 'Dipping',
         how: 'Start low-middle, dip to the bottom, then curve up. Before another syllable, say only the low dip.',
         say: 'Third tone. Dipping. Start low, dip to the bottom, then curve up. Before another syllable, say only the low dip.' },
    4: { name: 'Fourth tone', mark: 'ˋ', shape: 'Falling',
         how: 'Start high and drop sharply, like a firm "No!"',
         say: 'Fourth tone. Falling. Start high and drop sharply, like a firm, no!' },
    5: { name: 'Neutral tone', mark: '·', shape: 'Light and short',
         how: 'No mark. Say it quickly and lightly; its pitch follows the syllable before it.',
         say: 'Neutral tone. Light and short. No mark. Its pitch follows the syllable before it.' }
  };
  // pitch levels (1 low – 5 high) for the contour drawing
  var PATH = { 1: [5, 5], 2: [3, 5], 3: [2, 1, 4], 4: [5, 1], 5: [3, 2.4] };

  function toneOf(s) {
    s = s.normalize('NFC').toLowerCase();
    for (var i = 0; i < s.length; i++) if (MARK[s[i]]) return MARK[s[i]];
    return 5;
  }
  function hasToneMark(s) {
    s = s.normalize('NFC').toLowerCase();
    for (var i = 0; i < s.length; i++) if (MARK[s[i]]) return true;
    return false;
  }
  function segment(word) {
    var out = [];
    word.normalize('NFC').replace(/[’']/g, "'").split("'").forEach(function (part) {
      if (!part) return;
      var m = part.match(SYL);
      if (m && m.join('').length === part.length) m.forEach(function (x) { out.push(x); });
      else out.push(part);
    });
    return out;
  }
  function swap3to2(s) { return s.replace(/ǎ/g, 'á').replace(/ě/g, 'é').replace(/ǐ/g, 'í').replace(/ǒ/g, 'ó').replace(/ǔ/g, 'ú').replace(/ǚ/g, 'ǘ'); }

  function analyze(phrase) {
    var words = phrase.split(/[\s,.;:!?，。？！、…–—\/()"“”]+/).filter(Boolean);
    var syl = [];
    words.forEach(function (w) { segment(w).forEach(function (s) { syl.push({ text: s, tone: toneOf(s) }); }); });
    var notes = [];
    for (var i = 0; i < syl.length - 1; i++) {
      var a = syl[i], b = syl[i + 1], al = a.text.toLowerCase();
      if (a.tone === 3 && b.tone === 3) {
        notes.push('Two third tones in a row: say "' + a.text + '" as a second tone (' + swap3to2(a.text) + '). The written mark does not change.');
        a.said = 2;
      }
      if (al === 'bú' && b.tone === 4) notes.push('"bù" (not) is written and said "bú" before a fourth tone.');
      if (al === 'yí' && b.tone === 4) notes.push('"yī" (one) becomes "yí" before a fourth tone.');
      if (al === 'yì' && b.tone <= 3) notes.push('"yī" (one) becomes "yì" before tones one to three.');
    }
    return { syllables: syl, notes: notes };
  }
  /* tone numbers for braille displays and keyboards: mā -> ma1, Zhōngguó -> Zhong1guo2, yìdiǎnr -> yi4dian3r */
  var TMARK = { '\u0304': 1, '\u0301': 2, '\u030c': 3, '\u0300': 4 };
  function plainSyl(s) { var t = 5, d = s.normalize('NFD').replace(/[\u0304\u0301\u030c\u0300]/g, function (m) { t = TMARK[m]; return ''; }); return d.normalize('NFC') + t; }
  var TOKEN = /[A-Za-z\u00C0-\u024F']+/g, SYLN = /(?:[e\u0113\u00E9\u011B\u00E8]r(?![aeiouv\u00C0-\u024F]))|(?:zh|ch|sh|[bpmfdtnlgkhjqxzcsrwy])?[aeiouv\u00C0-\u024F]+(?:ng(?![aeiouv\u00C0-\u024F])|n(?![aeiouv\u00C0-\u024F]))?/gi;
  function numberize(text) {
    return String(text).normalize('NFC').replace(TOKEN, function (tok) {
      if (!hasToneMark(tok)) return tok;
      return tok.replace(SYLN, plainSyl);
    });
  }
  function contourSVG(tone, size) {
    var pts = PATH[tone], w = 64, h = 44, pad = 6, n = pts.length;
    var d = pts.map(function (lv, i) {
      var x = pad + (w - 2 * pad) * (i / (n - 1)), y = h - pad - (h - 2 * pad) * ((lv - 1) / 4);
      return (i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1);
    }).join(' ');
    var last = pts[n - 1], lx = w - pad, ly = h - pad - (h - 2 * pad) * ((last - 1) / 4);
    var grid = '';
    for (var g = 0; g < 5; g++) { var gy = h - pad - (h - 2 * pad) * (g / 4); grid += '<line x1="2" x2="' + (w - 2) + '" y1="' + gy + '" y2="' + gy + '" class="cg"/>'; }
    return '<svg class="contour" viewBox="0 0 ' + w + ' ' + h + '" width="' + (size || 64) + '" height="' + Math.round((size || 64) * h / w) + '" aria-hidden="true">' + grid +
      '<path d="' + d + '" class="cp" pathLength="100"/><circle cx="' + lx + '" cy="' + ly.toFixed(1) + '" r="3" class="cd"/></svg>';
  }
  window.CPPinyin = { TONES: TONES, toneOf: toneOf, hasToneMark: hasToneMark, segment: segment, analyze: analyze, contourSVG: contourSVG, numberize: numberize };
})();
