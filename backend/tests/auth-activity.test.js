/**
 * Auth → activity logging: every way INTO the app must leave a record.
 *
 * Firestore is faked, so this runs anywhere with no credentials: `bun test`
 * from backend/. The signup case is the regression that made the log look
 * frozen — a new account wrote no entry at all until its owner logged in again.
 */
import { test, expect, mock, beforeEach } from 'bun:test';

const added = [];
const merged = [];
let failAdd = false;

const firestore = {
  collection(name) {
    if (name === 'activityLogs') {
      return { add: async (doc) => { if (failAdd) throw new Error('permission-denied'); added.push(doc); return { id: 'x' }; } };
    }
    if (name === 'users') {
      return { doc: (id) => ({ set: async (data, opts) => { merged.push({ id, data, opts }); } }) };
    }
    throw new Error(`unexpected collection ${name}`);
  },
};

mock.module('bcryptjs', () => ({ default: {}, hash: async () => 'hash', compare: async () => true }));
mock.module('firebase-admin/firestore', () => ({ FieldValue: { increment: (n) => ({ __increment: n }) } }));
mock.module(new URL('../config/firebase.js', import.meta.url).pathname, () => ({
  firestore, realtimeDb: {}, firebaseAuth: {}, default: {},
}));
mock.module(new URL('../utils/jwt.js', import.meta.url).pathname, () => ({ generateToken: () => 'jwt' }));

const USER = { id: 'u9', name: 'Dana', email: 'd@x.com', role: 'user', language: 'he' };
mock.module(new URL('../services/user.js', import.meta.url).pathname, () => ({
  userFirebaseService: {
    createUser: async () => USER,
    verifyPassword: async () => USER,
  },
}));

const { signup, login } = await import('../controllers/authController.js');

const res = () => {
  const out = {};
  out.status = (code) => { out.code = code; return out; };
  out.json = (body) => { out.body = body; return out; };
  return out;
};

beforeEach(() => { added.length = 0; merged.length = 0; failAdd = false; });

test('signing up writes a login-log entry (it used to write none)', async () => {
  const r = res();
  await signup({ body: { name: 'Dana', email: 'd@x.com', password: 'pw' } }, r);

  expect(r.code).toBe(201);
  expect(added).toHaveLength(1);
  expect(added[0].method).toBe('signup');
  expect(added[0].userId).toBe('u9');
  expect(added[0].timestamp).toBeInstanceOf(Date);
});

test('every entry also bumps the user counters', async () => {
  await login({ body: { email: 'd@x.com', password: 'pw' } }, res());

  expect(added[0].method).toBe('email');
  expect(merged).toHaveLength(1);
  expect(merged[0].id).toBe('u9');
  expect(merged[0].opts).toEqual({ merge: true });
  expect(merged[0].data.loginCount).toEqual({ __increment: 1 });
  expect(merged[0].data.lastLoginAt).toBeInstanceOf(Date);
});

test('a failed log write is reported and never breaks the login', async () => {
  failAdd = true;
  const errors = [];
  const realError = console.error;
  console.error = (...args) => errors.push(args.join(' '));
  try {
    const r = res();
    await login({ body: { email: 'd@x.com', password: 'pw' } }, r);
    expect(r.code).toBe(200);            // the user still gets in
    expect(merged).toHaveLength(1);      // the independent write still ran
    expect(errors.join('\n')).toContain('permission-denied');   // and we hear about it
  } finally {
    console.error = realError;
  }
});
