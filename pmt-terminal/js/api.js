// ════════════════════════════════════
//  API — auth, WebSocket, data loading
// ════════════════════════════════════

// ── CLOCK ───────────────────────────
setInterval(() => {
  document.getElementById('clock').textContent =
    new Date().toUTCString().split(' ')[4] + ' UTC';
}, 1000);

// ── MODAL — BOTH KEYS REQUIRED ───────
function getModalKeys() {
  return {
    fh: document.getElementById('m-key').value.trim(),
    mv: document.getElementById('massive-key').value.trim()
  };
}

document.getElementById('m-key').addEventListener('input', () => {
  document.getElementById('mgo').classList.remove('active');
  setTestState('idle', 'Enter both keys above, then test');
});
document.getElementById('massive-key').addEventListener('input', () => {
  document.getElementById('mgo').classList.remove('active');
  setTestState('idle', 'Enter both keys above, then test');
});

document.getElementById('m-key').addEventListener('keydown', e => { if (e.key === 'Enter') testKeys(); });
document.getElementById('massive-key').addEventListener('keydown', e => { if (e.key === 'Enter') testKeys(); });

async function testKeys() {
  const { fh, mv } = getModalKeys();
  if (!fh || !mv) {
    setTestState('err', 'Enter both Finnhub and Massive keys');
    return;
  }
  setTestState('chk', 'Testing both keys…');
  document.getElementById('mtest-btn').textContent = '…';
  let fhOk = false, mvOk = false;
  try {
    const [fr, mr] = await Promise.all([
      fetch(`${FH}/quote?symbol=AAPL&token=${fh}`).then(r => r.json()),
      fetch(`${MASSIVE}/v2/aggs/ticker/AAPL/prev?apiKey=${encodeURIComponent(mv)}`).then(r => r.json())
    ]);
    if (fr && typeof fr.c === 'number') fhOk = true;
    if (mr && mr.results && Array.isArray(mr.results) && mr.results.length) mvOk = true;
    if (fhOk && mvOk) {
      setTestState('ok', '✓ Both keys valid — ready to launch');
      document.getElementById('mgo').classList.add('active');
    } else if (!fhOk && !mvOk) {
      setTestState('err', '✗ Both keys failed — check Finnhub & Massive');
    } else if (!fhOk) {
      setTestState('err', '✗ Finnhub key invalid — check finnhub.io');
    } else {
      setTestState('err', '✗ Massive key invalid — check massive.com');
    }
  } catch (e) {
    setTestState('err', '✗ ' + (e.message || 'Network error'));
  }
  document.getElementById('mtest-btn').textContent = 'Test Keys';
}

function setTestState(state, msg) {
  const d = document.getElementById('mtd');
  const t = document.getElementById('mtxt');
  d.className = state === 'ok'  ? 'ok'
              : state === 'err' ? 'err'
              : state === 'chk' ? 'chk'
              : '';
  t.textContent = msg;
  t.style.color = state === 'ok'  ? 'var(--g)'
                : state === 'err' ? 'var(--r)'
                : 'var(--dim)';
}

function launch() {
  const { fh, mv } = getModalKeys();
  if (!fh || !mv) return;
  KEY = fh;
  MASSIVE_KEY = mv;
  document.getElementById('modal').style.display = 'none';
  setApiStatus('live', 'Live');
  initCharts();
  startNews();
  initTicker();
  initBacktestDates();
  initStream();
  initWS();
  initAnalyticsPanel();
}

function setApiStatus(state, label) {
  document.getElementById('apd').className = 'apd ' + state;
  document.getElementById('apl').textContent = label;
}

// ── NAV ─────────────────────────────
function switchView(id, btn) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('on'));
  document.getElementById(id).classList.add('on');
  document.querySelectorAll('.nb').forEach(b => b.classList.remove('on'));
  if (btn) btn.classList.add('on');
  if (id === 'cv') setTimeout(resizeCharts, 50);
}

function goBacktest() {
  if (curSym) document.getElementById('bs').value = curSym;
  switchView('bv', document.querySelectorAll('.nb')[1]);
}

// ── WEBSOCKET — real-time prices ─────
function initWS() {
  try {
    ws2 = new WebSocket(`wss://ws.finnhub.io?token=${KEY}`);
    ws2.onopen = () => {
      TICKER.forEach(s => {
        const sym = s === 'BTC'    ? 'BINANCE:BTCUSDT'
                  : s === 'ETH'    ? 'BINANCE:ETHUSDT'
                  : s === 'EURUSD' ? 'OANDA:EUR_USD'
                  : s;
        ws2.send(JSON.stringify({ type: 'subscribe', symbol: sym }));
      });
      if (curSym) wsSubscribe(curSym);
    };
    ws2.onmessage = e => {
      const d = JSON.parse(e.data);
      if (d.type !== 'trade' || !d.data) return;
      d.data.forEach(t => {
        const sym = t.s
          .replace('BINANCE:', '').replace('USDT', '')
          .replace('-USD', '').replace('OANDA:', '').replace('_', '');
        liveQuotes[sym] = t.p;
        const norm = curSym ? normSym(curSym).finnhub : '';
        if (curSym && (t.s === curSym || t.s === norm)) {
          const ts = t.t != null ? Math.floor(t.t / 1000) : Math.floor(Date.now() / 1000);
          onRealtimeTrade(ts, t.p, t.v);
        }
      });
    };
    ws2.onerror = () => {};
  } catch (e) {}
}

function wsSubscribe(sym) {
  if (!ws2 || ws2.readyState !== 1) return;
  ws2.send(JSON.stringify({ type: 'subscribe', symbol: normSym(sym).finnhub }));
}

// ── SYMBOL NORMALIZER ────────────────
function normSym(sym) {
  sym = sym.toUpperCase().trim();
  // Crypto
  if (sym.includes('-USD') || sym.includes('-USDT')) {
    const base = sym.replace('-USD', '').replace('-USDT', '');
    return { type: 'crypto', finnhub: `BINANCE:${base}USDT`, display: sym };
  }
  // Forex
  if (sym.endsWith('=X')) {
    const p = sym.replace('=X', '');
    return { type: 'forex', finnhub: `OANDA:${p.slice(0,3)}_${p.slice(3)}`, display: sym };
  }
  if (sym.length === 6 && /^[A-Z]{6}$/.test(sym)) {
    return { type: 'forex', finnhub: `OANDA:${sym.slice(0,3)}_${sym.slice(3)}`, display: sym };
  }
  // Index
  if (sym.startsWith('^')) {
    return { type: 'index', finnhub: sym, display: sym };
  }
  return { type: 'stock', finnhub: sym, display: sym };
}

// ── TICKER TAPE (Finnhub for crypto/forex, Massive prev-day for stocks when MASSIVE_KEY set) ─────
const TICKER_LABELS = {
  AAPL:'Apple', MSFT:'Microsoft', NVDA:'NVIDIA', TSLA:'Tesla',
  SPY:'S&P 500', QQQ:'NASDAQ', BTC:'Bitcoin', ETH:'Ethereum',
  EURUSD:'EUR/USD', GLD:'Gold ETF'
};
const TICKER_STOCKS = ['AAPL','MSFT','NVDA','TSLA','SPY','QQQ','GLD'];

async function initTicker() {
  await refreshTicker();
  setInterval(refreshTicker, 60000);
}

async function fetchTickerMassive() {
  if (!MASSIVE_KEY || !TICKER_STOCKS.length) return [];
  try {
    const results = await Promise.allSettled(TICKER_STOCKS.map(async s => {
      const r = await fetch(`${MASSIVE}/v2/aggs/ticker/${s}/prev?apiKey=${MASSIVE_KEY}`);
      const j = await r.json().catch(() => ({}));
      if (!j.results || !j.results.length) return null;
      const bar = j.results[0];
      if (bar.c == null) return null;
      const chg = bar.o ? ((bar.c - bar.o) / bar.o * 100) : 0;
      return { sym: s, label: TICKER_LABELS[s] || s, price: bar.c, chg };
    }));
    return results.map(r => r.status === 'fulfilled' ? r.value : null).filter(Boolean);
  } catch (e) { return []; }
}

async function refreshTicker() {
  let items = [];
  if (MASSIVE_KEY && TICKER_STOCKS.length) {
    items = await fetchTickerMassive();
  }
  const stockSyms = new Set(items.map(d => d.sym));
  const rest = TICKER.filter(s => !stockSyms.has(s));
  if (rest.length) {
    const results = await Promise.allSettled(rest.map(async s => {
      const sym = s === 'BTC' ? 'BINANCE:BTCUSDT' : s === 'ETH' ? 'BINANCE:ETHUSDT' : s === 'EURUSD' ? 'OANDA:EUR_USD' : s;
      const r = await fetch(`${FH}/quote?symbol=${sym}&token=${KEY}`);
      const j = await r.json().catch(() => ({}));
      if (typeof j.c === 'number' && j.c > 0) {
        const chg = (j.dp != null ? j.dp : (j.pc ? (j.c - j.pc) / j.pc * 100 : 0));
        return { sym: s, label: TICKER_LABELS[s] || s, price: j.c, chg };
      }
      return null;
    }));
    const fromFh = results.map(r => r.value).filter(Boolean);
    items = items.concat(fromFh);
  }
  items.sort((a, b) => TICKER.indexOf(a.sym) - TICKER.indexOf(b.sym));
  if (!items.length) return;
  const html = items.map(d => {
    const cls = d.chg > 0.05 ? 'up' : d.chg < -0.05 ? 'dn' : 'fl';
    const sign = d.chg > 0 ? '+' : '';
    return `<div class="t-item">
      <span class="t-sym">${d.sym}</span>
      <span class="t-px">${fmtP(d.price)}</span>
      <span class="t-ch ${cls}">${sign}${(d.chg || 0).toFixed(2)}%</span>
    </div>`;
  }).join('');
  const tt = document.getElementById('tape-track');
  if (tt) tt.innerHTML = html + html;
}

// ── LOAD SYMBOL (real-time only: quote once, then WebSocket) ────────
async function loadSym(sym) {
  if (!KEY) return;
  curSym = sym.toUpperCase();
  document.getElementById('si').value = curSym;

  const ns = normSym(curSym);
  curSymType = ns.type;

  const typeEl = document.getElementById('sym-type');
  typeEl.style.display = 'inline';
  typeEl.textContent = ns.type;
  typeEl.className = '';
  typeEl.id = 'sym-type';
  typeEl.classList.add(ns.type);

  setApiStatus('chk', 'Loading…');

  try {
    let c = null, j = {};
    const r = await fetch(`${FH}/quote?symbol=${encodeURIComponent(ns.finnhub)}&token=${KEY}`);
    j = await r.json().catch(() => ({}));
    if (r.ok && typeof j.c === 'number') c = j.c;
    if (c == null && MASSIVE_KEY && (ns.type === 'stock' || ns.type === 'index')) {
      const sym = ns.finnhub.replace(/^OANDA:|BINANCE:/, '').split('_')[0];
      const mr = await fetch(`${MASSIVE}/v2/aggs/ticker/${encodeURIComponent(sym)}/prev?apiKey=${MASSIVE_KEY}`);
      const mj = await mr.json().catch(() => ({}));
      if (mj.results && mj.results[0] && mj.results[0].c != null) c = mj.results[0].c;
    }
    if (c == null) {
      if (r.status === 401 || (j && j.error)) setApiStatus('err', 'Invalid key or symbol');
      else setApiStatus('err', 'No quote for symbol');
      showChartPlaceholder(true);
      return;
    }
    const now = Math.floor(Date.now() / 1000);
    rawData = [{ time: now, open: c, high: c, low: c, close: c, volume: 0 }];
    document.getElementById('px').textContent = fmtP(c);
    const ch = j.dp != null ? j.dp : (j.pc ? (j.c - j.pc) / j.pc * 100 : 0);
    const el = document.getElementById('pch');
    el.textContent = (ch >= 0 ? '+' : '') + (ch || 0).toFixed(2) + '%';
    el.className = ch >= 0 ? 'up' : 'dn';
    document.getElementById('oo').textContent = fmtP(j.o != null ? j.o : c);
    document.getElementById('oh').textContent = fmtP(j.h != null ? j.h : c);
    document.getElementById('ol').textContent = fmtP(j.l != null ? j.l : c);
    document.getElementById('oc').textContent = fmtP(c);
    document.getElementById('ov').textContent = '—';

    showChartPlaceholder(false);
    rebuildSeries();
    setApiStatus('live', 'Live');
    wsSubscribe(curSym);
  } catch (e) {
    setApiStatus('err', 'Network error');
    document.getElementById('px').textContent = '—';
    showChartPlaceholder(true);
  }
}

function showChartPlaceholder(show) {
  const msg = document.getElementById('quote-only-msg');
  if (msg) msg.style.display = show === true ? 'flex' : 'none';
  if (show === true) {
    rawData = [];
    if (typeof mc !== 'undefined' && ms) { try { mc.removeSeries(ms); } catch (e) {} }
    ms = null;
    if (typeof rebuildSeries === 'function') rebuildSeries();
  }
}

// Called from WebSocket when a new trade arrives for the current symbol
function onRealtimeTrade(time, price, volume) {
  if (!curSym || !rawData.length) return;
  const bar = { time, open: price, high: price, low: price, close: price, volume: volume || 0 };
  rawData.push(bar);
  document.getElementById('px').textContent = fmtP(price);
  if (typeof appendRealtimePoint === 'function') appendRealtimePoint(time, price, volume);
  if (rawData.length > 1) {
    const last = rawData[rawData.length - 1];
    const prev = rawData[rawData.length - 2];
    const ch = prev.close ? (last.close - prev.close) / prev.close * 100 : 0;
    const el = document.getElementById('pch');
    el.textContent = (ch >= 0 ? '+' : '') + ch.toFixed(2) + '%';
    el.className = ch >= 0 ? 'up' : 'dn';
  }
}

async function fetchQuote(ns) {
  try {
    if (ns.type === 'crypto' || ns.type === 'forex') return; // candle data sufficient
    const r = await fetch(`${FH}/quote?symbol=${ns.finnhub}&token=${KEY}`);
    const j = await r.json();
    if (typeof j.c === 'number' && j.c > 0) {
      document.getElementById('px').textContent = fmtP(j.c);
      const ch = j.dp || ((j.c - j.pc) / j.pc * 100);
      const el = document.getElementById('pch');
      el.textContent = (ch >= 0 ? '+' : '') + ch.toFixed(2) + '%';
      el.className = ch >= 0 ? 'up' : 'dn';
    }
  } catch (e) {}
}

// ── BLOOMBERG-STYLE SHORTCUTS (FX, EQT, CRPT) ─────
const SHORTCUTS = {
  FX: [
    { symbol: 'EURUSD', name: 'Euro / US Dollar' },
    { symbol: 'GBPUSD', name: 'British Pound / US Dollar' },
    { symbol: 'USDJPY', name: 'US Dollar / Japanese Yen' },
    { symbol: 'AUDUSD', name: 'Australian Dollar / US Dollar' },
    { symbol: 'USDCAD', name: 'US Dollar / Canadian Dollar' },
    { symbol: 'USDCHF', name: 'US Dollar / Swiss Franc' },
    { symbol: 'NZDUSD', name: 'New Zealand Dollar / US Dollar' },
    { symbol: 'EURGBP', name: 'Euro / British Pound' }
  ],
  EQT: [
    { symbol: 'AAPL', name: 'Apple Inc' },
    { symbol: 'MSFT', name: 'Microsoft Corp' },
    { symbol: 'GOOGL', name: 'Alphabet (Google)' },
    { symbol: 'AMZN', name: 'Amazon.com' },
    { symbol: 'NVDA', name: 'NVIDIA Corp' },
    { symbol: 'META', name: 'Meta Platforms' },
    { symbol: 'TSLA', name: 'Tesla Inc' },
    { symbol: 'SPY', name: 'SPDR S&P 500 ETF' },
    { symbol: 'QQQ', name: 'Invesco QQQ Trust' }
  ],
  CRPT: [
    { symbol: 'BTC', name: 'Bitcoin' },
    { symbol: 'ETH', name: 'Ethereum' },
    { symbol: 'BNB', name: 'Binance Coin' },
    { symbol: 'SOL', name: 'Solana' },
    { symbol: 'XRP', name: 'Ripple' },
    { symbol: 'DOGE', name: 'Dogecoin' },
    { symbol: 'ADA', name: 'Cardano' },
    { symbol: 'AVAX', name: 'Avalanche' }
  ]
};

// ── SYMBOL SEARCH ────────────────────
function setupSearch() {
  const inp = document.getElementById('si');
  const dd  = document.getElementById('sd');
  let t;
  inp.addEventListener('input', () => {
    clearTimeout(t);
    const q = inp.value.trim().toUpperCase();
    if (!q) { dd.style.display = 'none'; return; }
    if (SHORTCUTS[q]) {
      showShortcutDropdown(q);
      return;
    }
    t = setTimeout(() => doSearch(inp.value.trim()), 320);
  });
  inp.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      dd.style.display = 'none';
      const s = inp.value.trim().toUpperCase();
      if (s) loadSym(s);
    }
    if (e.key === 'Escape') dd.style.display = 'none';
  });
  document.addEventListener('click', e => {
    if (!e.target.closest('#sw')) dd.style.display = 'none';
  });
}

function showShortcutDropdown(key) {
  const dd = document.getElementById('sd');
  const list = SHORTCUTS[key];
  if (!list) return;
  const labels = { FX: 'Forex', EQT: 'Equities', CRPT: 'Crypto' };
  dd.innerHTML = '<div class="si-header" style="padding:6px 10px;font-size:9px;text-transform:uppercase;letter-spacing:1px;color:var(--dim)">' + (labels[key] || key) + '</div>' +
    list.map(x =>
      `<div class="si-item" onclick="pickSym('${esc(x.symbol)}')">
         <span class="si-sym">${esc(x.symbol)}</span>
         <span class="si-nm">${esc(x.name)}</span>
       </div>`
    ).join('');
  dd.style.display = 'block';
}

async function doSearch(q) {
  if (!KEY) return;
  const dd = document.getElementById('sd');
  const u = q.toUpperCase();
  if (SHORTCUTS[u]) { showShortcutDropdown(u); return; }
  const qEnc = encodeURIComponent(q);
  let results = [];
  try {
    const fhPromise = fetch(`${FH}/search?q=${qEnc}&token=${KEY}`).then(r => r.json());
    const mvPromise = MASSIVE_KEY ? fetch(`${MASSIVE}/v3/reference/tickers?search=${qEnc}&active=true&limit=8&apiKey=${MASSIVE_KEY}`).then(r => r.json()) : Promise.resolve(null);
    const [fj, mj] = await Promise.all([fhPromise, mvPromise]);
    results = (fj.result || []).filter(x => x.type && x.type !== 'EQS').map(x => ({ symbol: x.symbol, description: x.description }));
    if (mj && mj.results && Array.isArray(mj.results)) {
      const seen = new Set(results.map(x => x.symbol.toUpperCase()));
      mj.results.forEach(x => {
        const sym = (x.ticker || '').toUpperCase();
        if (sym && !seen.has(sym)) {
          seen.add(sym);
          results.push({ symbol: sym, description: x.name || ('Massive: ' + sym) });
        }
      });
    }
    results = results.slice(0, 10);
    if (!results.length) { dd.style.display = 'none'; return; }
    dd.innerHTML = results.map(x =>
      `<div class="si-item" onclick="pickSym('${esc(x.symbol)}')">
         <span class="si-sym">${esc(x.symbol)}</span>
         <span class="si-nm">${esc(x.description || '')}</span>
       </div>`
    ).join('');
    dd.style.display = 'block';
  } catch (e) {
    dd.style.display = 'none';
  }
}

function pickSym(s) {
  document.getElementById('si').value = s;
  document.getElementById('sd').style.display = 'none';
  loadSym(s);
}

// ── FINNHUB CANDLE DATA (for backtest) ─────
async function fetchFinnhubCandles(symbol, days) {
  if (!KEY) { console.warn('[Backtest] No Finnhub key'); return null; }
  const ns = normSym(symbol);
  const to = Math.floor(Date.now() / 1000);
  const from = to - (days || 90) * 86400;
  const res = 'D';
  try {
    const endpoint = ns.type === 'crypto' ? 'crypto/candle' : 'stock/candle';
    const r = await fetch(`${FH}/${endpoint}?symbol=${encodeURIComponent(ns.finnhub)}&resolution=${res}&from=${from}&to=${to}&token=${KEY}`);
    const j = await r.json().catch(() => ({}));
    console.log(`[Backtest] Finnhub ${endpoint} for ${ns.finnhub}:`, j.s, j.c ? j.c.length + ' bars' : 'no data');
    if (j.s !== 'ok' || !j.c || !j.c.length) {
      // If stock endpoint failed for crypto, try crypto endpoint
      if (ns.type === 'crypto' && endpoint === 'stock/candle') {
        const r2 = await fetch(`${FH}/crypto/candle?symbol=${encodeURIComponent(ns.finnhub)}&resolution=${res}&from=${from}&to=${to}&token=${KEY}`);
        const j2 = await r2.json().catch(() => ({}));
        if (j2.s !== 'ok' || !j2.c || !j2.c.length) return null;
        return j2.t.map((t, i) => ({
          time: t, open: j2.o[i], high: j2.h[i], low: j2.l[i], close: j2.c[i], volume: j2.v[i] || 0
        }));
      }
      return null;
    }
    return j.t.map((t, i) => ({
      time: t, open: j.o[i], high: j.h[i], low: j.l[i], close: j.c[i], volume: j.v[i] || 0
    }));
  } catch (e) { console.error('[Backtest] Finnhub candle error:', e); return null; }
}

// ── MASSIVE HISTORY (for backtest when live data insufficient) ─────
async function fetchMassiveHistory(symbol, days) {
  if (!MASSIVE_KEY) { console.warn('[Backtest] No Massive key'); return null; }
  // Normalize: strip exchange prefixes for Massive (Polygon) API
  let ticker = symbol.toUpperCase().trim();
  if (ticker.includes(':')) ticker = ticker.split(':').pop(); // BINANCE:BTCUSDT → BTCUSDT
  if (ticker.includes('-USD')) ticker = 'X:' + ticker.replace('-', ''); // BTC-USD → X:BTCUSD
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - (days || 90));
  const dateFrom = from.toISOString().slice(0, 10);
  const dateTo = to.toISOString().slice(0, 10);
  try {
    const url = `${MASSIVE}/v2/aggs/ticker/${encodeURIComponent(ticker)}/range/1/day/${dateFrom}/${dateTo}?adjusted=true&sort=asc&limit=5000&apiKey=${MASSIVE_KEY}`;
    console.log(`[Backtest] Massive fetch: ${ticker}`, dateFrom, '→', dateTo);
    const r = await fetch(url);
    const j = await r.json().catch(() => ({}));
    console.log(`[Backtest] Massive response:`, j.status, j.resultsCount || 0, 'bars');
    if (!j.results || !Array.isArray(j.results) || !j.results.length) return null;
    return j.results.map(d => {
      const t = d.t / 1000; // Massive timestamps are in ms
      return { time: Math.floor(t), open: d.o, high: d.h, low: d.l, close: d.c, volume: d.v || 0 };
    });
  } catch (e) { console.error('[Backtest] Massive history error:', e); return null; }
}

// ── INDUSTRY & ASSET ANALYTICS PANEL ─────
const SECTOR_DEMO = [
  { name: 'Technology', pct: 2.4, etf: 'XLK' }, { name: 'Healthcare', pct: -0.3, etf: 'XLV' },
  { name: 'Financials', pct: 1.1, etf: 'XLF' }, { name: 'Energy', pct: -1.2, etf: 'XLE' },
  { name: 'Consumer Disc.', pct: 0.8, etf: 'XLY' }, { name: 'Industrials', pct: 0.2, etf: 'XLI' },
  { name: 'Materials', pct: -0.5, etf: 'XLB' }, { name: 'Utilities', pct: 0.6, etf: 'XLU' },
  { name: 'Real Estate', pct: -0.9, etf: 'XLRE' }, { name: 'Comm Services', pct: 1.5, etf: 'XLC' },
  { name: 'Cons. Staples', pct: 0.3, etf: 'XLP' },
];
// Asset class ETF proxies for live quotes
const ASSET_PROXIES = [
  { name: 'US Equities', sym: 'SPY', etf: 'SPY' },
  { name: 'Intl Equities', sym: 'VXUS', etf: 'VXUS' },
  { name: 'Crypto', sym: 'BINANCE:BTCUSDT', etf: 'BTC' },
  { name: 'Gold', sym: 'GLD', etf: 'GLD' },
  { name: 'Bonds', sym: 'TLT', etf: 'TLT' },
  { name: 'Commodities', sym: 'DBC', etf: 'DBC' },
  { name: 'Volatility', sym: 'VXX', etf: 'VXX' },
];
const ASSET_DEMO = ASSET_PROXIES.map(a => ({ ...a, pct: 0, price: null }));

const INDUSTRY_DEMO = [
  { name: 'Software & Cloud', pct: 3.1, tickers: 'MSFT, CRM, NOW' },
  { name: 'Semiconductors', pct: 2.8, tickers: 'NVDA, AMD, AVGO' },
  { name: 'Banks & Finance', pct: 0.9, tickers: 'JPM, BAC, GS' },
  { name: 'Biotech & Pharma', pct: -0.2, tickers: 'JNJ, PFE, MRNA' },
  { name: 'Oil & Gas', pct: -1.5, tickers: 'XOM, CVX, COP' },
  { name: 'E-Commerce & Retail', pct: 0.4, tickers: 'AMZN, WMT, COST' },
  { name: 'EV & Clean Energy', pct: 1.7, tickers: 'TSLA, ENPH, FSLR' },
  { name: 'Aerospace & Defense', pct: 0.6, tickers: 'LMT, RTX, BA' },
  { name: 'Media & Streaming', pct: -0.8, tickers: 'NFLX, DIS, CMCSA' },
  { name: 'Telecom', pct: 0.1, tickers: 'T, VZ, TMUS' },
];

function pctClass(pct) {
  if (pct > 0.05) return 'pos';
  if (pct < -0.05) return 'neg';
  return 'neu';
}

function initAnalyticsPanel() {
  const tryFetch = typeof KEY !== 'undefined' && KEY;
  // Sector heatmap — try Finnhub first
  if (tryFetch) {
    fetch(`${FH}/stock/sector-performance?token=${KEY}`)
      .then(r => r.json())
      .then(j => {
        const arr = Array.isArray(j) ? j : (j && j.data) ? j.data : (j && j.sectorPerformance) ? j.sectorPerformance : null;
        if (arr && arr.length) {
          const list = arr.map(s => ({ name: s.name || s.sector || s.industry || '—', pct: parseFloat(s.changesPercentage || s.pct || 0) }));
          renderSectorHeatmap(list);
        } else renderSectorHeatmap(SECTOR_DEMO);
      })
      .catch(() => renderSectorHeatmap(SECTOR_DEMO));
  } else {
    renderSectorHeatmap(SECTOR_DEMO);
  }
  // Asset classes — try live quotes from Finnhub
  if (tryFetch) {
    fetchAssetClassesLive();
  } else {
    renderAssetClasses(ASSET_DEMO);
  }
  renderIndustryList(INDUSTRY_DEMO);
  // Top movers via Massive snapshot
  if (typeof MASSIVE_KEY !== 'undefined' && MASSIVE_KEY) fetchMassiveSnapshot();
}

async function fetchAssetClassesLive() {
  const results = await Promise.allSettled(
    ASSET_PROXIES.map(a =>
      fetch(`${FH}/quote?symbol=${encodeURIComponent(a.sym)}&token=${KEY}`).then(r => r.json())
    )
  );
  const items = ASSET_PROXIES.map((a, i) => {
    const r = results[i];
    if (r.status === 'fulfilled' && r.value && typeof r.value.dp === 'number') {
      return { ...a, pct: r.value.dp, price: r.value.c };
    }
    return { ...a, pct: 0, price: null };
  });
  renderAssetClasses(items);
}

function fetchMassiveSnapshot() {
  const el = document.getElementById('massive-snapshot');
  if (!el) return;
  const syms = ['AAPL','MSFT','GOOGL','AMZN','NVDA','TSLA','META','JPM','V'];
  Promise.allSettled(syms.map(s =>
    fetch(`${MASSIVE}/v2/aggs/ticker/${s}/prev?apiKey=${MASSIVE_KEY}`).then(r => r.json())
  )).then(results => {
    const data = results.map((r, i) => {
      if (r.status !== 'fulfilled' || !r.value.results || !r.value.results.length) return null;
      const bar = r.value.results[0];
      return { symbol: syms[i], open: bar.o, close: bar.c };
    }).filter(Boolean);
    if (!data.length) return;
    el.innerHTML = '<div class="ap-section-title">Top movers · Prev-day snapshot</div><div class="industry-list">' +
      data.sort((a,b) => Math.abs(b.close/b.open-1) - Math.abs(a.close/a.open-1)).map(d => {
        const chg = d.open ? ((d.close - d.open) / d.open * 100) : 0;
        return `<div class="industry-row">
          <span class="label" style="min-width:50px;font-weight:700;color:var(--hi)">${esc(d.symbol||'')}</span>
          <span class="label" style="color:var(--dim)">$${(d.close||0).toFixed(2)}</span>
          <span class="val ${chg>=0?'up':'dn'}" style="margin-left:auto">${chg>=0?'+':''}${chg.toFixed(2)}%</span>
        </div>`;
      }).join('') + '</div>';
    el.style.display = 'block';
  }).catch(() => { el.style.display = 'none'; });
}

function renderSectorHeatmap(data) {
  const el = document.getElementById('sector-heatmap');
  if (!el) return;
  const list = Array.isArray(data) && data.length ? data : SECTOR_DEMO;
  el.innerHTML = list.map(s => {
    const name = (s.name || s.sector || '—').replace(/\s*\(.*\)/, '');
    const pct = typeof s.pct === 'number' ? s.pct : parseFloat(s.pct || s.changesPercentage || 0);
    const etf = s.etf ? `<span style="display:block;font-size:7px;opacity:.6;margin-top:1px">${s.etf}</span>` : '';
    return `<div class="heat-cell ${pctClass(pct)}" title="${name}: ${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%">${name}${etf}<span>${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%</span></div>`;
  }).join('');
}

function renderAssetClasses(data) {
  const el = document.getElementById('asset-classes');
  if (!el) return;
  el.innerHTML = data.map(a => {
    const cls = pctClass(a.pct);
    const priceStr = a.price != null ? `<span style="font-size:9px;color:var(--dim);margin-left:auto">$${a.price.toFixed(2)}</span>` : '';
    return `<div class="asset-item ${cls}" title="${a.name}: ${a.pct >= 0 ? '+' : ''}${a.pct.toFixed(2)}%">
      <span class="name">${a.name}<span style="display:block;font-size:8px;opacity:.5">${a.etf||''}</span></span>
      ${priceStr}
      <span class="pct ${a.pct >= 0 ? 'up' : 'dn'}" style="min-width:52px;text-align:right">${a.pct >= 0 ? '+' : ''}${a.pct.toFixed(2)}%</span>
    </div>`;
  }).join('');
}

function renderIndustryList(data) {
  const el = document.getElementById('industry-list');
  if (!el) return;
  el.innerHTML = data.map(a => {
    const tickers = a.tickers ? `<span style="font-size:8px;color:var(--dim);margin-left:6px">${a.tickers}</span>` : '';
    return `<div class="industry-row">
      <span class="label">${a.name}${tickers}</span>
      <span class="val ${a.pct >= 0 ? 'up' : 'dn'}">${a.pct >= 0 ? '+' : ''}${a.pct.toFixed(2)}%</span>
    </div>`;
  }).join('');
}
