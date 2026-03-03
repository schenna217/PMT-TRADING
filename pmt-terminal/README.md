# PMT Terminal

A professional financial terminal with live charts, backtesting, and analytics.

## Project Structure

```
pmt-terminal/
├── index.html          ← Main HTML (no inline JS or CSS)
├── .htaccess           ← Security rules (protect config, disable dir listing)
├── .gitignore          ← Keep secrets out of git
│
├── css/
│   └── terminal.css    ← All styles
│
├── js/
│   ├── config.js       ← Global state, constants, chart options
│   ├── utils.js        ← Pure helpers (fmtP, fmtVol, esc, etc.)
│   ├── api.js          ← Auth modal, WebSocket, ticker tape, loadSym
│   ├── chart.js        ← Chart init, series types, indicators, drawing tools
│   ├── news.js         ← News feed polling + live stream panel
│   ├── backtest.js     ← Full backtest engine (signals, simulation, rendering)
│   └── analytics.js    ← Analytics dashboard rendering
│
└── api/
    ├── config.php      ← 🔑 Your API key lives here (never committed)
    └── proxy.php       ← Server-side Finnhub proxy with caching + CORS
```

---

## Setup Options

### Option A — Static (no PHP, key in browser)

Just open `index.html` directly. On first launch, you'll be prompted to enter
your Finnhub API key. It's stored in memory only — you'll need to re-enter it
on each page load.

**No server required**, but your key will be visible in browser dev tools.

---

### Option B — PHP Proxy (recommended for production)

Hides your API key server-side, adds response caching, and handles CORS.

1. **Copy the project** to a PHP-capable web server (Apache/Nginx + PHP 7.4+).

2. **Add your key** to `api/config.php`:
   ```php
   define('FINNHUB_API_KEY', 'your_key_here');
   ```

3. **Switch the frontend to use the proxy** — in `js/config.js`, change:
   ```js
   window.FH = 'https://finnhub.io/api/v1';
   ```
   to:
   ```js
   window.FH = 'api/proxy.php';
   ```
   Then remove the startup modal entirely from `index.html` (no key input needed).

4. **Create the cache directory** and make it writable:
   ```bash
   mkdir .cache && chmod 700 .cache
   ```

5. **Verify** that `.htaccess` is active (Apache with `AllowOverride All`), so
   `api/config.php` and `.cache/` are blocked from direct browser access.

---

## Finnhub API

Get your free key at [finnhub.io](https://finnhub.io) — free tier supports:
- 60 API calls/minute
- Real-time WebSocket quotes
- US stocks, crypto, forex, ETFs

---

## Features

| Feature | Description |
|---|---|
| **Live Charts** | Candlestick, line, bar, area with multiple timeframes |
| **Indicators** | SMA, EMA, Bollinger Bands, RSI, MACD (all configurable) |
| **Drawing Tools** | Horizontal lines, trend lines, Fibonacci retracements |
| **Ticker Tape** | Live scrolling prices for 10 key instruments |
| **Backtest** | SMA cross, RSI, Bollinger, MACD, or custom JS strategy |
| **Analytics** | Sharpe, Sortino, Calmar, monthly heatmap, trade log |
| **News Feed** | Live Finnhub news with sentiment + threat classification |
| **Live Stream** | Embeddable Bloomberg/CNBC/Yahoo Finance streams |
