// backtestbaba-d1-proxy — D1 Persistence Microservice
// Endpoints: health, auth, uploads, signals, quota, admin

import { v4 as uuidv4 } from 'uuid';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const PASSWORD_SALT = PASSWORD_SALT || 'backtestbaba-salt-2026';

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

function error(msg, status = 400) {
  return json({ error: msg }, status);
}

async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + PASSWORD_SALT);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function generateToken() {
  return crypto.randomUUID();
}

function getUserId(request) {
  return request.headers.get('X-User-Id') || null;
}

function getIsAdmin(request) {
  return request.headers.get('X-Is-Admin') === '1';
}

// ─── Request Router ────────────────────────────────────────

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;
    const DB = env.DB;

    try {
      return await route(method, path, request, DB, url);
    } catch (e) {
      return error(e.message, 500);
    }
  },
};

async function route(method, path, request, DB, url) {
  // ── Health ──────────────────────────────────────────────
  if (method === 'GET' && path === '/api/health') {
    const result = await DB.prepare('SELECT COUNT(*) as table_count FROM sqlite_master').first();
    return json({
      status: 'ok',
      database: 'backtestbaba',
      version: '1.0.0',
      tables: result.table_count,
    });
  }

  // ── Auth: Signup ────────────────────────────────────────
  if (method === 'POST' && path === '/api/auth/signup') {
    const { email, password, name } = await request.json();
    if (!email || !password) return error('email and password required');

    const existing = await DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
    if (existing) return error('email already registered', 409);

    const id = uuidv4();
    const passwordHash = await hashPassword(password);
    await DB.prepare(
      'INSERT INTO users (id, email, password_hash, name) VALUES (?, ?, ?, ?)'
    ).bind(id, email, passwordHash, name || '').run();

    const token = generateToken();
    const sessionId = uuidv4();
    const expiresAt = new Date(Date.now() + 7 * 86400000).toISOString();
    await DB.prepare(
      'INSERT INTO sessions (id, user_id, token, expires_at) VALUES (?, ?, ?, ?)'
    ).bind(sessionId, id, token, expiresAt).run();

    return json({ user: { id, email, name: name || '', plan: 'free', is_admin: 0 }, token }, 201);
  }

  // ── Auth: Login ─────────────────────────────────────────
  if (method === 'POST' && path === '/api/auth/login') {
    const { email, password } = await request.json();
    if (!email || !password) return error('email and password required');

    const user = await DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first();
    if (!user) return error('invalid credentials', 401);

    const passwordHash = await hashPassword(password);
    if (user.password_hash !== passwordHash) return error('invalid credentials', 401);

    const token = generateToken();
    const sessionId = uuidv4();
    const expiresAt = new Date(Date.now() + 7 * 86400000).toISOString();
    await DB.prepare(
      'INSERT INTO sessions (id, user_id, token, expires_at) VALUES (?, ?, ?, ?)'
    ).bind(sessionId, user.id, token, expiresAt).run();

    return json({
      user: { id: user.id, email: user.email, name: user.name, plan: user.plan, is_admin: user.is_admin },
      token,
    });
  }

  // ── Auth: Validate Session ─────────────────────────────
  if (method === 'GET' && path === '/api/auth/validate') {
    const token = url.searchParams.get('token');
    if (!token) return error('token required');

    const session = await DB.prepare(
      `SELECT s.*, u.email, u.name, u.plan, u.is_admin, u.max_signals, u.max_file_size_mb
       FROM sessions s JOIN users u ON s.user_id = u.id
       WHERE s.token = ? AND s.revoked = 0 AND s.expires_at > datetime('now')`
    ).bind(token).first();

    if (!session) return error('invalid or expired session', 401);

    return json({
      user: {
        id: session.user_id,
        email: session.email,
        name: session.name,
        plan: session.plan,
        is_admin: session.is_admin,
        max_signals: session.max_signals,
        max_file_size_mb: session.max_file_size_mb,
      },
    });
  }

  // ── Ingestion Log: Create (Pillar 3 — immediate write) ──
  if (method === 'POST' && path === '/api/ingestion') {
    const body = await request.json();
    const id = uuidv4();
    await DB.prepare(
      `INSERT INTO ingestion_log (id, user_id, file_hash, filename, original_filename, file_size, source_info, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'received')`
    ).bind(id, body.user_id || null, body.file_hash, body.filename, body.original_filename, body.file_size, body.source_info || null).run();

    await DB.prepare('UPDATE quota SET total_writes = total_writes + 1, updated_at = datetime(\'now\') WHERE id = 1').run();

    return json({ id }, 201);
  }

  // ── Ingestion Log: Update Status ────────────────────────
  if (method === 'PATCH' && path === '/api/ingestion') {
    const { id, status } = await request.json();
    if (!id || !status) return error('id and status required');
    await DB.prepare('UPDATE ingestion_log SET status = ? WHERE id = ?').bind(status, id).run();
    return json({ ok: true });
  }

  // ── Uploads: Create ────────────────────────────────────
  if (method === 'POST' && path === '/api/uploads') {
    const body = await request.json();
    const id = uuidv4();
    await DB.prepare(
      `INSERT INTO uploads (id, user_id, file_hash, filename, entry_mode, signal_count, status)
       VALUES (?, ?, ?, ?, ?, ?, 'completed')`
    ).bind(id, body.user_id || null, body.file_hash, body.filename, body.entry_mode, body.signal_count).run();

    await DB.prepare('UPDATE quota SET total_writes = total_writes + 1, updated_at = datetime(\'now\') WHERE id = 1').run();

    const quota = await DB.prepare('SELECT total_writes, write_limit FROM quota WHERE id = 1').first();
    return json({ id, status: 'completed', write_quota_remaining: quota.write_limit - quota.total_writes }, 201);
  }

  // ── Signals: Batch Insert (with dedup + quota check) ───
  if (method === 'POST' && path === '/api/signals') {
    const body = await request.json();
    const { upload_id, signals } = body;
    if (!upload_id || !signals || !signals.length) return error('upload_id and signals required');

    // Check quota before write
    const quota = await DB.prepare('SELECT total_writes, write_limit FROM quota WHERE id = 1').first();
    const projected = quota.total_writes + signals.length;
    if (projected > quota.write_limit * 0.95) {
      return error(`Quota would exceed 95% limit (${projected}/${quota.write_limit})`, 429);
    }

    let inserted = 0;
    let skipped = 0;

    const stmt = DB.prepare(
      `INSERT OR IGNORE INTO signal_hashes (id, upload_id, user_id, row_hash, symbol, signal_date, entry_date, entry_price, entry_mode, status, results_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    const batch = signals.map((s) =>
      stmt.bind(
        uuidv4(), upload_id, s.user_id || null,
        s.row_hash, s.symbol, s.signal_date,
        s.entry_date || null, s.entry_price ?? null,
        s.entry_mode, s.status, s.results_json || null
      )
    );

    // D1 batch returns array of {success, results}
    const results = await DB.batch(batch);
    for (const r of results) {
      if (r.success && r.meta?.changes !== undefined) {
        if (r.meta.changes > 0) inserted++;
        else skipped++;
      }
    }

    // Update upload trade_count
    await DB.prepare(
      'UPDATE uploads SET trade_count = trade_count + ?, updated_at = datetime(\'now\') WHERE id = ?'
    ).bind(inserted, upload_id).run();

    // Update quota
    await DB.prepare(
      'UPDATE quota SET total_writes = total_writes + ?, updated_at = datetime(\'now\') WHERE id = 1'
    ).bind(inserted).run();

    const updatedQuota = await DB.prepare('SELECT total_writes, write_limit FROM quota WHERE id = 1').first();
    return json({
      inserted,
      skipped,
      write_quota_remaining: updatedQuota.write_limit - updatedQuota.total_writes,
    }, 201);
  }

  // ── Signals: Bulk Lookup (Pillar 4 — dual-stage) ────────
  if (method === 'POST' && path === '/api/signals/lookup') {
    const { row_hashes, user_id } = await request.json();
    if (!row_hashes || !row_hashes.length) return json({ existing: [] });

    // Build placeholders: ?,?,?,...
    const placeholders = row_hashes.map(() => '?').join(',');
    let query = `SELECT row_hash, symbol, signal_date FROM signal_hashes WHERE row_hash IN (${placeholders})`;
    const bindings = [...row_hashes];

    // Multi-tenant isolation: scope to user if provided
    if (user_id) {
      query += ` AND user_id = ?`;
      bindings.push(user_id);
    }

    const { results } = await DB.prepare(query).bind(...bindings).all();
    return json({ existing: results.map((r) => r.row_hash) });
  }

  // ── Uploads: List ───────────────────────────────────────
  if (method === 'GET' && path === '/api/uploads') {
    const userId = url.searchParams.get('user_id');
    const limit = parseInt(url.searchParams.get('limit') || '20');
    const offset = parseInt(url.searchParams.get('offset') || '0');

    let query = 'SELECT * FROM uploads';
    let countQuery = 'SELECT COUNT(*) as total FROM uploads';
    const bindings = [];

    if (userId) {
      query += ' WHERE user_id = ?';
      countQuery += ' WHERE user_id = ?';
      bindings.push(userId);
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    bindings.push(limit, offset);

    const { results } = await DB.prepare(query).bind(...bindings).all();
    const total = await DB.prepare(countQuery).bind(...(userId ? [userId] : [])).first();

    return json({ results, total: total.total });
  }

  // ── Quota ───────────────────────────────────────────────
  if (method === 'GET' && path === '/api/quota') {
    const q = await DB.prepare('SELECT total_writes, write_limit FROM quota WHERE id = 1').first();
    if (!q) return json({ total_writes: 0, write_limit: 1000000, percent_used: 0, soft_blocked: false });
    return json({
      total_writes: q.total_writes,
      write_limit: q.write_limit,
      percent_used: parseFloat(((q.total_writes / q.write_limit) * 100).toFixed(2)),
      soft_blocked: q.total_writes >= q.write_limit * 0.95,
    });
  }

  // ── Admin: List Users ────────────────────────────────────
  if (method === 'GET' && path === '/api/admin/users') {
    const { results } = await DB.prepare(
      'SELECT id, email, name, plan, is_admin, max_signals, max_file_size_mb, created_at FROM users ORDER BY created_at DESC LIMIT 100'
    ).all();
    return json({ results });
  }

  // ── Admin: Upgrade/Downgrade Plan ────────────────────────
  if (method === 'POST' && path === '/api/admin/users/plan') {
    const { user_id, plan } = await request.json();
    if (!user_id || !plan) return error('user_id and plan required');
    if (!['free', 'priority'].includes(plan)) return error('plan must be free or priority');

    const limits = plan === 'priority'
      ? { max_signals: 5000, max_file_size_mb: 10 }
      : { max_signals: 100, max_file_size_mb: 2 };

    await DB.prepare(
      'UPDATE users SET plan = ?, max_signals = ?, max_file_size_mb = ?, updated_at = datetime(\'now\') WHERE id = ?'
    ).bind(plan, limits.max_signals, limits.max_file_size_mb, user_id).run();

    return json({ ok: true });
  }

  // ── Admin: Revoke Sessions ───────────────────────────────
  if (method === 'POST' && path === '/api/admin/sessions/revoke') {
    const { user_id } = await request.json();
    if (!user_id) return error('user_id required');
    await DB.prepare('UPDATE sessions SET revoked = 1 WHERE user_id = ?').bind(user_id).run();
    return json({ ok: true });
  }

  // ── 404 ────────────────────────────────────────────────
  return error(`Not found: ${method} ${path}`, 404);
}
