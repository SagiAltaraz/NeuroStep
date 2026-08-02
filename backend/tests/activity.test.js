/**
 * GET /api/admin/activity — the admin login log.
 *
 * Firestore is faked, so this runs anywhere with no credentials: `bun test`
 * from backend/. Covers what the admin panel actually depends on — Timestamp
 * normalisation, exact per-user counts (rather than counts of the visible
 * window), legacy docs without counters, and truncation reporting.
 */
import { test, expect, mock } from 'bun:test';

// ── Fake Firestore: just enough for getActivity ──────────────────────────────
const now = Date.now();
const ts = (ms) => ({ toDate: () => new Date(ms) });

const LOGS = [
  { id: 'l1', userId: 'u1', name: 'Dana', email: 'd@x.com', method: 'email',  timestamp: ts(now - 1000) },
  { id: 'l2', userId: 'u2', name: 'Ron',  email: 'r@x.com', method: 'signup', timestamp: ts(now - 5000) },
  { id: 'l3', userId: 'u1', name: 'Dana', email: 'd@x.com', method: 'google', timestamp: ts(now - 9000) },
];

const USERS = [
  // u1 has the new counters; u3 never came back; u2 is a legacy doc (no counters)
  { id: 'u1', name: 'Dana', email: 'd@x.com', role: 'user',  createdAt: ts(now - 90000), lastLoginAt: ts(now - 1000), loginCount: 42 },
  { id: 'u2', name: 'Ron',  email: 'r@x.com', role: 'user',  createdAt: ts(now - 80000) },
  { id: 'u3', name: 'Old',  email: 'o@x.com', role: 'admin', createdAt: ts(now - 70000) },
];

const docsOf = (rows) => rows.map(({ id, ...data }) => ({ id, data: () => data }));

let requestedLimit = null;

const firestore = {
  collection(name) {
    if (name === 'activityLogs') {
      const q = {
        orderBy: () => q,
        limit: (n) => { requestedLimit = n; return q; },
        get: async () => ({ docs: docsOf(LOGS) }),
      };
      return q;
    }
    if (name === 'users') return { get: async () => ({ docs: docsOf(USERS) }) };
    throw new Error(`unexpected collection ${name}`);
  },
};

mock.module('bcryptjs', () => ({ default: {}, hash: async () => '', compare: async () => false }));
mock.module('firebase-admin/firestore', () => ({
  FieldValue: { increment: (n) => ({ __increment: n }) },
  getFirestore: () => firestore,
}));
mock.module(new URL('../config/firebase.js', import.meta.url).pathname, () => ({
  firestore,
  realtimeDb: {},
  firebaseAuth: {},
  default: {},
}));

const { getActivity } = await import('../controllers/AdminController.js');

function run(query = {}) {
  return new Promise((resolve, reject) => {
    getActivity({ query }, {
      json: resolve,
      status: (code) => ({ json: (p) => reject(new Error(`${code} ${JSON.stringify(p)}`)) }),
    });
  });
}

test('serves the feed and a per-user summary', async () => {
  const out = await run({ limit: '100' });

  expect(out.logs).toHaveLength(3);
  expect(out.logs[0].id).toBe('l1');
  expect(typeof out.logs[0].timestamp).toBe('number');   // Timestamp → epoch ms
  expect(out.logs[1].method).toBe('signup');             // signups are logged now
  expect(out.truncated).toBe(false);
  expect(typeof out.generatedAt).toBe('number');
});

test('counts come from the user doc, not the visible window', async () => {
  const out = await run();
  const byId = Object.fromEntries(out.users.map((u) => [u.id, u]));

  expect(byId.u1.loginCount).toBe(42);        // 2 rows in the window, 42 in truth
  expect(byId.u1.countApprox).toBe(false);
  expect(byId.u2.loginCount).toBe(1);         // legacy doc → counted from window
  expect(byId.u2.countApprox).toBe(true);
  expect(byId.u2.lastLoginAt).toBe(out.logs[1].timestamp);  // and dated from it
  expect(byId.u3.loginCount).toBe(0);
  expect(byId.u3.lastLoginAt).toBeNull();     // never signed in → not dropped
});

test('summary is newest-first and the limit is clamped', async () => {
  const out = await run({ limit: '9999' });
  expect(out.users.map((u) => u.id)).toEqual(['u1', 'u2', 'u3']);
  expect(requestedLimit).toBe(501);           // 500 cap + 1 truncation probe
});

test('a full page is reported as truncated', async () => {
  const out = await run({ limit: '2' });
  expect(out.logs).toHaveLength(2);
  expect(out.truncated).toBe(true);
});
