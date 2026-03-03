// ════════════════════════════════════
//  ANALYTICS VIEW
// ════════════════════════════════════

function renderAnalytics() {
  const ac = document.getElementById('an-c');
  if (!lastBT) { ac.style.display = 'none'; return; }
  ac.style.display = 'block';

  const { analytics: a, cap, sym, strat, from2, to2, trades, eq } = lastBT;
  const { tr, cagr, mdd, sharpe, sortino, wr, aw, al: al2, pf, calmar, monthly, rets } = a;

  document.getElementById('an-ttl').textContent = `${sym} — ${strat.toUpperCase()} Strategy`;
  document.getElementById('an-sub').textContent =
    `${from2} → ${to2} · $${cap.toLocaleString()} capital · ${trades.length} trades`;

  const grid = document.getElementById('an-grid');
  grid.innerHTML = '';

  // ── Performance Metrics ────────────
  const c1 = mkAC('Performance Metrics');
  [
    [' Total Return',   tr.toFixed(2) + '%',               tr >= 0],
    [' CAGR',           cagr.toFixed(2) + '%',             cagr >= 0],
    [' Sharpe',         sharpe.toFixed(3),                 sharpe >= 1],
    [' Sortino',        sortino.toFixed(3),                sortino >= 1],
    [' Max DD',         mdd.toFixed(2) + '%',              false],
    [' Calmar',         calmar.toFixed(3),                 calmar >= 0.5],
    [' Profit Factor',  isFinite(pf) ? pf.toFixed(3) : '∞', pf >= 1.5],
    [' Win Rate',       wr.toFixed(1) + '%',               wr >= 50],
  ].forEach(([l, v, g]) => {
    const tr2 = document.createElement('tr');
    tr2.innerHTML = `<td style="color:var(--dim)">${l}</td><td style="color:${g ? 'var(--g)' : 'var(--a)'}">${v}</td>`;
    c1.t.appendChild(tr2);
  });
  grid.appendChild(c1.el);

  // ── Sharpe Gauge ───────────────────
  const c2 = mkAC('Sharpe Quality');
  const gc  = sharpe >= 2 ? 'var(--g)' : sharpe >= 1 ? 'var(--a)' : 'var(--r)';
  const gla = sharpe >= 2 ? 'Excellent' : sharpe >= 1 ? 'Good' : sharpe >= 0 ? 'Marginal' : 'Poor';
  const gp  = Math.min(100, Math.max(0, (sharpe / 3) * 100));
  c2.b.innerHTML = `
    <div style="text-align:center;margin-bottom:10px">
      <div style="font-family:var(--sans);font-size:28px;font-weight:700;color:${gc}">${sharpe.toFixed(2)}</div>
      <div style="font-size:9px;color:var(--dim);margin-top:2px">${gla}</div>
    </div>
    <div class="gb"><div class="gf" style="width:${gp}%;background:${gc}"></div></div>
    <div style="display:flex;justify-content:space-between;font-size:8px;color:var(--dim);margin-top:3px">
      <span>0</span><span>1</span><span>2</span><span>3+</span>
    </div>
    <table class="mt" style="margin-top:12px">
      <tr><td style="color:var(--dim)">Sortino</td><td style="color:${sortino >= 1 ? 'var(--g)' : 'var(--a)'}">${sortino.toFixed(2)}</td></tr>
      <tr><td style="color:var(--dim)">Avg Win</td><td style="color:var(--g)">+${aw.toFixed(2)}%</td></tr>
      <tr><td style="color:var(--dim)">Avg Loss</td><td style="color:var(--r)">${al2.toFixed(2)}%</td></tr>
    </table>`;
  grid.appendChild(c2.el);

  // ── Return Histogram ───────────────
  const c3 = mkAC('Daily Return Distribution');
  const bins = Array.from({ length: 14 }, (_, i) => ({ min: -3.5 + i*.5, max: -3 + i*.5, n: 0 }));
  rets.forEach(r => {
    const p = r * 100, b = bins.find(b => p >= b.min && p < b.max);
    if (b) b.n++;
  });
  const mx = Math.max(...bins.map(b => b.n)) || 1;
  const hw = document.createElement('div');
  hw.className = 'hw';
  bins.forEach(b => {
    const bar = document.createElement('div');
    bar.className = 'hb ' + (b.min >= 0 ? 'p' : 'n');
    bar.style.height = (b.n / mx * 100) + '%';
    bar.title = `${b.min.toFixed(1)}%→${b.max.toFixed(1)}%: ${b.n}`;
    hw.appendChild(bar);
  });
  const mr2 = rets.reduce((a, b) => a+b, 0) / rets.length * 100;
  const sr2  = Math.sqrt(rets.reduce((a, b) => a+(b*100 - mr2)**2, 0) / rets.length);
  c3.b.appendChild(hw);
  c3.b.innerHTML += `
    <div style="display:flex;justify-content:space-between;font-size:8px;color:var(--dim);margin-top:5px">
      <span>−3.5%</span><span>0%</span><span>+3.5%</span>
    </div>
    <table class="mt" style="margin-top:10px">
      <tr><td style="color:var(--dim)">Mean daily</td><td style="color:var(--g)">${mr2.toFixed(4)}%</td></tr>
      <tr><td style="color:var(--dim)">Daily σ</td><td>${sr2.toFixed(4)}%</td></tr>
      <tr><td style="color:var(--dim)">Ann. vol</td><td>${(sr2 * Math.sqrt(252)).toFixed(2)}%</td></tr>
    </table>`;
  grid.appendChild(c3.el);

  // ── Monthly Heatmap ────────────────
  const c4 = mkAC('Monthly Returns Heatmap');
  c4.el.classList.add('full');
  const yrs  = [...new Set(monthly.map(m => m.yr))].sort();
  const MLAB = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  if (monthly.length) {
    let html = `<div style="overflow-x:auto"><table style="border-collapse:collapse;width:100%;font-size:10px">
      <thead><tr>
        <th style="color:var(--dim);text-align:left;padding:3px 8px;font-size:9px">Year</th>
        ${MLAB.map(m => `<th style="color:var(--dim);text-align:center;padding:3px 6px;font-size:9px;min-width:50px">${m}</th>`).join('')}
        <th style="color:var(--dim);padding:3px 8px;font-size:9px">Annual</th>
      </tr></thead><tbody>`;
    yrs.forEach(yr2 => {
      let ann = 1;
      const cells = MLAB.map((_, mo) => {
        const m = monthly.find(d => d.yr === yr2 && d.mn === mo);
        if (!m) return `<td style="padding:3px 6px;text-align:center"><div style="min-width:46px;height:24px;display:flex;align-items:center;justify-content:center;border-radius:2px;background:var(--border);color:var(--dim);font-size:9px">—</div></td>`;
        ann *= (1 + m.ret/100);
        const intn = Math.min(1, Math.abs(m.ret) / 5);
        const bg = m.ret >= 0
          ? `rgba(0,229,160,${.07 + intn*.32})`
          : `rgba(255,61,90,${.07 + intn*.32})`;
        return `<td style="padding:3px 6px;text-align:center"><div style="min-width:46px;height:24px;display:flex;align-items:center;justify-content:center;border-radius:2px;background:${bg};color:${m.ret >= 0 ? 'var(--g)' : 'var(--r)'};font-size:9px">${m.ret >= 0 ? '+' : ''}${m.ret.toFixed(1)}%</div></td>`;
      }).join('');
      const ap = (ann - 1) * 100;
      html += `<tr>
        <td style="padding:3px 8px;font-family:var(--sans);font-weight:700;color:var(--hi)">${yr2}</td>
        ${cells}
        <td style="padding:3px 8px;color:${ap >= 0 ? 'var(--g)' : 'var(--r)'};font-family:var(--sans);font-weight:700">
          ${ap >= 0 ? '+' : ''}${ap.toFixed(1)}%
        </td></tr>`;
    });
    html += '</tbody></table></div>';
    c4.b.innerHTML = html;
  } else {
    c4.b.innerHTML = '<div style="color:var(--dim);font-size:10px;text-align:center;padding:20px">Insufficient data for monthly breakdown</div>';
  }
  grid.appendChild(c4.el);

  // ── Trade Analysis ─────────────────
  const c5 = mkAC('Trade Analysis');
  const win  = trades.filter(t => t.pnl > 0);
  const los  = trades.filter(t => t.pnl <= 0);
  const best  = trades.reduce((b, t) => t.ret > (b?.ret ?? -Infinity) ? t : b, null);
  const worst = trades.reduce((w, t) => t.ret < (w?.ret ??  Infinity) ? t : w, null);
  const avgDur = trades.length > 0
    ? trades.reduce((a, t) => a + (t.exitTime - t.entryTime), 0) / trades.length / 86400
    : 0;
  const exp = (wr/100 * aw + (1 - wr/100) * al2);
  c5.b.innerHTML = `<table class="mt">
    <tr><td style="color:var(--dim)">Total Trades</td><td>${trades.length}</td></tr>
    <tr><td style="color:var(--dim)">Winners</td><td style="color:var(--g)">${win.length}</td></tr>
    <tr><td style="color:var(--dim)">Losers</td><td style="color:var(--r)">${los.length}</td></tr>
    <tr><td style="color:var(--dim)">Avg Duration</td><td>${avgDur.toFixed(1)} days</td></tr>
    <tr><td style="color:var(--dim)">Best Trade</td><td style="color:var(--g)">${best ? '+' + best.ret.toFixed(2) + '%' : '—'}</td></tr>
    <tr><td style="color:var(--dim)">Worst Trade</td><td style="color:var(--r)">${worst ? worst.ret.toFixed(2) + '%' : '—'}</td></tr>
    <tr><td style="color:var(--dim)">Expectancy</td><td style="color:${exp >= 0 ? 'var(--g)' : 'var(--r)'}">${exp.toFixed(3)}%</td></tr>
  </table>`;
  grid.appendChild(c5.el);

  // ── Risk Metrics ───────────────────
  const c6 = mkAC('Risk Metrics');
  const pkEq = Math.max(...eq.map(e => e.value));
  const aVol = Math.sqrt(252) * Math.sqrt(
    rets.reduce((a, b) => a + (b - rets.reduce((a,b) => a+b, 0) / rets.length)**2, 0) / rets.length
  ) * 100;
  c6.b.innerHTML = `<table class="mt">
    <tr><td style="color:var(--dim)">Max Drawdown</td><td style="color:var(--r)">${mdd.toFixed(2)}%</td></tr>
    <tr><td style="color:var(--dim)">Ann. Volatility</td><td>${aVol.toFixed(2)}%</td></tr>
    <tr><td style="color:var(--dim)">Calmar Ratio</td><td style="color:${calmar >= 0.5 ? 'var(--g)' : 'var(--a)'}">${calmar.toFixed(3)}</td></tr>
    <tr><td style="color:var(--dim)">Sortino</td><td style="color:${sortino >= 1 ? 'var(--g)' : 'var(--a)'}">${sortino.toFixed(3)}</td></tr>
    <tr><td style="color:var(--dim)">Peak Equity</td><td style="color:var(--g)">$${pkEq.toFixed(0)}</td></tr>
    <tr><td style="color:var(--dim)">Final Equity</td><td style="color:${a.fv >= cap ? 'var(--g)' : 'var(--r)'}">$${a.fv.toFixed(0)}</td></tr>
  </table>`;
  grid.appendChild(c6.el);
}

// ── CARD BUILDER ─────────────────────
function mkAC(title) {
  const el = document.createElement('div');
  el.className = 'ac';
  const h = document.createElement('div');
  h.className = 'ac-h';
  const t = document.createElement('div');
  t.className = 'ac-t';
  t.textContent = title;
  h.appendChild(t);
  el.appendChild(h);
  const b = document.createElement('div');
  b.className = 'ac-b';
  el.appendChild(b);
  const ta = document.createElement('table');
  ta.className = 'mt';
  b.appendChild(ta);
  return { el, b, t: ta };
}
