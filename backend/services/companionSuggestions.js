import { DOMAIN_GAME } from './trainingPlan.js';

export const COMPANION_CONTEXTS = [
  'home',
  'games',
  'journey-map',
  'journey-plan',
];

export const COMPANION_DATA_VERSION = 'companion-suggestions-v1';
export const COMPANION_TTL_MS = 5 * 60 * 1000;

const GAME_ROUTES = {
  memory: '/games/memory',
  'find-letter': '/games/findLetter',
  'color-trains': '/games/colorTracking',
  'spot-difference': '/games/spotDifference',
  'green-light': '/games/greenLight',
  'shapes-click': '/games/shapesClick',
  tictactoe: '/games/ticTacToe',
  'where-was-it': '/games/whereWasIt',
};

const isKnownGame = (gameId) => typeof gameId === 'string' && gameId in GAME_ROUTES;

// A second game that exercises a related skill for the same cognitive domain,
// so the home companion can offer two options in one push. Keyed by domain id
// (DOMAIN_GAME gives the primary game; this gives the sibling).
const DOMAIN_SECOND_GAME = {
  'working-memory':      'where-was-it',
  'selective-attention': 'spot-difference',
  'divided-attention':   'shapes-click',
  'processing-speed':    'find-letter',
  'reaction-time':       'shapes-click',
  'response-inhibition': 'green-light',
  'strategic-thinking':  'memory',
  'visual-spatial':      'memory',
};

export function parseCompanionContext(value) {
  if (value === undefined) return 'home';
  if (typeof value !== 'string' || !COMPANION_CONTEXTS.includes(value)) return null;
  return value;
}

function suggestion(base, generatedAt, expiresAt) {
  return { ...base, generatedAt, expiresAt };
}

function addUnique(output, candidate, seen) {
  if (!candidate || output.length >= 3) return;
  const gameId = candidate.action?.gameId ?? '';
  const key = `${candidate.kind}:${gameId}`;
  if (seen.has(key)) return;
  seen.add(key);
  output.push(candidate);
}

function rankedPlanItems(plan) {
  return Array.isArray(plan?.items)
    ? plan.items.filter((item) => item && isKnownGame(item.gameId))
    : [];
}

function profileGame(domains) {
  const ranked = Array.isArray(domains)
    ? domains
        .filter((domain) => domain?.id && isKnownGame(DOMAIN_GAME[domain.id]))
        .slice()
        .sort((a, b) => {
          const level = (a.level ?? 0) - (b.level ?? 0);
          if (level !== 0) return level;
          const trend = (a.trend === 'down' ? -1 : 0) - (b.trend === 'down' ? -1 : 0);
          return trend || String(a.id).localeCompare(String(b.id));
        })
    : [];
  const domain = ranked[0];
  if (!domain) return null;
  return { domainId: domain.id, gameId: DOMAIN_GAME[domain.id] };
}

function planCandidate(context, item, plan, generatedAt, expiresAt) {
  if (!item) return null;
  const common = {
    priority: 300,
    source: 'training-plan',
    evidence: { domainId: item.domainId, gameId: item.gameId },
    generatedAt,
    expiresAt,
  };

  if (context === 'journey-plan') {
    return {
      id: `journey-plan:${item.gameId}`,
      kind: 'training-plan',
      messageKey: 'companion.suggestion.weekly-plan',
      messageParams: {
        gameId: item.gameId,
        domainId: item.domainId,
        sessionsPerWeek: item.sessionsPerWeek,
        weeklySessions: plan.weeklySessions ?? 0,
      },
      action: {
        type: 'open-game',
        labelKey: 'companion.action.start-game',
        gameId: item.gameId,
        route: GAME_ROUTES[item.gameId],
      },
      ...common,
    };
  }

  return {
    id: `${context}:plan:${item.gameId}`,
    kind: 'start-training',
    messageKey: 'companion.suggestion.plan-game',
    messageParams: { gameId: item.gameId, domainId: item.domainId },
    action: {
      type: 'open-game',
      labelKey: 'companion.action.start-game',
      gameId: item.gameId,
      route: GAME_ROUTES[item.gameId],
    },
    ...common,
  };
}

function profileCandidate(context, selected, generatedAt, expiresAt) {
  if (!selected) return null;
  return suggestion({
    id: `${context}:profile:${selected.gameId}`,
    kind: 'recommended-game',
    priority: 200,
    messageKey: 'companion.suggestion.next-activity',
    messageParams: selected,
    action: {
      type: 'open-game',
      labelKey: 'companion.action.start-game',
      gameId: selected.gameId,
      route: GAME_ROUTES[selected.gameId],
    },
    source: 'profile',
    evidence: selected,
  }, generatedAt, expiresAt);
}

function gameAction(gameId) {
  return {
    type: 'open-game',
    labelKey: 'companion.action.start-game',
    gameId,
    route: GAME_ROUTES[gameId],
  };
}

// Two games for the same cognitive domain, presented together.
function pairCandidate(context, domainId, generatedAt, expiresAt) {
  if (typeof domainId !== 'string') return null;
  const primary = DOMAIN_GAME[domainId];
  const secondary = DOMAIN_SECOND_GAME[domainId];
  if (!isKnownGame(primary) || !isKnownGame(secondary) || primary === secondary) {
    return null;
  }
  return suggestion({
    id: `${context}:pair:${domainId}`,
    kind: 'recommended-pair',
    priority: 350,
    messageKey: 'companion.suggestion.same-domain-pair',
    messageParams: { domainId, gameId: primary, gameId2: secondary },
    action: gameAction(primary),
    secondaryAction: gameAction(secondary),
    source: 'profile',
    evidence: { domainId, gameId: primary },
  }, generatedAt, expiresAt);
}

function fallbackCandidate(context, generatedAt, expiresAt) {
  if (context === 'home') {
    return suggestion({
      id: 'home:open-assistant',
      kind: 'open-assistant',
      priority: 100,
      messageKey: 'companion.suggestion.open-assistant',
      action: { type: 'open-chat', labelKey: 'companion.action.open-assistant' },
      source: 'fallback',
    }, generatedAt, expiresAt);
  }

  return suggestion({
    id: `${context}:browse-games`,
    kind: 'general',
    priority: 100,
    messageKey: context === 'journey-map'
      ? 'companion.suggestion.journey-map'
      : 'companion.suggestion.browse-games',
    action: {
      type: 'open-route',
      labelKey: 'companion.action.browse-games',
      route: '/games',
    },
    source: 'fallback',
  }, generatedAt, expiresAt);
}

export function buildCompanionSuggestions({
  context,
  domains = [],
  plan,
  progression,
  now = Date.now(),
}) {
  const generatedAt = now;
  const expiresAt = now + COMPANION_TTL_MS;
  const output = [];
  const seen = new Set();

  if (context === 'journey-map') {
    if (progression && Number.isFinite(progression.overallLevel)) {
      addUnique(output, suggestion({
        id: 'journey-map:progression',
        kind: 'journey-progress',
        priority: 300,
        messageKey: 'companion.suggestion.recorded-level',
        messageParams: {
          overallLevel: progression.overallLevel,
          ...(typeof progression.rank === 'string' ? { rank: progression.rank } : {}),
        },
        source: 'progression',
      }, generatedAt, expiresAt), seen);
    }
    addUnique(output, fallbackCandidate(context, generatedAt, expiresAt), seen);
    return output;
  }

  const planItems = rankedPlanItems(plan);
  const firstPlanItem = planItems[0];
  const selected = profileGame(domains);

  // Home: offer TWO games for the same cognitive domain in a single push
  // (spec: not one recommendation after another). Falls back to the singles
  // when no valid same-domain pair exists for the focus domain.
  if (context === 'home') {
    const focusDomainId = firstPlanItem?.domainId ?? selected?.domainId ?? null;
    const pair = pairCandidate(context, focusDomainId, generatedAt, expiresAt);
    if (pair) {
      addUnique(output, pair, seen);
      addUnique(output, fallbackCandidate(context, generatedAt, expiresAt), seen);
      return output;
    }
  }

  addUnique(
    output,
    planCandidate(context, firstPlanItem, plan ?? {}, generatedAt, expiresAt),
    seen,
  );

  if (!firstPlanItem || selected?.gameId !== firstPlanItem.gameId) {
    addUnique(output, profileCandidate(context, selected, generatedAt, expiresAt), seen);
  }

  addUnique(output, fallbackCandidate(context, generatedAt, expiresAt), seen);
  return output;
}
