// Token Radar's dashboard (radar-2). It reads window.RADAR (written beside dashboard/ by main.ts)
// and renders the ranked board, filters, a per-protocol detail view and a two-protocol comparison,
// all on one page. No network: every byte it shows is in data.js.
//
// The model, in one function: implied value is what a $10,000 deposit, $2,000 a month, 6 months
// is worth as a share of the farming pool --
//   token value  = tvl_usd x 0.25 x (1 + 0.4 x clamp(change_7d, -60, +200) / 100) x maturity(age)
//   maturity(age)= 0.60 + 0.40 x min(age, 730) / 730, then past 730 days x max(0.80, 1 - 0.02 x (age-730)/365)
//   farmer value = min(3 x $10,000, 5% x token value x ($10,000 / tvl_usd)^0.7)
// The page recomputes a row from the snapshot figures and checks the number board.json carries, so
// the page's code and the board's data are visibly the same arithmetic. The deposit curve for a row
// is the same formula at ten deposit levels. The walk-forward check rewinds the snapshot seven days
// (TVL divided by 1 + change_7d/100, growth unknown, age minus seven) and re-ranks it.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', chain: 'all', ageBand: 'all', tab: 'pre-token', sort: 'implied', dir: -1, selected: null, compare: [] };
  var MODEL = DATA.model;
  var DEPOSIT = MODEL.deposit_usd;
  var CAP = DATA.deposit_cap_usd;

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function fmtRatio(r) { return '1 : ' + r.toFixed(2); }
  function fmtInt(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return Math.round(n).toLocaleString('en-US');
  }

  // The model in one function, run here against the board's own numbers.
  function farmerOf(row) {
    var growth = Math.min(MODEL.growth_cap, Math.max(MODEL.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * MODEL.growth_weight;
    var age = row.age_days === null || row.age_days === undefined ? MODEL.unknown_age_days : row.age_days;
    var maturity = MODEL.maturity_floor + (Math.min(Math.max(age, 0), MODEL.maturity_days) / MODEL.maturity_days) * MODEL.maturity_range;
    if (age > MODEL.maturity_days) maturity *= Math.max(MODEL.maturity_decay_floor, 1 - MODEL.maturity_decay_per_year * ((age - MODEL.maturity_days) / 365));
    var token = row.tvl_usd * MODEL.base_multiple * growthMult * maturity;
    var share = Math.min(1, Math.pow(DEPOSIT / row.tvl_usd, MODEL.dilution_exponent));
    return Math.min(CAP, Math.max(1, Math.round(token * MODEL.airdrop_pct * share)));
  }
  function curveOf(row) {
    var pool = row.token_value_usd * MODEL.airdrop_pct;
    return [100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000].map(function (dep) {
      return { deposit: dep, expected: Math.min(CAP, Math.round(pool * Math.min(1, Math.pow(dep / row.tvl_usd, MODEL.dilution_exponent)))) };
    });
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('age')) state.ageBand = params.get('age');
    if (params.get('sort')) state.sort = params.get('sort');
    if (params.get('compare')) state.compare = params.get('compare').split(',').filter(function (s) { return s; }).slice(0, 2);
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.ageBand !== 'all') params.set('age', state.ageBand);
    if (state.sort !== 'implied') params.set('sort', state.sort);
    if (state.selected) params.set('p', state.selected);
    if (state.compare.length) params.set('compare', state.compare.join(','));
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function ageInBand(days, band) {
    if (band === 'all') return true;
    if (band === 'unknown') return days === null || days === undefined;
    if (days === null || days === undefined) return false;
    if (band === 'lt90') return days < 90;
    if (band === '90-365') return days >= 90 && days < 365;
    if (band === '1-2y') return days >= 365 && days < 730;
    if (band === 'gt2y') return days >= 730;
    return true;
  }
  function rows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && r.category !== state.category) return false;
      if (state.chain !== 'all' && !(r.chains || []).some(function (c) { return c === state.chain; })) return false;
      if (!ageInBand(r.age_days, state.ageBand)) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.symbol || '', r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else if (key === 'ratio') { av = a.tvl_usd / a.implied_value_usd; bv = b.tvl_usd / b.implied_value_usd; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }
  function rowBySlug(slug) {
    return DATA.rows.filter(function (r) { return r.slug === slug; })[0] || null;
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'mark' }), el('span', { class: 'brand-name', text: 'Token Radar' })),
      el('div', { class: 'top-meta' },
        el('span', { text: 'Snapshot ' + DATA.as_of }),
        el('span', { text: 'DefiLlama protocol index' }),
        el('span', { text: DATA.model_version + ' model' })
      )
    );
  }

  function lede() {
    var med = DATA.rows.slice().sort(function (a, b) { return a.implied_value_usd - b.implied_value_usd; })[Math.floor(DATA.rows.length / 2)];
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', { text: DATA.watchlist_size + ' watchlist protocols, ranked by what a $10,000 farm is worth' }),
        el('p', { text: 'The watchlist is the floor: every protocol with at least $' + Math.round(DATA.floor_usd / 1e6) + 'M of TVL and no token on record. The early radar adds ' + DATA.early_size + ' pre-token protocols below that floor, under the same rule. Implied value is the model’s estimate of a $10,000 deposit’s share of the farming pool, not a promise.' })
      ),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })),
        el('div', { class: 'fact' }, el('span', { text: 'Pre-token rows scored' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Early rows below the floor' }), el('b', { text: String(DATA.early_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Median $10,000 farm' }), el('b', { text: med ? fmtUsd(med.implied_value_usd) : 'n/a' })),
        el('div', { class: 'fact' }, el('span', { text: 'Walk-forward rank stability' }), el('b', { text: 'rho ' + DATA.walk_forward.spearman + ', top 10: ' + DATA.walk_forward.top10_overlap + '/10' })),
        el('div', { class: 'fact' }, el('span', { text: 'Live-token protocols set aside' }), el('b', { text: String(DATA.live_size) }))
      )
    );
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chains = Array.from(new Set(DATA.rows.reduce(function (acc, r) { return acc.concat(r.chains || []); }, []))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, symbol, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var catSel = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })
    );
    catSel.addEventListener('change', function () { state.category = catSel.value; writeHash(); render(); });
    var chainSel = el('select', { id: 'chain', 'aria-label': 'Filter by chain' },
      el('option', { value: 'all', text: 'All chains' }),
      chains.map(function (c) { return el('option', { value: c, text: c, selected: c === state.chain ? 'selected' : null }); })
    );
    chainSel.addEventListener('change', function () { state.chain = chainSel.value; writeHash(); render(); });
    var ageSel = el('select', { id: 'age', 'aria-label': 'Filter by time since listing' },
      [['all', 'Any age'], ['lt90', 'Listed under 90 days'], ['90-365', '90 days to 1 year'], ['1-2y', '1 to 2 years'], ['gt2y', 'Over 2 years'], ['unknown', 'Age unknown']].map(function (o) {
        return el('option', { value: o[0], text: o[1], selected: o[0] === state.ageBand ? 'selected' : null });
      })
    );
    ageSel.addEventListener('change', function () { state.ageBand = ageSel.value; writeHash(); render(); });
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token', onclick: function () { state.tab = 'pre-token'; render(); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live token', onclick: function () { state.tab = 'live'; render(); } });
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), catSel),
      el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), chainSel),
      el('div', { class: 'field' }, el('label', { for: 'age', text: 'Listed' }), ageSel),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Token status' }), el('div', { class: 'tabs' }, pre, live)),
      el('span', { class: 'count', text: state.tab === 'pre-token' ? rows().length + ' rows shown' : DATA.live.length + ' live-token protocols' })
    );
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = key === 'ratio' ? 1 : -1; } writeHash(); render(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' v' : ' ^' }) : null
      )
    );
  }

  function toggleCompare(slug) {
    var i = state.compare.indexOf(slug);
    if (i >= 0) state.compare.splice(i, 1);
    else if (state.compare.length < 2) state.compare.push(slug);
    else state.compare = [state.compare[1], slug];
    writeHash();
    render();
  }

  function comparePanel() {
    if (!state.compare.length) return null;
    var picked = state.compare.map(rowBySlug).filter(function (r) { return r; });
    var cards = picked.map(function (r) {
      return el('article', { class: 'compare-card' },
        el('div', { class: 'compare-head' },
          el('div', null,
            el('span', { class: 'brand-name', text: 'Rank ' + r.rank + ' of ' + DATA.board_size }),
            el('h3', { text: r.name }),
            el('p', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.join(', ') : 'an unnamed chain') })
          ),
          el('button', { class: 'close', type: 'button', text: 'Remove', onclick: function () { toggleCompare(r.slug); } })
        ),
        el('div', { class: 'equation' },
          el('div', null, el('span', { text: 'Implied value at $10,000' }), el('b', { class: 'num', text: fmtUsd(r.implied_value_usd) })),
          el('div', null, el('span', { text: 'Deposit : airdrop' }), el('b', { class: 'num', text: '$10,000 : ' + fmtUsd(r.implied_value_usd) })),
          el('div', null, el('span', { text: 'Implied token value' }), el('b', { class: 'num', text: fmtUsd(r.token_value_usd) })),
          el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(r.tvl_usd) })),
          el('div', null, el('span', { text: 'Seven-day growth' }), el('b', { class: 'num', text: fmtPct(r.change_7d) })),
          el('div', null, el('span', { text: 'Age with no token' }), el('b', { class: 'num', text: fmtAge(r.age_days) }))
        ),
        el('p', { class: 'sub compare-why', text: r.why_text }),
        el('ol', { class: 'steps compare-steps' }, r.farm_steps.slice(0, 4).map(function (s) {
          var at = s.indexOf(' Cost: ');
          return el('li', null, el('b', { text: at >= 0 ? s.slice(0, at) : s }), el('span', { class: 'cost', text: at >= 0 ? s.slice(at + 1) : '' }));
        })),
        el('button', { class: 'button primary', type: 'button', text: 'Open the full farm plan', onclick: function () { openDetail(r.slug); } })
      );
    });
    if (picked.length === 1) cards.push(el('article', { class: 'compare-card compare-empty' }, el('h3', { text: 'Pick a second protocol' }), el('p', { class: 'sub', text: 'Use Compare on another row to put it beside ' + picked[0].name + '. The board stays below.' })));
    return el('section', { class: 'panel compare', 'aria-label': 'Protocol comparison' },
      el('div', { class: 'compare-title' }, el('h2', { text: 'Comparison' }), el('span', { class: 'sub', text: 'The same numbers the board carries, side by side. The board stays below.' })),
      el('div', { class: 'compare-grid' }, cards)
    );
  }

  function boardTable() {
    var list = sortedRows(rows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; state.ageBand = 'all'; writeHash(); render(); } })
      ));
    }
    var max = list[0].implied_value_usd || 1;
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var inCompare = state.compare.indexOf(r.slug) >= 0;
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num', text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) })
        )),
        el('td', { class: 'num', text: fmtRatio(r.deposit_ratio) }),
        el('td', null, el('span', { class: 'status', text: 'The protocol has no token listed.' })),
        el('td', null, el('button', {
          class: 'button compare-btn', type: 'button', 'aria-pressed': inCompare ? 'true' : 'false', text: inCompare ? 'Compared' : 'Compare',
          onclick: function (e) { e.stopPropagation(); toggleCompare(r.slug); }
        }))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Pre-token protocols, strongest implied value first. Select a row for its model and farm plan; Compare puts two rows side by side.' }),
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'Age'),
            sortHeader('implied', 'Implied value'),
            sortHeader('ratio', 'TVL / implied'),
            el('th', { scope: 'col', text: 'Token' }),
            el('th', { scope: 'col', text: '' })
          )),
          tbody
        )
      )
    );
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', { class: 'num', text: 'live' }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name + (r.symbol ? ' (' + r.symbol + ')' : '') }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', null, el('span', { class: 'status live-status', text: 'Already trades' }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking and never called pre-token.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    );
  }

  // One SVG deposit curve: expected airdrop against deposit, log scale, $10,000 marked.
  // The SVG is built as markup and parsed by the page, so no namespace string is needed.
  function escAttr(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function curveSVG(points, title) {
    var W = 520, H = 190, PL = 46, PR = 34, PT = 12, PB = 26;
    var x0 = Math.log10(100), x1 = Math.log10(100000);
    var yMax = Math.max.apply(null, points.map(function (p) { return p.expected; })) * 1.1;
    function X(v) { return PL + ((Math.log10(v) - x0) / (x1 - x0)) * (W - PL - PR); }
    function Y(v) { return PT + (1 - v / yMax) * (H - PT - PB); }
    var line = points.map(function (p, i) { return (i === 0 ? 'M' : 'L') + X(p.deposit).toFixed(1) + ',' + Y(p.expected).toFixed(1); }).join(' ');
    var mark = points.filter(function (p) { return p.deposit === 10000; })[0];
    var inner = '<line x1="' + PL + '" y1="' + (H - PB) + '" x2="' + (W - PR) + '" y2="' + (H - PB) + '" stroke="#d8e2dc"/>' +
      '<line x1="' + PL + '" y1="' + PT + '" x2="' + PL + '" y2="' + (H - PB) + '" stroke="#d8e2dc"/>';
    [100, 1000, 10000, 100000].forEach(function (d) {
      inner += '<text x="' + X(d).toFixed(1) + '" y="' + (H - 8) + '" text-anchor="middle" font-size="10" fill="#5f6f67">' + (d >= 1000 ? '$' + (d / 1000) + 'k' : '$' + d) + '</text>';
    });
    inner += '<text x="4" y="' + (PT + 4) + '" font-size="10" fill="#5f6f67">' + escAttr(fmtUsd(yMax / 1.1)) + '</text>';
    inner += '<path d="' + line + '" fill="none" stroke="#0f7a5a" stroke-width="2"/>';
    if (mark) {
      inner += '<circle cx="' + X(10000).toFixed(1) + '" cy="' + Y(mark.expected).toFixed(1) + '" r="4.5" fill="#0f7a5a"/>';
      inner += '<text x="' + Math.min(X(10000) + 8, W - 110).toFixed(1) + '" y="' + Math.max(Y(mark.expected) - 8, PT + 10).toFixed(1) + '" font-size="11" fill="#16211c" font-weight="600">' + escAttr('$10,000 -> ' + fmtUsd(mark.expected)) + '</text>';
    }
    var wrap = document.createElement('div');
    wrap.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + escAttr(title) + '">' + inner + '</svg>';
    return wrap;
  }

  function modelPanel() {
    var m = DATA.model;
    var wf = DATA.walk_forward;
    var mc = DATA.median_curve;
    var curve = curveSVG(mc.points, 'Deposit curve for the median board protocol, ' + mc.name);
    return el('section', { class: 'panel model' },
      el('h2', { text: 'How implied value is computed' }),
      el('p', { class: 'sub', text: 'Every row is scored by one function of the snapshot figures. No protocol name is special-cased, and no row is hand-picked.' }),
      el('div', { class: 'formula' },
        'token value = tvl_usd x ' + m.base_multiple + ' x (1 + ' + m.growth_weight + ' x clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100) x maturity(age_days)' +
        ' ; farmer value = min($' + fmtInt(CAP) + ', ' + (m.airdrop_pct * 100) + '% x token value x ($' + fmtInt(DEPOSIT) + ' / tvl_usd)^' + m.dilution_exponent + ')'
      ),
      el('p', { class: 'sub', text: 'Maturity is ' + m.maturity_floor + ' + ' + m.maturity_range + ' x min(age, ' + m.maturity_days + ') / ' + m.maturity_days + ', then past ' + m.maturity_days + ' days it decays ' + (m.maturity_decay_per_year * 100) + '% a year to a ' + m.maturity_decay_floor + ' floor; an unknown age uses ' + m.unknown_age_days + ' days. Age is the time since the protocol was first listed, the best record of how long it has run with no token. The farmer’s share falls as TVL^' + m.dilution_exponent + ', not TVL, because competition for points grows slower than TVL: the big TVL includes passive capital that earns no points. The cap binds on no row in this snapshot. The model never predicts whether or when a token is issued.' }),
      el('h3', { text: 'Walk-forward check' }),
      el('p', { class: 'sub', text: 'The model re-run on the snapshot rewound seven days (each TVL divided by 1 + change_7d/100, the prior week’s growth unknown and set to 0, age minus seven days; ' + wf.n + ' rows): rank correlation ' + wf.spearman + ', top 10 overlap ' + wf.top10_overlap + '/10, median rank move ' + wf.median_abs_move + ' places, largest move ' + wf.max_abs_move + ' places (' + wf.max_mover_name + '). The ranking is stable week to week; one wild week does not reorder it.' }),
      el('h3', { text: 'What a deposit is worth' }),
      el('p', { class: 'sub', text: 'Expected airdrop against deposit for the median board protocol, ' + mc.name + ' (TVL ' + fmtUsd(mc.tvl_usd) + '). The curve bends down: each extra dollar buys less of the pool, so the $10,000 point is marked, not the maximum.' }),
      el('div', { class: 'chart' }, curve)
    );
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });

  function openDetail(slug) {
    var row = rowBySlug(slug);
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var recomputed = farmerOf(row);
    var steps = row.farm_steps;
    var curve = curveSVG(curveOf(row), 'Deposit curve for ' + row.name);
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'brand-name', text: 'Rank ' + row.rank + ' of ' + DATA.board_size }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') }),
        el('p', { class: 'sub', text: 'The protocol has no token listed.' })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Why this protocol is worth farming' }),
      el('p', { text: row.why_text })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Who should farm it' }),
      el('p', { text: row.who_text })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied value' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'Seven-day growth' }), el('b', { class: 'num', text: fmtPct(row.change_7d) })),
        el('div', null, el('span', { text: 'Age with no token' }), el('b', { class: 'num', text: fmtAge(row.age_days) })),
        el('div', null, el('span', { text: 'Growth multiplier' }), el('b', { class: 'num', text: String(row.growth_multiplier) })),
        el('div', null, el('span', { text: 'Maturity multiplier' }), el('b', { class: 'num', text: String(row.maturity_multiplier) })),
        el('div', null, el('span', { text: 'Implied token value' }), el('b', { class: 'num', text: fmtUsd(row.token_value_usd) })),
        el('div', null, el('span', { text: 'Farmer’s share of the pool' }), el('b', { class: 'num', text: (row.farmer_share * 100).toFixed(2) + '%' })),
        el('div', null, el('span', { text: 'Implied value at $10,000' }), el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) })),
        el('div', null, el('span', { text: 'Deposit : airdrop' }), el('b', { class: 'num', text: '$10,000 : ' + fmtUsd(row.implied_value_usd) }))
      ),
      el('p', { class: 'sub', text: 'Model ' + DATA.model_version + ': the same function scores every protocol. The page recomputes this row as ' + fmtUsd(recomputed) + (recomputed === row.implied_value_usd ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.') + ' Capped at $' + fmtInt(CAP) + ' (3x the deposit); the cap binds on no row in this snapshot. This is an estimate, not a price.' })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'What a deposit is worth' }),
      el('p', { class: 'sub', text: 'Expected airdrop against deposit, same formula, ten deposit levels. The $10,000 point is marked.' }),
      el('div', { class: 'chart' }, curve)
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan: $10,000 deposit, $2,000 a month, 6 months' }),
      el('ol', { class: 'steps' }, steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      }))
    ));
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(lede());
    shell.appendChild(controls());
    var cmp = comparePanel();
    if (cmp) shell.appendChild(cmp);
    shell.appendChild(state.tab === 'pre-token' ? boardTable() : liveTable());
    if (state.tab === 'pre-token') shell.appendChild(modelPanel());
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();
