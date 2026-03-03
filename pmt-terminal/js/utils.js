// ════════════════════════════════════
//  UTILS — pure helper functions
// ════════════════════════════════════

/**
 * Format a price number with appropriate decimal places
 */
function fmtP(n) {
  if (!n && n !== 0) return '—';
  return n >= 1000 ? n.toFixed(2)
       : n >= 100  ? n.toFixed(2)
       : n >= 10   ? n.toFixed(3)
       :              n.toFixed(4);
}

/**
 * Format a large volume number (e.g. 1.2M, 5.6K)
 */
function fmtVol(n) {
  if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return n.toString();
}

/**
 * Format a unix timestamp as "Jan 1, 24"
 */
function fDate(u) {
  return new Date(u * 1000).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: '2-digit'
  });
}

/**
 * Return a human-readable time-ago string from a unix timestamp
 */
function timeAgo(ts) {
  const d = Math.floor(Date.now() / 1000 - ts);
  if (d < 60)    return d + 's ago';
  if (d < 3600)  return Math.floor(d / 60) + 'm ago';
  if (d < 86400) return Math.floor(d / 3600) + 'h ago';
  return Math.floor(d / 86400) + 'd ago';
}

/**
 * Classify a news headline as positive, negative, or neutral
 */
function gSent(h) {
  if (/surge|soar|rally|gain|beat|profit|bull|record|breakout|moon|up|rise/i.test(h))
    return 'pos';
  if (/fall|drop|crash|loss|miss|decline|bear|warn|risk|plunge|down/i.test(h))
    return 'neg';
  return 'neu';
}

/**
 * Safely escape HTML entities
 */
function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}


// ════════════════════════════════════
//  RESIZABLE PANELS
// ════════════════════════════════════
(function initResizePanels() {
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-resize]').forEach(handle => {
      const dir = handle.dataset.dir; // 'left', 'right', 'top'
      const targetId = handle.dataset.resize;
      handle.addEventListener('mousedown', e => {
        e.preventDefault();
        const target = document.getElementById(targetId);
        if (!target) return;
        const startX = e.clientX, startY = e.clientY;
        const startW = target.offsetWidth, startH = target.offsetHeight;
        document.body.style.cursor = dir === 'top' ? 'ns-resize' : 'ew-resize';
        document.body.style.userSelect = 'none';

        function onMove(e2) {
          if (dir === 'left') {
            // dragging left edge → decreasing X = wider panel (panel is on right side)
            target.style.width = Math.max(180, startW - (e2.clientX - startX)) + 'px';
            target.style.minWidth = target.style.width;
          } else if (dir === 'right') {
            target.style.width = Math.max(180, startW + (e2.clientX - startX)) + 'px';
            target.style.minWidth = target.style.width;
          } else if (dir === 'top') {
            target.style.height = Math.max(80, startH - (e2.clientY - startY)) + 'px';
          }
          // Trigger chart resize
          if (typeof resizeCharts === 'function') resizeCharts();
        }
        function onUp() {
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
          document.body.style.cursor = '';
          document.body.style.userSelect = '';
        }
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      });
    });
  });
})();