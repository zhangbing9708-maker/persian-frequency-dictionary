/* Persian Core Vocabulary — search & explore the frequency dictionary data (data/data.js). No dependencies. */
(function () {
  'use strict';
  const D = window.PERSIAN_DICT;
  if (!D) { document.getElementById('count').textContent = 'Data file not found (data/data.js).'; return; }

  // ---------- data ----------
  const entries = D.entries.map(r => ({
    rank: r[0], hw: r[1], ipa: r[2], gloss: r[3], pos: r[4], fa: r[5], en: r[6],
    dp: r[7], raw: r[8], page: r[9], lists: r[10], pg: r[11]
  }));
  const lists = D.lists.map(L => ({ num: L.num, title: L.title, words: L.words.map(w => ({ rank: w[0], hw: w[1], ipa: w[2], gloss: w[3] })) }));
  const byRank = new Map(entries.map(e => [e.rank, e]));
  const listByNum = new Map(lists.map(L => [L.num, L]));
  const POS = [
    ['n', 'noun'], ['v', 'verb'], ['adj', 'adjective'], ['adv', 'adverb'], ['pn', 'proper noun'],
    ['pron', 'pronoun'], ['prep', 'preposition'], ['conj', 'conjunction'], ['q', 'quantifier'], ['expression', 'expression']
  ];
  const POS_NAME = Object.fromEntries(POS);

  // ---------- normalisation ----------
  const FA_CHAR = { 'ي': 'ی', 'ى': 'ی', 'ئ': 'ی', 'ك': 'ک', 'ۀ': 'ه', 'ة': 'ه', 'ؤ': 'و', 'إ': 'ا', 'أ': 'ا', 'آ': 'ا', 'ء': '' };
  const DIGITS = { '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4', '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9',
                   '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9' };
  function normFa(s) {
    let out = '';
    for (const ch of s) {
      if (ch in FA_CHAR) { out += FA_CHAR[ch]; continue; }
      if (ch in DIGITS) { out += DIGITS[ch]; continue; }
      const c = ch.charCodeAt(0);
      if ((c >= 0x064b && c <= 0x065f) || c === 0x0670 || c === 0x0640 || c === 0x200c || c === 0x200d || ch === ' ' || ch === ' ') continue;
      out += ch;
    }
    return out;
  }
  function foldIpa(s) {
    return s.toLowerCase()
      .replace(/[ɑæ]/g, 'a').replace(/ʃ/g, 'sh').replace(/ʒ/g, 'zh').replace(/ʧ/g, 'ch').replace(/ʤ/g, 'j')
      .replace(/[ɣq]/g, 'gh').replace(/ɡ/g, 'g').replace(/[ʔɁ'’ʼ]/g, '').replace(/x/g, 'kh')
      .replace(/[^a-z0-9, ]/g, '');
  }
  const hasFa = s => /[؀-ۿ]/.test(s);
  const words = s => s.toLowerCase().split(/[^a-z0-9'’-]+/).filter(Boolean);

  for (const e of entries) {
    e.hwN = normFa(e.hw);
    e.faN = normFa(e.fa);
    e.ipaL = e.ipa.toLowerCase();
    e.ipaF = foldIpa(e.ipa);
    e.ipaParts = e.ipaL.split(/\s*,\s*/).map(p => p.trim());
    e.ipaPartsF = e.ipaParts.map(foldIpa);
    e.glossL = e.gloss.toLowerCase();
    e.glossWords = new Set(words(e.gloss));
    e.pgL = Object.values(e.pg).map(v => v[0]).join(' | ').toLowerCase();
    e.enL = e.en.toLowerCase();
  }
  const alphaKey = s => normFa(s).replace(/ا/g, 'ا');
  const collator = new Intl.Collator('fa');

  // ---------- state ----------
  const state = { q: '', pos: new Set(), min: 1, max: 5000, list: '', sort: 'rank', open: null, view: 'search', theme: null };
  let results = [];
  let shown = 0;
  const PAGE = 60;

  const $ = id => document.getElementById(id);
  const qInput = $('q'), clearBtn = $('clearBtn'), resultsEl = $('results'), countEl = $('count'),
        emptyEl = $('empty'), histEl = $('histogram'), sentinel = $('sentinel'),
        rankMin = $('rankMin'), rankMax = $('rankMax'), listSelect = $('listSelect'), sortSelect = $('sortSelect');

  // ---------- matching ----------
  function matchScore(e, q) {
    if (/^\d{1,4}$/.test(q)) return e.rank === Number(q) ? 100 : 0;
    if (hasFa(q)) {
      const n = normFa(q);
      if (!n) return 0;
      if (e.hwN === n) return 100;
      if (e.hwN.startsWith(n)) return 80;
      if (e.hwN.includes(n)) return 60;
      if (n.length >= 2 && e.faN.includes(n)) return 20;
      return 0;
    }
    const ql = q.toLowerCase().trim();
    const qf = foldIpa(ql);
    let best = 0;
    if (qf.length >= 1) {
      if (e.ipaPartsF.some(p => p === qf) || e.ipaParts.some(p => p === ql)) best = Math.max(best, 95);
      else if (e.ipaPartsF.some(p => p.startsWith(qf)) || e.ipaParts.some(p => p.startsWith(ql))) best = Math.max(best, 75);
      else if (qf.length >= 3 && (e.ipaF.includes(qf) || e.ipaL.includes(ql))) best = Math.max(best, 55);
    }
    if (e.glossL === ql || e.glossWords.has(ql)) best = Math.max(best, 90);
    else if (ql.length >= 2 && new RegExp('(^|[^a-z])' + escapeRe(ql)).test(e.glossL)) best = Math.max(best, 70);
    else if (ql.length >= 3 && e.glossL.includes(ql)) best = Math.max(best, 50);
    if (best < 45 && ql.length >= 3 && e.pgL.includes(ql)) best = Math.max(best, 45);
    if (best < 15 && ql.length >= 3 && new RegExp('(^|[^a-z])' + escapeRe(ql)).test(e.enL)) best = Math.max(best, 15);
    return best;
  }
  function tokenMatch(e, tok) {
    return matchScore(e, tok) > 0;
  }
  function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  function run() {
    const q = state.q.trim();
    const toks = q.split(/\s+/).filter(Boolean);
    const multi = toks.length > 1 && !hasFa(q);
    results = [];
    for (const e of entries) {
      if (e.rank < state.min || e.rank > state.max) continue;
      if (state.pos.size && !e.pos.some(p => state.pos.has(p))) continue;
      if (state.list && !e.lists.includes(Number(state.list))) continue;
      let score = 0;
      if (q) {
        score = matchScore(e, q);
        if (!score && multi && toks.every(t => tokenMatch(e, t))) score = 30;
        if (!score) continue;
      }
      e.score = score;
      results.push(e);
    }
    const s = state.sort;
    if (q && s === 'rank') results.sort((a, b) => b.score - a.score || a.rank - b.rank);
    else if (s === 'alpha') results.sort((a, b) => collator.compare(alphaKey(a.hw), alphaKey(b.hw)) || a.rank - b.rank);
    else if (s === 'raw') results.sort((a, b) => (b.raw || 0) - (a.raw || 0));
    else if (s === 'dp') results.sort((a, b) => (b.dp || 0) - (a.dp || 0) || a.rank - b.rank);
    else if (s === 'gloss') results.sort((a, b) => a.glossL.localeCompare(b.glossL) || a.rank - b.rank);
    else results.sort((a, b) => a.rank - b.rank);
    renderResults();
  }

  // ---------- rendering ----------
  function esc(s) { return s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
  function faHighlightRe(q) {
    const n = normFa(q);
    if (!n) return null;
    const parts = [];
    for (const ch of n) {
      let cls = escapeRe(ch);
      if (ch === 'ی') cls = '[یيىئ]';
      else if (ch === 'ک') cls = '[کك]';
      else if (ch === 'ا') cls = '[اآأإ]';
      else if (ch === 'ه') cls = '[هۀة]';
      else if (ch === 'و') cls = '[وؤ]';
      parts.push(cls);
    }
    return new RegExp(parts.join('[\\u064b-\\u065f\\u0670\\u200c\\u00a0 ]*'), 'g');
  }
  function hl(text, q, mode) {
    if (!q) return esc(text);
    let re = null;
    if (mode === 'fa') { if (!hasFa(q)) return esc(text); re = faHighlightRe(q); }
    else { if (hasFa(q) || /^\d+$/.test(q)) return esc(text); re = new RegExp(escapeRe(q.trim()), 'gi'); }
    if (!re) return esc(text);
    let out = '', last = 0, m;
    while ((m = re.exec(text)) !== null) {
      if (m[0] === '') { re.lastIndex++; continue; }
      out += esc(text.slice(last, m.index)) + '<mark>' + esc(m[0]) + '</mark>';
      last = m.index + m[0].length;
    }
    return out + esc(text.slice(last));
  }
  function fmt(n) { return n == null ? '—' : n.toLocaleString('en-US'); }

  function entryHtml(e) {
    const q = state.q.trim();
    const open = state.open === e.rank;
    return `<li class="entry" data-rank="${e.rank}" id="w${e.rank}">
      <div class="entry-head" role="button" tabindex="0" aria-expanded="${open}">
        <span class="rank">${e.rank}</span>
        <div class="entry-main">
          <div class="line1">
            <span class="hw" lang="fa">${hl(e.hw, q, 'fa')}</span>
            <span class="ipa" title="Pronunciation (IPA)">${esc(e.ipa)}</span>
            <span class="gloss">${hl(e.gloss, q, 'en')}</span>
            <span class="pos">${e.pos.map(p => POS_NAME[p] || p).join(', ')}</span>
          </div>
        </div>
        <p class="example"><span class="fa" lang="fa">${hl(e.fa, q, 'fa')}</span><br><span class="en">${hl(e.en, q, 'en')}</span></p>
        ${open ? detailHtml(e) : ''}
      </div>
    </li>`;
  }
  function detailHtml(e) {
    const listLinks = e.lists.map(n => { const L = listByNum.get(n); return `<a href="#view=themes&theme=${n}" data-theme="${n}">${esc(L.title)}</a>`; }).join(', ');
    const pgRows = Object.entries(e.pg).map(([tag, v]) =>
      `<tr><th>${POS_NAME[tag] || tag}</th><td>${esc(v[0])}${v[1] ? ` <span class="ipa">${esc(v[1])}</span>` : ''}</td></tr>`).join('');
    const prev = byRank.get(e.rank - 1), next = byRank.get(e.rank + 1);
    return `<div class="detail">
      <dl>
        <dt>Dispersion</dt><dd title="Dispersion code 38–97: values near 100 mean the word is spread evenly through the corpus; below 70, it is concentrated in narrower parts of it">${fmt(e.dp)}</dd>
        <dt>Raw count</dt><dd title="Total occurrences of the word family in the 150-million-word corpus">${fmt(e.raw)}</dd>
        <dt>Parts of speech</dt><dd>${e.pos.map(p => POS_NAME[p] || p).join(', ')}</dd>
        ${e.lists.length ? `<dt>Themes</dt><dd class="lists">${listLinks}</dd>` : ''}
        ${pgRows ? `<dt>In the POS index</dt><dd><table>${pgRows}</table></dd>` : ''}
        <dt>In the book</dt><dd>page ${e.page}</dd>
      </dl>
      <div class="nav">
        ${prev ? `<a href="#w=${prev.rank}" data-go="${prev.rank}">← ${prev.rank} <span class="fa-inline" lang="fa">${esc(prev.hw)}</span></a>` : ''}
        ${next ? `<a href="#w=${next.rank}" data-go="${next.rank}"><span class="fa-inline" lang="fa">${esc(next.hw)}</span> ${next.rank} →</a>` : ''}
      </div>
    </div>`;
  }

  function renderResults() {
    shown = 0;
    resultsEl.innerHTML = '';
    emptyEl.hidden = results.length > 0;
    const total = entries.filter(e => e.rank >= state.min && e.rank <= state.max).length;
    const filtered = state.q.trim() || state.pos.size || state.list || state.min !== 1 || state.max !== 5000;
    countEl.innerHTML = filtered
      ? `<b>${results.length.toLocaleString('en-US')}</b> of ${entries.length.toLocaleString('en-US')} words`
      : `<b>${entries.length.toLocaleString('en-US')}</b> words, most frequent first`;
    renderHistogram();
    appendMore();
  }
  function appendMore() {
    const slice = results.slice(shown, shown + PAGE);
    if (!slice.length) return;
    const frag = document.createElement('template');
    frag.innerHTML = slice.map(entryHtml).join('');
    resultsEl.appendChild(frag.content);
    shown += slice.length;
  }
  function renderHistogram() {
    const buckets = new Array(50).fill(0);
    for (const e of results) buckets[Math.min(49, Math.floor((e.rank - 1) / 100))]++;
    const max = Math.max(1, ...buckets);
    histEl.innerHTML = buckets.map(b => `<span style="height:${Math.max(b ? 2 : 1, Math.round(b / max * 26))}px"></span>`).join('');
    histEl.title = `Rank distribution of these words (each bar = 100 ranks, 1 to 5,000)`;
  }
  const io = new IntersectionObserver(es => { if (es.some(x => x.isIntersecting)) appendMore(); }, { rootMargin: '600px' });
  io.observe(sentinel);

  // ---------- interactions ----------
  function toggleOpen(rank) {
    state.open = state.open === rank ? null : rank;
    const li = resultsEl.querySelector(`#w${rank}`);
    if (!li) return;
    const e = byRank.get(rank);
    li.outerHTML = entryHtml(e);
    writeHash();
  }
  resultsEl.addEventListener('click', ev => {
    const go = ev.target.closest('[data-go]');
    if (go) { ev.preventDefault(); openEntry(Number(go.dataset.go)); return; }
    const th = ev.target.closest('[data-theme]');
    if (th) { ev.preventDefault(); showView('themes'); showTheme(Number(th.dataset.theme)); return; }
    if (ev.target.closest('a, mark') && !ev.target.closest('.entry-head')) return;
    const head = ev.target.closest('.entry-head');
    if (head && !ev.target.closest('.detail')) toggleOpen(Number(head.parentElement.dataset.rank));
    if (ev.target.closest('.detail') && window.getSelection().toString() === '') { /* clicks inside the detail box do nothing */ }
  });
  resultsEl.addEventListener('keydown', ev => {
    if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.classList.contains('entry-head')) {
      ev.preventDefault(); toggleOpen(Number(ev.target.parentElement.dataset.rank));
    }
  });
  function openEntry(rank) {
    showView('search');
    state.q = String(rank); qInput.value = state.q;
    state.pos.clear(); state.min = 1; state.max = 5000; state.list = ''; state.sort = 'rank';
    state.open = rank;
    syncControls();
    run();
    writeHash();
    const li = resultsEl.querySelector(`#w${rank}`);
    if (li) li.scrollIntoView({ block: 'start' });
    window.scrollTo({ top: 0 });
  }

  let debounce = null;
  qInput.addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => { state.q = qInput.value; state.open = null; clearBtn.hidden = !state.q; run(); writeHash(); }, 120);
  });
  clearBtn.addEventListener('click', () => { qInput.value = ''; state.q = ''; clearBtn.hidden = true; run(); writeHash(); qInput.focus(); });
  document.addEventListener('keydown', ev => {
    if (ev.key === '/' && !/input|select|textarea/i.test(document.activeElement.tagName)) { ev.preventDefault(); showView('search'); qInput.focus(); qInput.select(); }
    if (ev.key === 'Escape' && document.activeElement === qInput && qInput.value) { qInput.value = ''; state.q = ''; clearBtn.hidden = true; run(); writeHash(); }
  });

  // POS chips
  const posChips = $('posChips');
  const posCounts = {};
  for (const e of entries) for (const p of e.pos) posCounts[p] = (posCounts[p] || 0) + 1;
  posChips.innerHTML = POS.filter(([k]) => posCounts[k]).map(([k, name]) =>
    `<button class="chip" type="button" data-pos="${k}" aria-pressed="false">${name}<span class="n">${posCounts[k].toLocaleString('en-US')}</span></button>`).join('');
  posChips.addEventListener('click', ev => {
    const b = ev.target.closest('.chip'); if (!b) return;
    const k = b.dataset.pos;
    if (state.pos.has(k)) state.pos.delete(k); else state.pos.add(k);
    b.setAttribute('aria-pressed', state.pos.has(k));
    state.open = null; run(); writeHash();
  });
  for (const L of lists) {
    const o = document.createElement('option'); o.value = L.num; o.textContent = `${L.num}. ${L.title}`; listSelect.appendChild(o);
  }
  function clampRank() {
    let a = Math.max(1, Math.min(5000, Number(rankMin.value) || 1));
    let b = Math.max(1, Math.min(5000, Number(rankMax.value) || 5000));
    if (a > b) [a, b] = [b, a];
    state.min = a; state.max = b;
  }
  rankMin.addEventListener('change', () => { clampRank(); syncControls(); run(); writeHash(); });
  rankMax.addEventListener('change', () => { clampRank(); syncControls(); run(); writeHash(); });
  listSelect.addEventListener('change', () => { state.list = listSelect.value; state.open = null; run(); writeHash(); });
  sortSelect.addEventListener('change', () => { state.sort = sortSelect.value; run(); writeHash(); });
  $('resetBtn').addEventListener('click', () => {
    state.pos.clear(); state.min = 1; state.max = 5000; state.list = ''; state.sort = 'rank'; state.open = null;
    syncControls(); run(); writeHash();
  });
  function syncControls() {
    rankMin.value = state.min; rankMax.value = state.max; listSelect.value = state.list; sortSelect.value = state.sort;
    for (const b of posChips.querySelectorAll('.chip')) b.setAttribute('aria-pressed', state.pos.has(b.dataset.pos));
    clearBtn.hidden = !state.q;
  }

  // ---------- views ----------
  const tabs = document.querySelectorAll('.tab');
  function showView(v) {
    state.view = v;
    for (const t of tabs) { const on = t.dataset.view === v; t.classList.toggle('is-active', on); t.setAttribute('aria-pressed', on); }
    for (const s of document.querySelectorAll('.view')) s.classList.toggle('is-active', s.id === 'view-' + v);
    writeHash();
  }
  for (const t of tabs) t.addEventListener('click', () => { showView(t.dataset.view); if (t.dataset.view === 'search') qInput.focus(); });

  // themes
  const themeGrid = $('themeGrid'), themeDetail = $('themeDetail');
  themeGrid.innerHTML = lists.map(L => `<button class="theme-card" type="button" data-theme="${L.num}"><span>${L.num}. ${esc(L.title)}</span><span class="n">${L.words.length}</span></button>`).join('');
  themeGrid.addEventListener('click', ev => { const b = ev.target.closest('.theme-card'); if (b) showTheme(Number(b.dataset.theme)); });
  function showTheme(num) {
    state.theme = num;
    const L = listByNum.get(num); if (!L) return;
    for (const b of themeGrid.querySelectorAll('.theme-card')) b.classList.toggle('is-active', Number(b.dataset.theme) === num);
    const inMain = L.words.filter(w => w.rank && w.rank <= 5000).length;
    themeDetail.hidden = false;
    themeDetail.innerHTML = `<h3>${L.num}. ${esc(L.title)}</h3>
      <p class="meta">${L.words.length} words, ${inMain} with a main entry${/order/.test(L.title) ? '' : '; listed by rank'}. <a class="link-btn" href="#list=${num}" data-filter="${num}">Show these as dictionary entries</a></p>
      <table class="theme-table"><tbody>${L.words.map(w => {
        const has = w.rank && byRank.has(w.rank);
        const hwCell = has ? `<a href="#w=${w.rank}" data-go="${w.rank}">${esc(w.hw)}</a>` : esc(w.hw);
        return `<tr><td class="r">${w.rank == null ? '—' : w.rank}</td><td class="w" lang="fa">${hwCell}</td><td class="i">${esc(w.ipa)}</td><td class="g${has ? '' : ' nolink'}">${esc(w.gloss)}</td></tr>`;
      }).join('')}</tbody></table>`;
    themeDetail.scrollIntoView({ block: 'start', behavior: 'smooth' });
    writeHash();
  }
  themeDetail.addEventListener('click', ev => {
    const go = ev.target.closest('[data-go]');
    if (go) { ev.preventDefault(); openEntry(Number(go.dataset.go)); return; }
    const f = ev.target.closest('[data-filter]');
    if (f) { ev.preventDefault(); state.q = ''; qInput.value = ''; state.pos.clear(); state.min = 1; state.max = 5000; state.list = String(f.dataset.filter); state.sort = 'rank'; state.open = null; syncControls(); showView('search'); run(); writeHash(); window.scrollTo({ top: 0 }); }
  });

  // about
  const m = D.meta;
  $('aboutBody').innerHTML = `
    <p>Everything on this site comes from one book: <i>${esc(m.source)}</i>. Nothing has been added, translated or corrected beyond the handful of typesetting slips listed below — what you read is what the book prints.</p>
    <h3>What is here</h3>
    <ul>
      <li><b>${m.entries.toLocaleString('en-US')} main entries</b> — the frequency index: rank, headword, pronunciation, gloss, part of speech, one example sentence with its translation, dispersion code and raw count.</li>
      <li><b>${m.thematic_lists} thematic lists</b> — the callout boxes (Animals, Body, Clothing … Weather), ${lists.reduce((a, L) => a + L.words.length, 0).toLocaleString('en-US')} words in all.</li>
      <li><b>Part-of-speech index</b> — ${Object.entries(m.pos_sections).map(([k, v]) => `${k.toLowerCase()} ${v.toLocaleString('en-US')}`).join(', ')}. Where the index gives a word a different gloss for a given part of speech, it is shown in the entry’s detail panel.</li>
    </ul>
    <h3>Reading an entry</h3>
    <p>The authors rank <i>word families</i> (a headword plus its inflected forms) by a dispersion-adjusted frequency over a 150-million-word corpus of written and spoken Persian. The <b>dispersion</b> code runs from 38 to 97: values approaching 100 mean the word occurs evenly throughout the corpus, values below 70 mean it is concentrated in narrower parts of it. The <b>raw count</b> is the number of times the word family was counted. Pronunciations are IPA for common Iranian Persian; when a headword has several pronunciations they are separated by commas and matched, in order, to the comma-separated glosses.</p>
    <p>Parts of speech: adj adjective, adv adverb, conj conjunction, n noun, prep preposition, pron pronoun, pn proper noun, q quantifier, v verb.</p>
    <h3>Searching</h3>
    <p>Persian input ignores ZWNJ, spaces, diacritics and the Arabic/Persian letter variants (ي/ی, ك/ک, آ/ا). Latin input is matched against the IPA with common transliterations folded in — <i>kh</i> for x, <i>sh</i> for ʃ, <i>ch</i> for ʧ, <i>j</i> for ʤ, <i>zh</i> for ʒ, <i>gh</i> for ɣ/q, <i>a</i> for ɑ or æ — and against the English glosses and example translations. A number on its own opens that rank.</p>
    <h3>Known quirks in the printed book</h3>
    <ul>${m.notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul>
    <h3>Files</h3>
    <p>The full extracted text is in the repository as <code>data/dictionary.txt</code> (plain text), <code>data/entries.tsv</code>, <code>data/thematic_lists.tsv</code>, <code>data/pos_index.tsv</code> and <code>data/dictionary.json</code>.</p>`;

  // ---------- theme ----------
  const root = document.documentElement;
  let saved = null;
  try { saved = localStorage.getItem('pcv-theme'); } catch (e) { saved = null; }
  if (saved === 'light' || saved === 'dark') root.setAttribute('data-theme', saved);
  $('themeToggle').addEventListener('click', () => {
    const dark = root.getAttribute('data-theme') === 'dark' || (!root.getAttribute('data-theme') && matchMedia('(prefers-color-scheme: dark)').matches);
    const next = dark ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    try { localStorage.setItem('pcv-theme', next); } catch (e) { /* ignore */ }
  });

  // ---------- URL hash ----------
  let writing = false;
  function writeHash() {
    const p = new URLSearchParams();
    if (state.view !== 'search') p.set('view', state.view);
    if (state.view === 'themes' && state.theme) p.set('theme', state.theme);
    if (state.q.trim()) p.set('q', state.q.trim());
    if (state.pos.size) p.set('pos', [...state.pos].join(','));
    if (state.min !== 1) p.set('min', state.min);
    if (state.max !== 5000) p.set('max', state.max);
    if (state.list) p.set('list', state.list);
    if (state.sort !== 'rank') p.set('sort', state.sort);
    if (state.open) p.set('w', state.open);
    const h = p.toString();
    writing = true;
    history.replaceState(null, '', h ? '#' + h : location.pathname + location.search);
    setTimeout(() => { writing = false; }, 0);
  }
  function readHash() {
    const p = new URLSearchParams(location.hash.slice(1));
    state.q = p.get('q') || '';
    state.pos = new Set((p.get('pos') || '').split(',').filter(Boolean));
    state.min = Number(p.get('min')) || 1; state.max = Number(p.get('max')) || 5000;
    state.list = p.get('list') || '';
    state.sort = p.get('sort') || 'rank';
    state.open = Number(p.get('w')) || null;
    const w = p.get('w');
    if (w && !p.get('q') && !p.get('list')) { state.q = w; }
    qInput.value = state.q;
    syncControls();
    run();
    const view = p.get('view') || 'search';
    showView(view);
    if (view === 'themes' && p.get('theme')) showTheme(Number(p.get('theme')));
    if (state.open) { const li = resultsEl.querySelector(`#w${state.open}`); if (li) li.scrollIntoView({ block: 'start' }); }
  }
  window.addEventListener('hashchange', () => { if (!writing) readHash(); });
  readHash();
  if (!location.hash) qInput.focus();
})();
