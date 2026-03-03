<?php
// ════════════════════════════════════
//  api/proxy.php
//
//  Server-side Finnhub API proxy.
//
//  Benefits over direct browser calls:
//  • API key never exposed to the client
//  • Response caching to stay under rate limits
//  • Centralised CORS handling
//  • Easy to add auth / per-user rate limiting
//
//  Usage (from JS):
//    fetch('api/proxy.php?endpoint=quote&symbol=AAPL')
//
//  When using this proxy, change config.js:
//    window.FH = 'api/proxy.php';
//  And remove &token=${KEY} from every fetch call.
// ════════════════════════════════════

require_once __DIR__ . '/config.php';

// ── CORS ─────────────────────────────
header('Access-Control-Allow-Origin: ' . ALLOWED_ORIGIN);
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json; charset=UTF-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// ── VALIDATE INPUT ───────────────────
$endpoint = trim($_GET['endpoint'] ?? '');
if (empty($endpoint)) {
    http_response_code(400);
    echo json_encode(['error' => 'Missing endpoint parameter']);
    exit;
}

// Whitelist allowed Finnhub endpoints
$allowed_endpoints = [
    'quote',
    'stock/candle',
    'crypto/candle',
    'forex/candle',
    'news',
    'search',
    'stock/profile2',
    'stock/metric',
];

if (!in_array($endpoint, $allowed_endpoints, true)) {
    http_response_code(403);
    echo json_encode(['error' => 'Endpoint not allowed: ' . $endpoint]);
    exit;
}

// ── BUILD FINNHUB URL ────────────────
$params = $_GET;
unset($params['endpoint']); // remove our routing param

// Inject the server-side API key
$params['token'] = FINNHUB_API_KEY;

$finnhub_url = 'https://finnhub.io/api/v1/' . $endpoint . '?' . http_build_query($params);

// ── CACHE LAYER ──────────────────────
// Determine TTL based on endpoint type
$ttl = CACHE_TTL;
if (str_contains($endpoint, 'candle')) $ttl = CACHE_TTL_CANDLE;
if ($endpoint === 'news')              $ttl = CACHE_TTL_NEWS;
if ($endpoint === 'search')            $ttl = CACHE_TTL_SEARCH;

// Build a safe cache key from the full URL (minus the token)
$cache_params = $params;
unset($cache_params['token']);
$cache_key  = md5($endpoint . '?' . http_build_query($cache_params));
$cache_file = CACHE_DIR . '/' . $cache_key . '.json';

// Serve from cache if fresh enough
if (is_dir(CACHE_DIR) && file_exists($cache_file) && (time() - filemtime($cache_file)) < $ttl) {
    header('X-Cache: HIT');
    echo file_get_contents($cache_file);
    exit;
}

// ── FETCH FROM FINNHUB ───────────────
$ctx = stream_context_create([
    'http' => [
        'method'          => 'GET',
        'timeout'         => 10,
        'ignore_errors'   => true,
        'header'          => "User-Agent: PMT-Terminal/1.0\r\n",
    ],
    'ssl' => [
        'verify_peer'      => true,
        'verify_peer_name' => true,
    ],
]);

$raw = @file_get_contents($finnhub_url, false, $ctx);

if ($raw === false) {
    http_response_code(502);
    echo json_encode(['error' => 'Failed to reach Finnhub API']);
    exit;
}

// Validate JSON before caching
$decoded = json_decode($raw, true);
if (json_last_error() !== JSON_ERROR_NONE) {
    http_response_code(502);
    echo json_encode(['error' => 'Invalid JSON from Finnhub']);
    exit;
}

// ── WRITE TO CACHE ───────────────────
if (!is_dir(CACHE_DIR)) {
    @mkdir(CACHE_DIR, 0700, true);
}
if (is_dir(CACHE_DIR) && is_writable(CACHE_DIR)) {
    file_put_contents($cache_file, $raw, LOCK_EX);
    header('X-Cache: MISS');
}

// ── PASS HTTP STATUS THROUGH ─────────
// Forward Finnhub's error status codes (401, 429, etc.)
$status_line = $http_response_header[0] ?? 'HTTP/1.1 200 OK';
if (preg_match('/HTTP\/\d\.\d\s+(\d{3})/', $status_line, $m)) {
    $status_code = (int) $m[1];
    if ($status_code !== 200) {
        http_response_code($status_code);
    }
}

echo $raw;
