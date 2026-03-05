// ════════════════════════════════════
//  "ARE YOU BORED?" — local poker mini-game
//  Single player vs 4 bots, runs entirely in the browser.
// ════════════════════════════════════

window.boredState = {
  players: [],      // { id, name, wins, lastHandType, cards:[], strength:[] }
  community: [],    // 5 board cards
  status: 'idle',   // 'idle' | 'dealt'
  phase: 'idle',    // 'idle' | 'yourTurn' | 'bots' | 'showdown'
  resultText: '',
  handCount: 0,
  actions: [],      // textual action log for this hand
};

const BORED_PLAYER_NAMES = ['You', 'Bot 1', 'Bot 2', 'Bot 3', 'Bot 4'];

function initArcadeView() {
  const root = document.getElementById('gv');
  if (!root) return;
  if (document.getElementById('bored-root')) return;

  // Create base UI shell
  root.innerHTML = `
    <div id="bored-root">
      <div class="arcade-header">
        <div class="arcade-title">
          <span>Are You Bored?</span>
          <span class="arcade-pill">Quick poker vs PMT bots</span>
        </div>
        <div class="arcade-sub">
          Deal instant Texas Hold'em hands against four bots. No accounts, no server — just quick decisions.
        </div>
      </div>
      <div class="arcade-layout">
        <div class="arcade-left">
          <div class="arcade-card">
            <div class="arcade-card-title">Your table</div>
            <div class="arcade-field">
              <label>Nickname</label>
              <input id="bored-nick" type="text" maxlength="16" placeholder="You" autocomplete="off" />
              <div class="arcade-hint">Optional — rename yourself for this session.</div>
            </div>
            <button id="bored-deal-btn" onclick="boredDealHand()">Deal new hand</button>
            <div id="bored-status" class="arcade-status">No hands played yet.</div>
          </div>
          <div class="arcade-card">
            <div class="arcade-card-title">Scoreboard</div>
            <ul id="bored-players" class="arcade-list"></ul>
          </div>
        </div>
        <div class="arcade-right">
          <div class="arcade-card arcade-table">
            <div class="arcade-card-title">Table view</div>
            <div id="bored-table-status" class="arcade-table-status">Click "Deal new hand" to start.</div>
            <div id="bored-table-view" class="arcade-table-view">
              <div class="arcade-table-placeholder">
                <div class="arcade-table-logo">PMT</div>
                <p>We’ll deal you two cards and five community cards.<br>
                Highest Texas Hold'em hand wins each round.</p>
              </div>
            </div>
          </div>
          <div class="arcade-card">
            <div class="arcade-card-title">How it works</div>
            <div class="arcade-howto">
              <p>This is a fast, local Texas Hold'em simulator:</p>
              <ol>
                <li>You and four bots each get two cards.</li>
                <li>Five community cards are dealt on the board.</li>
                <li>We evaluate the best 5-card hand out of 7 cards for each player.</li>
                <li>Winner(s) get a point on the scoreboard.</li>
              </ol>
              <p>No betting, just quick hands to wake your brain up when you’re bored.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  // Initialize players
  boredState.players = BORED_PLAYER_NAMES.map((name, idx) => ({
    id: idx,
    name,
    wins: 0,
    lastHandType: '',
    cards: [],
    strength: null,
  }));

  boredRender();
}

// ── GAME FLOW ────────────────────────

function boredDealHand() {
  const nickEl = document.getElementById('bored-nick');
  if (nickEl) {
    const nick = nickEl.value.trim();
    if (nick) boredState.players[0].name = nick;
    else boredState.players[0].name = 'You';
  }

  const deck = boredBuildDeck();
  boredShuffle(deck);

  // Deal 2 hole cards to each of 5 players
  boredState.players.forEach(p => {
    p.cards = [deck.pop(), deck.pop()];
    p.strength = null;
    p.lastHandType = '';
  });

  // Deal 5 community cards
  boredState.community = [deck.pop(), deck.pop(), deck.pop(), deck.pop(), deck.pop()];
  boredState.status = 'dealt';
  boredState.phase = 'yourTurn';
  boredState.handCount += 1;
  boredState.actions = [];
  boredState.resultText = '';

  boredRender();
}

function boredAct(choice) {
  if (boredState.status !== 'dealt' || boredState.phase !== 'yourTurn') return;

  boredState.phase = 'bots';
  boredState.actions = [];

  const youText = choice === 'raise'
    ? 'You raise the stakes.'
    : 'You decide to hold / check.';
  boredState.actions.push(youText);

  // Simple bot behavior: mostly call/hold, occasionally fold or "light raise" for flavor.
  boredState.players.slice(1).forEach(bot => {
    const r = Math.random();
    let line = '';
    if (choice === 'raise') {
      if (r < 0.2) line = `${bot.name} folds.`;
      else if (r < 0.9) line = `${bot.name} calls your raise.`;
      else line = `${bot.name} re-raises light.`;
    } else {
      if (r < 0.1) line = `${bot.name} bets into the pot.`;
      else line = `${bot.name} checks.`;
    }
    boredState.actions.push(line);
  });

  // Go straight to showdown after a single decision round.
  boredEvaluateHands();
  boredState.phase = 'showdown';
  boredRender();
}

// ── DECK HELPERS ─────────────────────

function boredBuildDeck() {
  const ranks = ['2','3','4','5','6','7','8','9','T','J','Q','K','A'];
  const suits = ['♠','♥','♦','♣'];
  const deck = [];
  for (let r of ranks) {
    for (let s of suits) deck.push(r + s);
  }
  return deck;
}

function boredShuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
}

// ── HAND EVALUATION ──────────────────

function boredEvaluateHands() {
  const all = [];
  boredState.players.forEach(p => {
    const seven = p.cards.concat(boredState.community);
    const { rankVec, handType } = boredBest5Of7(seven);
    p.strength = rankVec;
    p.lastHandType = handType;
    all.push({ player: p, rankVec });
  });

  // Find winner(s)
  all.sort((a, b) => boredCompareRankVec(b.rankVec, a.rankVec));
  const best = all[0].rankVec;
  const winners = all.filter(x => boredCompareRankVec(x.rankVec, best) === 0).map(x => x.player);

  winners.forEach(w => { w.wins += 1; });

  const typeName = winners[0]?.lastHandType || 'High Card';
  const names = winners.map(w => w.id === 0 ? (w.name || 'You') : w.name).join(', ');
  boredState.resultText = winners.length === 1
    ? `Winner: ${names} with ${typeName}.`
    : `Split pot: ${names} with ${typeName}.`;
}

function boredBest5Of7(cards7) {
  // Enumerate all 21 5-card combinations from 7 cards
  const idx = [0,1,2,3,4,5,6];
  let best = null;
  let bestType = 'High Card';
  for (let a = 0; a < 3; a++) {
    for (let b = a+1; b < 4; b++) {
      for (let c = b+1; c < 5; c++) {
        for (let d = c+1; d < 6; d++) {
          for (let e = d+1; e < 7; e++) {
            const hand = [idx[a],idx[b],idx[c],idx[d],idx[e]].map(i => cards7[i]);
            const { rankVec, handType } = boredRank5(hand);
            if (!best || boredCompareRankVec(rankVec, best) > 0) {
              best = rankVec;
              bestType = handType;
            }
          }
        }
      }
    }
  }
  return { rankVec: best, handType: bestType };
}

function boredRank5(cards5) {
  const rankValue = c => {
    const r = c[0];
    return r === 'A' ? 14 :
           r === 'K' ? 13 :
           r === 'Q' ? 12 :
           r === 'J' ? 11 :
           r === 'T' ? 10 : parseInt(r, 10);
  };
  const ranks = cards5.map(rankValue).sort((a,b) => b - a);
  const suits = cards5.map(c => c[1]);

  const counts = {};
  ranks.forEach(r => { counts[r] = (counts[r] || 0) + 1; });
  const entries = Object.entries(counts).map(([r,c]) => ({ r: +r, c }));
  entries.sort((a,b) => b.c - a.c || b.r - a.r);

  const isFlush = suits.every(s => s === suits[0]);

  // Straight detection (including wheel A-5)
  let uniqRanks = [...new Set(ranks)].sort((a,b) => b - a);
  let isStraight = false;
  let highStraight = uniqRanks[0];
  if (uniqRanks.length >= 5) {
    for (let i = 0; i <= uniqRanks.length - 5; i++) {
      const window = uniqRanks.slice(i, i+5);
      if (window[0] - window[4] === 4) {
        isStraight = true;
        highStraight = window[0];
        break;
      }
    }
    // Wheel A-5
    if (!isStraight && uniqRanks.includes(14) &&
        uniqRanks.includes(5) && uniqRanks.includes(4) &&
        uniqRanks.includes(3) && uniqRanks.includes(2)) {
      isStraight = true;
      highStraight = 5;
    }
  }

  let category = 0;
  let handType = 'High Card';
  let kickers = [];

  if (isStraight && isFlush) {
    category = 8;
    handType = highStraight === 14 ? 'Royal Flush' : 'Straight Flush';
    kickers = [highStraight];
  } else if (entries[0].c === 4) {
    category = 7;
    handType = 'Four of a Kind';
    const four = entries[0].r;
    const kicker = entries.find(e => e.r !== four).r;
    kickers = [four, kicker];
  } else if (entries[0].c === 3 && entries[1].c === 2) {
    category = 6;
    handType = 'Full House';
    kickers = [entries[0].r, entries[1].r];
  } else if (isFlush) {
    category = 5;
    handType = 'Flush';
    kickers = ranks.slice();
  } else if (isStraight) {
    category = 4;
    handType = 'Straight';
    kickers = [highStraight];
  } else if (entries[0].c === 3) {
    category = 3;
    handType = 'Three of a Kind';
    const trips = entries[0].r;
    const rest = entries.filter(e => e.r !== trips).map(e => e.r).sort((a,b)=>b-a);
    kickers = [trips].concat(rest);
  } else if (entries[0].c === 2 && entries[1].c === 2) {
    category = 2;
    handType = 'Two Pair';
    const pair1 = Math.max(entries[0].r, entries[1].r);
    const pair2 = Math.min(entries[0].r, entries[1].r);
    const kicker = entries.find(e => e.c === 1).r;
    kickers = [pair1, pair2, kicker];
  } else if (entries[0].c === 2) {
    category = 1;
    handType = 'One Pair';
    const pair = entries[0].r;
    const rest = entries.filter(e => e.r !== pair).map(e => e.r).sort((a,b)=>b-a);
    kickers = [pair].concat(rest);
  } else {
    category = 0;
    handType = 'High Card';
    kickers = ranks.slice();
  }

  return { rankVec: [category].concat(kickers), handType };
}

function boredCompareRankVec(a, b) {
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const av = a[i] || 0;
    const bv = b[i] || 0;
    if (av > bv) return 1;
    if (av < bv) return -1;
  }
  return 0;
}

// ── RENDERING ────────────────────────

function boredRender() {
  const list = document.getElementById('bored-players');
  if (list) {
    list.innerHTML = '';
    boredState.players.forEach(p => {
      const li = document.createElement('li');
      li.className = 'arcade-player' + (p.id === 0 ? ' me' : '');
      li.innerHTML = `
        <span class="arcade-player-name">${esc(p.name)}</span>
        <span class="arcade-player-stack">Wins: ${p.wins}</span>
        <span class="arcade-player-state">${p.lastHandType || ''}</span>`;
      list.appendChild(li);
    });
  }

  const tv = document.getElementById('bored-table-view');
  const ts = document.getElementById('bored-table-status');
  const st = document.getElementById('bored-status');

  if (st) {
    st.textContent = boredState.handCount
      ? boredState.resultText
      : 'No hands played yet.';
  }

  if (!tv || !ts) return;

  if (boredState.status !== 'dealt') {
    ts.textContent = 'Click "Deal new hand" to start.';
    tv.innerHTML = `
      <div class="arcade-table-placeholder">
        <div class="arcade-table-logo">PMT</div>
        <p>We’ll deal you two cards and five community cards.<br>
        Highest hand wins each round.</p>
      </div>`;
    return;
  }

  if (boredState.phase === 'yourTurn') {
    ts.textContent = `Hand #${boredState.handCount} · Your turn — choose Hold or Raise.`;
  } else if (boredState.phase === 'showdown') {
    ts.textContent = `Hand #${boredState.handCount} · ${boredState.resultText}`;
  } else {
    ts.textContent = `Hand #${boredState.handCount}`;
  }

  const board = boredState.community.map(c => `<div class="card">${esc(c)}</div>`).join('');

  const rows = boredState.players.map(p => {
    const cards = p.cards.map(c => `<div class="card">${esc(c)}</div>`).join('');
    const isYou = p.id === 0;
    return `
      <div class="bored-seat${isYou ? ' me' : ''}">
        <div class="bored-seat-head">
          <span class="seat-name">${esc(p.name)}</span>
          <span class="seat-meta">Wins: ${p.wins}${p.lastHandType ? ' · ' + p.lastHandType : ''}</span>
        </div>
        <div class="bored-seat-cards">${cards}</div>
      </div>`;
  }).join('');

  const actionsHtml = boredState.phase === 'yourTurn'
    ? `<div class="bored-actions">
         <button onclick="boredAct('hold')">Hold / Check</button>
         <button onclick="boredAct('raise')">Raise</button>
       </div>`
    : `<div class="bored-actions bored-actions-muted">
         Use "Deal new hand" on the left to play another round.
       </div>`;

  const logHtml = boredState.actions.length
    ? boredState.actions.map(l => `<div class="bored-log-line">${esc(l)}</div>`).join('')
    : '<div class="bored-log-line muted">Actions will appear here after you act.</div>';

  tv.innerHTML = `
    <div class="bored-table-grid">
      <div class="arcade-community">
        <div class="arcade-section-label">Board</div>
        <div class="arcade-cards">${board}</div>
      </div>
      <div class="bored-seats">
        ${rows}
      </div>
    </div>
    ${actionsHtml}
    <div class="bored-log">
      ${logHtml}
    </div>`;
}

function initArcadeOnReady() {
  if (document.getElementById('gv')) initArcadeView();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initArcadeOnReady);
} else {
  initArcadeOnReady();
}

