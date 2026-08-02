import { userFirebaseService } from "../services/user.js";
import { firestore } from "../config/firebase.js";
import { FieldValue } from "firebase-admin/firestore";
import { buildTrainingPlan } from "../services/trainingPlan.js";

// Normalise a stored date to epoch-ms for the client. Handles Firestore
// Timestamps (which JSON-serialise to {_seconds,…} that `new Date()` can't
// parse → "Invalid Date"), plain numbers, ISO strings, and Dates. Returns
// null for anything unparseable so the UI can show a graceful fallback.
const toMs = (v) => {
  if (v == null) return null;
  if (typeof v === 'number') return v;
  if (typeof v?.toDate === 'function') return v.toDate().getTime();
  const t = new Date(v).getTime();
  return Number.isNaN(t) ? null : t;
};

// ===== GET ALL USERS =====
export const getAllUsers = async (req, res) => {
  try {
    const users = await userFirebaseService.findAll();
    // Strip password; normalise date fields to epoch-ms so the client can
    // render them (raw Firestore Timestamps → "Invalid Date" otherwise).
    const usersWithoutPassword = users.map(({ password, ...user }) => ({
      ...user,
      createdAt: toMs(user.createdAt),
      updatedAt: toMs(user.updatedAt),
    }));
    res.json(usersWithoutPassword);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch users" });
  }
};

// ===== PROMOTE / DEMOTE USER =====
export const updateUserRole = async (req, res) => {
  const { role } = req.body;

  if (!["user", "admin"].includes(role)) {
    return res.status(400).json({ message: "Invalid role" });
  }

  try {
    const user = await userFirebaseService.updateUser(req.params.id, { role });
    const { password, ...userWithoutPassword } = user;
    res.json(userWithoutPassword);
  } catch (err) {
    res.status(500).json({ message: "Failed to update role" });
  }
};

// ===== EDIT USER =====
export const updateUser = async (req, res) => {
  const { name, email } = req.body;

  try {
    const user = await userFirebaseService.updateUser(req.params.id, { name, email });
    const { password, ...userWithoutPassword } = user;
    res.json(userWithoutPassword);
  } catch (err) {
    res.status(500).json({ message: "Failed to update user" });
  }
};

// ===== DELETE USER =====
export const deleteUser = async (req, res) => {
  try {
    await userFirebaseService.deleteUser(req.params.id);
    res.json({ message: "User deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: "Failed to delete user" });
  }
};

// ===== GAME SESSIONS =====
export const getSessions = async (req, res) => {
  try {
    const snap = await firestore
      .collection('sessions')
      .orderBy('startedAt', 'desc')
      .limit(50)
      .get();

    const sessions = snap.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      report: doc.data().report
        ? {
            cognitiveScore: doc.data().report.cognitiveScore,
            summaryHe:      doc.data().report.summaryHe,
            generatedAt:    doc.data().report.generatedAt,
          }
        : null,
    }));

    // Batch-fetch usernames for all unique userIds
    const uniqueIds = [...new Set(sessions.map(s => s.userId).filter(Boolean))];
    const userDocs = await Promise.all(
      uniqueIds.map(id => firestore.collection('users').doc(id).get())
    );
    const nameMap = Object.fromEntries(
      userDocs.map(doc => [doc.id, doc.exists ? doc.data().name : null])
    );

    res.json(sessions.map(s => ({ ...s, username: nameMap[s.userId] ?? null })));
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch sessions", error: err.message });
  }
};

// ===== USER ACTIVITY (login history) =====
// Returns two things, deliberately from two different sources:
//   logs  — the recent login feed, newest first (a WINDOW, not everything)
//   users — the per-user summary, built from the users collection so the login
//           count and "last login" stay right no matter how far back the user's
//           logins fall. Summarising the window instead (what the client used to
//           do) quietly under-counted busy users and dropped anyone whose last
//           login had scrolled out of it.
const ACTIVITY_DEFAULT_LIMIT = 100;
const ACTIVITY_MAX_LIMIT     = 500;

export const getActivity = async (req, res) => {
  try {
    const requested = Number.parseInt(req.query.limit, 10);
    const limit = Number.isFinite(requested)
      ? Math.min(Math.max(requested, 1), ACTIVITY_MAX_LIMIT)
      : ACTIVITY_DEFAULT_LIMIT;

    const [logSnap, userSnap] = await Promise.all([
      firestore.collection('activityLogs').orderBy('timestamp', 'desc').limit(limit + 1).get(),
      firestore.collection('users').get(),
    ]);

    // One extra row was fetched purely to detect truncation — don't serve it.
    const truncated = logSnap.docs.length > limit;
    const logs = logSnap.docs.slice(0, limit).map(doc => ({
      id: doc.id,
      ...doc.data(),
      timestamp: toMs(doc.data().timestamp),
    }));

    // Fallbacks for accounts that predate the loginCount/lastLoginAt counters:
    // count what we can see in the window and flag the number as a lower bound.
    const windowCounts = new Map();
    const windowLatest = new Map();
    for (const log of logs) {
      if (!log.userId) continue;
      windowCounts.set(log.userId, (windowCounts.get(log.userId) ?? 0) + 1);
      if (!windowLatest.has(log.userId)) windowLatest.set(log.userId, log.timestamp);
    }

    const users = userSnap.docs
      .map(doc => {
        const d = doc.data();
        const storedCount = typeof d.loginCount === 'number' ? d.loginCount : null;
        return {
          id:          doc.id,
          name:        d.name ?? null,
          email:       d.email ?? null,
          role:        d.role ?? 'user',
          createdAt:   toMs(d.createdAt),
          lastLoginAt: toMs(d.lastLoginAt) ?? windowLatest.get(doc.id) ?? null,
          loginCount:  storedCount ?? windowCounts.get(doc.id) ?? 0,
          // true → the count is what we could see, not what the user actually did
          countApprox: storedCount === null,
        };
      })
      .sort((a, b) => (b.lastLoginAt ?? 0) - (a.lastLoginAt ?? 0));

    res.json({ logs, users, truncated, generatedAt: Date.now() });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch activity", error: err.message });
  }
};

// ===== CLAUDE TOKEN USAGE =====
export const getTokenUsage = async (req, res) => {
  try {
    const doc = await firestore.collection('meta').doc('tokenUsage').get();
    res.json(doc.exists ? doc.data() : { totalInputTokens: 0, totalOutputTokens: 0, totalReports: 0 });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch token usage", error: err.message });
  }
};

// ===== COGNITIVE TREND (per-user time series) =====
const VALID_GAMES   = new Set(['shapes-click', 'color-trains', 'tictactoe', 'memory', 'all']);
const VALID_PERIODS = new Set(['7d', '30d', '90d', 'all']);

const PERIOD_DAYS = { '7d': 7, '30d': 30, '90d': 90 };

export const getUserCognitiveTrend = async (req, res) => {
  try {
    const { userId } = req.params;
    const game   = VALID_GAMES.has(req.query.game)     ? req.query.game     : 'all';
    const period = VALID_PERIODS.has(req.query.period) ? req.query.period   : '30d';

    // Look up the user's display name (use 'name' field per existing schema)
    const userSnap    = await firestore.collection('users').doc(userId).get();
    const displayName = userSnap.exists ? (userSnap.data().name ?? null) : null;

    // Build the query against users/{userId}/reports
    let q = firestore.collection('users').doc(userId).collection('reports');

    if (game !== 'all')   q = q.where('gameId',      '==', game);
    if (period !== 'all') {
      const cutoff = Date.now() - PERIOD_DAYS[period] * 24 * 60 * 60 * 1000;
      q = q.where('generatedAt', '>=', cutoff);
    }

    const snap = await q.orderBy('generatedAt', 'asc').limit(500).get();

    const series = snap.docs.map(d => {
      const data = d.data();
      return {
        sessionId:      data.sessionId      ?? d.id,
        generatedAt:    data.generatedAt    ?? null,
        gameId:         data.gameId         ?? null,
        cognitiveScore: data.cognitiveScore ?? null,
        accuracy:       data.accuracy       ?? null,   // may be null for older records
        summaryHe:      data.summaryHe      ?? '',
      };
    });

    // Compute summary
    const scores         = series.map(s => s.cognitiveScore).filter(v => typeof v === 'number');
    const latestScore    = scores.length > 0 ? scores[scores.length - 1] : null;
    const periodAverage  = scores.length > 0
      ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
      : null;
    const periodChange   = scores.length >= 2 ? scores[scores.length - 1] - scores[0] : null;
    const sessionsCount  = series.length;

    res.json({
      user:    { userId, displayName },
      series,
      summary: { latestScore, periodAverage, periodChange, sessionsCount },
    });
  } catch (err) {
    console.error('[getUserCognitiveTrend]', err);
    res.status(500).json({ message: "Failed to fetch cognitive trend", error: err.message });
  }
};

// ===== ACTIVE ALERTS (admin queue) =====
// Reads admin/pendingAlerts (a single doc keyed by `${userId}_${gameId}`),
// joins each alert with the user's displayName, returns sorted newest-first.
export const getAlerts = async (req, res) => {
  try {
    const doc = await firestore.collection('admin').doc('pendingAlerts').get();
    if (!doc.exists) return res.json([]);

    const data    = doc.data() ?? {};
    const entries = Object.entries(data);
    if (entries.length === 0) return res.json([]);

    // Batch-fetch user names for all unique userIds
    const userIds = [...new Set(entries.map(([, alert]) => alert.userId).filter(Boolean))];
    const userDocs = await Promise.all(
      userIds.map(id => firestore.collection('users').doc(id).get())
    );
    const nameMap = Object.fromEntries(
      userDocs.map(d => [d.id, d.exists ? (d.data().name ?? null) : null])
    );

    const alerts = entries
      .map(([, alert]) => ({
        alertId:      alert.alertId      ?? null,
        userId:       alert.userId,
        displayName:  nameMap[alert.userId] ?? null,
        gameId:       alert.gameId,
        type:         alert.type         ?? 'performance_decline',
        trigger:      alert.trigger      ?? null,
        accuracyDrop: alert.accuracyDrop ?? null,
        createdAt:    alert.createdAt    ?? null,
        acknowledged: alert.acknowledged ?? false,
      }))
      .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));

    res.json(alerts);
  } catch (err) {
    console.error('[getAlerts]', err);
    res.status(500).json({ message: "Failed to fetch alerts", error: err.message });
  }
};

// ===== ACKNOWLEDGE ALERT =====
// Marks the audit doc as acknowledged AND removes the entry from
// admin/pendingAlerts so it stops appearing in the active queue.
// Both writes go in one batch — atomic, idempotent on retry.
export const acknowledgeAlert = async (req, res) => {
  const { userId, gameId, alertId } = req.body ?? {};
  if (!userId || !gameId || !alertId) {
    return res.status(400).json({ message: "userId, gameId, and alertId are required" });
  }

  try {
    const batch = firestore.batch();

    // 1. Mark the per-user audit doc — preserves history.
    const auditRef = firestore.collection('users').doc(userId)
                              .collection('alerts').doc(alertId);
    batch.set(auditRef, {
      acknowledged:   true,
      acknowledgedAt: Date.now(),
    }, { merge: true });

    // 2. Remove the entry from the admin queue so it stops showing up.
    const pendingRef = firestore.collection('admin').doc('pendingAlerts');
    batch.update(pendingRef, {
      [`${userId}_${gameId}`]: FieldValue.delete(),
    });

    await batch.commit();
    res.json({ ok: true });
  } catch (err) {
    console.error('[acknowledgeAlert]', err);
    res.status(500).json({ message: "Failed to acknowledge alert", error: err.message });
  }
};

// ===== PLAYER FILE (תיק שחקן — one aggregated read for the admin) =====
// Combines everything the Player-File page needs in a single round-trip:
//   • user details (password-stripped, createdAt normalised to ms)
//   • cognitiveProfile — up to 8 per-domain docs (level, trend, …)
//   • progression/current — journey-map state (cold-start default if absent)
//   • recent sessions — from the lightweight users/{id}/reports index
//     (gameId, date, accuracy, cognitiveScore, summaryHe), newest-first
//   • open alerts — this user's entries in admin/pendingAlerts
export const getUserPlayerFile = async (req, res) => {
  try {
    const { userId } = req.params;
    const userRef = firestore.collection('users').doc(userId);

    const [userSnap, profSnap, progSnap, reportsSnap, pendingSnap] = await Promise.all([
      userRef.get(),
      userRef.collection('cognitiveProfile').get(),
      userRef.collection('progression').doc('current').get(),
      userRef.collection('reports').orderBy('generatedAt', 'desc').limit(20).get(),
      firestore.collection('admin').doc('pendingAlerts').get(),
    ]);

    if (!userSnap.exists) return res.status(404).json({ message: 'User not found' });

    const { password, ...userData } = userSnap.data();
    const user = { id: userSnap.id, ...userData, createdAt: toMs(userData.createdAt) };

    const domains = profSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

    const progression = progSnap.exists
      ? progSnap.data()
      : { overallLevel: 0, rank: 'beginner', regions: {}, avatarState: 'idle' };

    const sessions = reportsSnap.docs.map((d) => {
      const data = d.data();
      return {
        sessionId:      data.sessionId      ?? d.id,
        gameId:         data.gameId         ?? null,
        generatedAt:    data.generatedAt    ?? null,
        cognitiveScore: data.cognitiveScore ?? null,
        accuracy:       data.accuracy       ?? null,
        summaryHe:      data.summaryHe       ?? '',
      };
    });

    const pending = pendingSnap.exists ? (pendingSnap.data() ?? {}) : {};
    const alerts = Object.values(pending)
      .filter((a) => a.userId === userId)
      .map((a) => ({
        alertId:      a.alertId      ?? null,
        gameId:       a.gameId,
        type:         a.type         ?? 'performance_decline',
        trigger:      a.trigger      ?? null,
        accuracyDrop: a.accuracyDrop ?? null,
        createdAt:    a.createdAt    ?? null,
        acknowledged: a.acknowledged ?? false,
      }))
      .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));

    const trainingPlan = buildTrainingPlan(domains);

    // Persist the derived plan so it lives in the DB, not only in this view.
    // Fire-and-forget — a write failure must never break the read.
    if (!trainingPlan.isColdStart) {
      userRef
        .collection('trainingPlan')
        .doc('current')
        .set({ ...trainingPlan, updatedAt: Date.now() }, { merge: true })
        .catch((e) => console.error('[player-file:persistPlan]', e.message));
    }

    res.json({ user, profile: { domains }, progression, sessions, alerts, trainingPlan });
  } catch (err) {
    console.error('[getUserPlayerFile]', err);
    res.status(500).json({ message: 'Failed to fetch player file', error: err.message });
  }
};

// ===== SESSION REPORT (full per-session report for the admin) =====
// Returns the complete report stored under sessions/{sessionId}.report —
// domainScores, the Hebrew narrative (summaryHe/strengthsHe/recommendationsHe),
// rawStats, and the adaptive summary (adjustmentCount + netDirection). The full
// adjustment list is not persisted; rawStats carries its summary.
export const getSessionReport = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const doc = await firestore.collection('sessions').doc(sessionId).get();
    if (!doc.exists) return res.status(404).json({ message: 'Session not found' });

    const data = doc.data();
    if (!data.report) return res.status(404).json({ message: 'Report not found' });

    res.json({
      ...data.report,
      startedAt: toMs(data.startedAt),
    });
  } catch (err) {
    console.error('[getSessionReport]', err);
    res.status(500).json({ message: 'Failed to fetch session report', error: err.message });
  }
};

// ===== USER COACH REPORTS (longitudinal, every 5 sessions) =====
export const getUserCoachReports = async (req, res) => {
  try {
    const { userId } = req.params;

    let q = firestore.collection('users').doc(userId).collection('coachReports');
    if (req.query.game) q = q.where('gameId', '==', req.query.game);

    const snap = await q.orderBy('generatedAt', 'desc').limit(100).get();
    const reports = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    res.json(reports);
  } catch (err) {
    console.error('[getUserCoachReports]', err);
    res.status(500).json({ message: "Failed to fetch coach reports", error: err.message });
  }
};

// ===== SYSTEM SETTINGS (admin/settings) =====
// The site name is a hardcoded product constant ("NeuroStep") and is NOT stored
// here — only the toggles that actually do something are persisted.
const SETTINGS_DEFAULTS = { emailNotifications: true, maintenanceMode: false };

export const getSettings = async (req, res) => {
  try {
    const doc = await firestore.collection('admin').doc('settings').get();
    res.json({ ...SETTINGS_DEFAULTS, ...(doc.exists ? doc.data() : {}) });
  } catch (err) {
    console.error('[getSettings]', err);
    res.status(500).json({ message: "Failed to fetch settings", error: err.message });
  }
};

export const updateSettings = async (req, res) => {
  try {
    const { emailNotifications, maintenanceMode } = req.body ?? {};
    const next = {
      emailNotifications: !!emailNotifications,
      maintenanceMode:    !!maintenanceMode,
      updatedAt:          Date.now(),
    };
    await firestore.collection('admin').doc('settings').set(next, { merge: true });
    res.json({ ok: true, settings: { ...SETTINGS_DEFAULTS, ...next } });
  } catch (err) {
    console.error('[updateSettings]', err);
    res.status(500).json({ message: "Failed to save settings", error: err.message });
  }
};

// ===== ALERT THRESHOLD CONFIG (admin/alertConfig) =====
// Decline-alert sensitivity, editable from the admin UI and consumed live by
// the game-server alert-agent (which falls back to these same defaults). The
// 3-session window is structural, exposed read-only for context.
const ALERT_CONFIG_DEFAULTS = { accuracyDropPct: 25, scoreDrop: 20, windowSessions: 3 };

const clampInt = (v, lo, hi, dflt) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, Math.round(n))) : dflt;
};

export const getAlertConfig = async (req, res) => {
  try {
    const doc = await firestore.collection('admin').doc('alertConfig').get();
    res.json({ ...ALERT_CONFIG_DEFAULTS, ...(doc.exists ? doc.data() : {}) });
  } catch (err) {
    console.error('[getAlertConfig]', err);
    res.status(500).json({ message: "Failed to fetch alert config", error: err.message });
  }
};

export const updateAlertConfig = async (req, res) => {
  try {
    const { accuracyDropPct, scoreDrop } = req.body ?? {};
    const next = {
      accuracyDropPct: clampInt(accuracyDropPct, 5, 90, ALERT_CONFIG_DEFAULTS.accuracyDropPct),
      scoreDrop:       clampInt(scoreDrop,       5, 90, ALERT_CONFIG_DEFAULTS.scoreDrop),
      updatedAt:       Date.now(),
    };
    await firestore.collection('admin').doc('alertConfig').set(next, { merge: true });
    res.json({ ok: true, config: { ...ALERT_CONFIG_DEFAULTS, ...next } });
  } catch (err) {
    console.error('[updateAlertConfig]', err);
    res.status(500).json({ message: "Failed to save alert config", error: err.message });
  }
};
