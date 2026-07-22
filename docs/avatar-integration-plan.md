# Avatar Integration Plan

## Scope and architectural baseline

This plan uses the existing `chatBot` branch as its source and architectural baseline. The avatar integration must preserve the current chatbot, training-plan, game-session, journey, authentication, and localization behavior.

The implementation should continue using React Context where state must be shared across routes, component-local state where it is not shared, browser storage for chat persistence, and the existing custom-event mechanism for loosely coupled session celebrations. It does not require Redux, Zustand, or another state-management library.

## Current avatar implementation

The repository currently has two avatar implementations.

### Animated companion

`frontend/src/components/companion/CompanionAvatar.tsx` is mounted above the router in `frontend/src/App.tsx`, making it visible throughout the application. It is a proactive coaching companion rather than the AI chat launcher.

Its behavior includes:

- Page-aware scripted message queues for home, games, individual games, journey, and other routes.
- Personalized suggestions loaded from `GET /api/me/companion` when an authenticated token is available.
- Quick replies and game navigation using an internal game-ID-to-route mapping.
- Local pose, message, dismissal, flight, and celebration state.
- A flight sequence that launches after inactivity, roams in the side gutter, and lands before reopening its message bubble.
- A listener for the `neurostep:companion-celebrate` browser event emitted after relevant progression results.
- Reduced-motion detection and static PNG fallbacks.

`frontend/src/components/companion/AvatarClip.tsx` plays the transparent WebM/MP4 assets in `frontend/public/companion/anim`. It keeps two video elements mounted and cross-fades them when a clip changes. Available clips are idle, talk, think, celebrate, jet launch, jet cruise, and jet land.

Static pose images in `frontend/public/companion` are used if video playback fails. `CompanionAvatar.css` owns positioning, roaming, bubbles, responsive behavior, and animation transitions.

### Journey avatar

`frontend/src/components/journey/Avatar.tsx` is a separate emoji-based Framer Motion component. It accepts progression states `idle`, `climb`, `drop`, and `celebrate`. It is used by:

- `frontend/src/pages/journey/JourneyPage.tsx`
- `frontend/src/components/ui/SessionResults.tsx`

This second implementation duplicates the mascot concept and should eventually be replaced by a presentation-only form of the existing animated companion. Progression semantics must remain unchanged even if their visual representation changes.

## Current chat-opening flow

`frontend/src/components/chat-assistant/ChatAssistant.tsx` owns its own `isOpen` state. Its internal `openChat()` function validates or renews the stored session and then opens the overlay. The visible `עוזר AI` toggle button calls this function.

There is no shared chat controller, context, exported open function, or global open-chat event. Consequently, the animated companion cannot currently open the AI chat. Clicking it only toggles the companion's scripted speech bubble.

`ChatAssistant` is rendered separately on the home, games listing, and journey routes. It is not rendered on individual game routes, login/signup routes, or admin routes.

Chat behavior that must be preserved includes:

- Ten-minute session expiry and renewal.
- `localStorage` persistence under `neurostep.chat.session.v1`.
- Session reset on new conversation, login, signup, Google login, logout, and account change.
- Submission of the prompt, session ID, and recent history to `POST /api/askAI`.
- Loading, error, Markdown-link rendering, overlay-close, and keyboard behavior.
- Backend data-access planning, grounded personal answers, stored session-state patches, and the existing training-plan response rules.

The proposed integration should move chat visibility control into a small React Context at the application root. `ChatAssistant` remains the owner of messages, persistence, API calls, and rendering; the context only exposes commands such as `openChat` and `closeChat` and the current visibility state. This is sufficient for route-level and avatar-level coordination without adding a state library.

## Required behavior by route

### Home page

- Display the existing animated companion using its current side-gutter positioning and fallback behavior.
- Preserve the personalized greeting and recommendation flow.
- Clicking the avatar should open the AI chat through the shared chat controller.
- Proactive scripted messages may remain, but they must not compete visually with the AI chat. Opening AI chat closes or suppresses the scripted bubble.
- The current AI chat launcher may remain during the first phase for discoverability. If it is later removed, the avatar must have an accessible label that clearly identifies it as the AI assistant.
- Unauthenticated users may open the chat, but personalized claims must continue to depend on authenticated backend data.

### Game pages

Game routes include the instructions state followed by the active game state.

During instructions:

- Render a presentation-only animated avatar in the shared `GameInstructionsView` so all games receive identical integration.
- Use an instructional or encouraging message derived from the existing bilingual instruction data rather than duplicating per-game text.
- The avatar must not obscure the back button, rules, tips, cognitive-area list, or start button.
- Clicking it may open AI chat for questions about the game, provided opening the overlay does not start the game or discard instruction state.

During active play:

- Keep the avatar outside the Phaser canvas and controls.
- Default to a quiet, non-roaming state to minimize distraction.
- Do not automatically open speech bubbles over timed rounds.
- Clicking it may open chat only if doing so does not silently continue a timed or reaction-sensitive game. The implementation must first define a consistent pause strategy for every game. Until such a strategy exists, active-play chat opening should be disabled or require an explicit exit/pause action.
- Preserve `useGameSession`, WebSocket reporting, disconnection finalization, adaptive adjustments, and result overlays.
- On a progression event, use the animated celebration clip without changing report finalization or navigation behavior.

### Tracking page

The tracking page is `JourneyPage`, with local `activeTab` state for `map` and `plan`.

- Replace the journey emoji avatar with the shared animated avatar presentation while preserving `prog.avatarState` semantics.
- Keep the existing map/plan tab state local to `JourneyPage`; avatar integration does not justify moving it into global state.
- Clicking the avatar should open AI chat without resetting the active tab.
- The chat should be able to reference the current training plan using the existing backend training-plan data and link behavior.
- A chat link to `/journey` cannot currently select the plan tab. If deep-linking directly to the plan is required, add an optional URL query such as `?tab=plan` and initialize/synchronize `activeTab` from it. This is a separate routing enhancement and should not be assumed without product confirmation.
- Session-result celebrations should use the same animated presentation API as the journey header, but should not mount another proactive companion message system.

## Proposed shared avatar API

Split visual playback from proactive-companion behavior. `CompanionAvatar` remains the page-aware controller, while a reusable presentation component renders clips in journey, results, and instructions.

Proposed interface:

```ts
export type AvatarMode =
   | 'idle'
   | 'talk'
   | 'think'
   | 'celebrate'
   | 'climb'
   | 'drop';

export interface AnimatedAvatarProps {
   mode?: AvatarMode;
   size?: 'small' | 'medium' | 'large' | number;
   interactive?: boolean;
   label?: string;
   className?: string;
   onActivate?: () => void;
   onAnimationEnd?: (mode: AvatarMode) => void;
   reducedMotionBehavior?: 'static' | 'minimal';
}
```

`AnimatedAvatar` should:

- Reuse `AvatarClip` and the existing media assets.
- Map progression-only states such as `climb` and `drop` to the closest available clip initially. New media should not be assumed.
- Render a button only when interactive; otherwise render a non-focusable presentation element.
- Select a stable PNG pose for reduced motion or video failure.
- Contain no routing, API access, personalized-message logic, chat state, or timers.

`CompanionAvatar` should compose `AnimatedAvatar` and retain its message queue, personalized data request, flight state machine, and game navigation.

The shared chat API should be deliberately small:

```ts
interface ChatControllerValue {
   isOpen: boolean;
   openChat: (
      source?: 'button' | 'avatar' | 'instructions' | 'journey'
   ) => void;
   closeChat: () => void;
}
```

The optional source is for diagnostics and behavior coordination only; it must not create separate chat histories.

## Message priority rules

Only one avatar message surface should be prominent at a time. Priority, highest first:

1. Safety and interruption states: active-game pause/exit requirements, connection errors, or actions needed to avoid losing a session.
2. Session result and progression celebration.
3. User-requested AI chat and its loading/error state.
4. Contextual instruction help explicitly requested by the user.
5. Personalized training-plan or game recommendation messages.
6. General page greeting and encouragement.
7. Idle re-engagement and roaming behavior.

Rules:

- Opening AI chat closes or suppresses the proactive companion bubble and cancels re-engagement timers while chat remains open.
- Celebration may temporarily change the avatar clip, but must not close an active AI conversation or alter its stored session.
- A user-dismissed proactive bubble stays dismissed until the existing page/context reset condition.
- Route changes may update proactive messages but must not reset the AI chat session.
- Active games suppress automatic messages and roaming.
- Do not display two copies of the avatar speaking simultaneously.
- Messages shown in shared instruction UI must use `LanguageContext` and existing bilingual data.

## Training-session timing behavior

The repository has no shared training-session countdown. It currently contains:

- Per-round and reaction timers inside individual games.
- Measured session duration in game analytics and reports.
- A training plan with recommended sessions per week.
- Chat session-state fields for `availableMinutes` and `recommendedSessionLengthMin`.
- Onboarding answers about available concentration time.

These concepts should not be combined implicitly.

Initial avatar integration should:

- Leave all game and round timers unchanged.
- Treat recommended session length as advice, not an automatic game cutoff.
- Allow the avatar/chat to explain a recommendation already returned by the backend.
- Avoid presenting a duration unless it comes from existing stored/session data or an explicit, documented default.
- Continue measuring real elapsed duration through the existing game-session pipeline.

If a cross-game training timer is added in a later phase:

- Start it only when the user starts active play, not while reading instructions or chatting.
- Pause it when the game is explicitly paused or the document is hidden, provided that policy is applied consistently across all games.
- At the recommended time, show a non-blocking completion suggestion rather than terminating the game.
- Let the user continue, finish the current round, or end the session.
- Keep recommendation time separate from the measured session duration sent to analytics.
- Store timer state at a scope that survives chat opening but does not leak between users or unrelated game sessions.

Because games do not share a pause contract today, the cross-game timer is not part of the first implementation phase.

## Files expected to change

Core integration:

- `frontend/src/App.tsx` — mount one persistent chat surface and its controller without changing route protection.
- `frontend/src/main.tsx` — add the chat controller provider if it is not composed directly in `App`.
- `frontend/src/components/chat-assistant/ChatAssistant.tsx` — consume shared visibility commands while preserving all session and API logic.
- `frontend/src/components/chat-assistant/ChatAssistant.css` — only if avatar-triggered layout requires it.
- `frontend/src/components/companion/CompanionAvatar.tsx` — compose the shared avatar and coordinate proactive messages with chat visibility.
- `frontend/src/components/companion/CompanionAvatar.css` — route/mode-specific positioning and suppression.
- `frontend/src/components/companion/AvatarClip.tsx` — only if the presentation API requires generalized sizing or playback control.
- `frontend/src/components/game-instructions/GameInstructionsView.tsx` — add the reusable instruction avatar once.
- `frontend/src/pages/journey/JourneyPage.tsx` — replace the journey-specific avatar and preserve local tab state.
- `frontend/src/components/ui/SessionResults.tsx` — use the animated avatar for progression results.

Expected new files:

- `frontend/src/context/ChatControllerContext.tsx` — minimal visibility/command context.
- `frontend/src/components/companion/AnimatedAvatar.tsx` — presentation-only shared avatar API.
- A colocated stylesheet if existing companion styles cannot be safely reused.

Potential cleanup after functional integration:

- `frontend/src/components/journey/Avatar.tsx` — remove after all imports are migrated.
- `frontend/src/components/chat-assistant/chatSessionStorage.ts` — move the `Message` type to a neutral types file to eliminate its reverse type dependency on `ChatAssistant`.
- Central game metadata files — consolidate duplicated ID-to-route mappings only as a separate, verified refactor.

No backend changes are expected for the first avatar integration. Backend work is necessary only if new message content, persisted timing, or route-specific context must be sent to the assistant.

## Implementation phases

### Phase 1: Shared foundations

- Add the presentation-only `AnimatedAvatar` wrapper over `AvatarClip`.
- Add the minimal chat controller context.
- Mount `ChatAssistant` once at application scope.
- Verify that chat persistence, reset events, authentication transitions, navigation links, and overlay behavior are unchanged.

### Phase 2: Home integration

- Connect the global companion activation to `openChat`.
- Coordinate proactive bubble visibility, roaming timers, and AI chat visibility using the priority rules.
- Preserve personalized `/api/me/companion` behavior and game quick replies.

### Phase 3: Tracking and results

- Replace the journey emoji avatar with `AnimatedAvatar`.
- Map progression states to available clips/fallback poses.
- Replace the session-results avatar and preserve celebration-event behavior.
- Confirm that opening/closing chat does not reset `activeTab` or fetched journey data.

### Phase 4: Game instructions

- Integrate the avatar once in `GameInstructionsView`.
- Use existing instruction and language data.
- Validate every game wrapper, responsive layout, and start/back behavior.

### Phase 5: Active-game policy

- Audit pause and visibility behavior for all eight games.
- Decide whether chat is disabled, pauses the game, or requires leaving active play.
- Add quiet avatar presentation only after the policy is consistent and session finalization is protected.

### Phase 6: Cleanup and hardening

- Remove the unused journey avatar implementation.
- Consolidate types and safe metadata duplication where beneficial.
- Add performance checks for multiple video instances and mobile layouts.
- Consider URL-controlled journey tabs only if direct plan-tab links are required.

## Test plan

### Automated frontend tests to add

The repository currently has no frontend component-test setup. Add a lightweight Vite-compatible test setup only when implementation begins, and test:

- Avatar activation calls the shared `openChat` command.
- Chat opened by the avatar uses the same messages and session ID as chat opened by the legacy button.
- A session expires after the existing ten-minute TTL.
- New-conversation and authentication reset events still clear chat state.
- Route changes do not reset an active chat session.
- Opening chat suppresses the proactive bubble and re-engagement timers.
- Closing chat restores only the permitted proactive behavior.
- Reduced-motion mode renders a stable fallback and avoids roaming.
- Video failure renders the correct PNG fallback.
- Celebration changes the visual state without clearing chat history.
- Journey map/plan selection survives chat open/close.
- Instruction avatar content changes with language and does not start the game.
- Active-game behavior follows the chosen pause/disable policy.

### Existing automated checks

- Frontend type check and production build: `cd frontend && npm run build`
- Frontend lint: `cd frontend && npx eslint .`
- Game-server type build: `cd game-server && npm run build`
- Game-server tests: `cd game-server && npm test`

There is no declared backend test, lint, or build script. Backend behavior should be left unchanged in the initial phases.

### Manual coverage

- Home, games list, every instruction screen, every active game, journey map, journey plan, and session results.
- Logged-out, email-authenticated, Google-authenticated, logout, expired token, and user-switch flows.
- Hebrew RTL and English LTR.
- Keyboard-only navigation and screen-reader announcements.
- Narrow mobile, tablet, desktop, and reduced-width game canvases.
- WebM supported, MP4 fallback, video failure, autoplay restriction, slow load, and offline API failure.
- `prefers-reduced-motion` and the application's pause-animation accessibility setting.
- Chat internal links and browser back/forward navigation.

## Accessibility requirements

- Interactive avatars must use a semantic `button`, be keyboard reachable, and support Enter and Space activation.
- The accessible label must describe the action, such as “Open AI assistant,” rather than only naming the mascot.
- Decorative avatar instances must be hidden from assistive technology and must not be focusable.
- Focus must move predictably into the chat dialog when it opens and return to the invoking control when it closes.
- The chat overlay must retain its existing close-by-button and close-by-overlay behavior, with Escape support added if absent.
- Proactive messages should not repeatedly interrupt screen readers. Use live regions sparingly and avoid re-announcing idle animation changes.
- Animation must honor both `prefers-reduced-motion` and `html.a11y-pause-animations`.
- Reduced-motion behavior must remove roaming, repeated bouncing, and cross-fade dependence while keeping controls understandable.
- Video/PNG failure must not remove the chat-opening control.
- The avatar and speech bubbles must meet contrast requirements and remain legible in RTL and LTR layouts.
- The avatar must never cover primary navigation, form fields, game controls, timed-game indicators, instruction actions, or accessibility controls.
- Touch targets should be at least 44 by 44 CSS pixels.
- Meaning conveyed by celebration, climb, or drop animations must also appear as text in the existing result/progression UI.

## Risks and assumptions

### Risks

- Moving `ChatAssistant` from route-local mounting to application scope changes its lifetime. Incorrect migration could expose it on unintended routes or interfere with auth reset events.
- Two conversational surfaces can confuse users unless proactive messages and user-requested AI chat are explicitly coordinated.
- Multiple animated avatar instances may increase decoding, memory, battery, and network cost, especially on mobile.
- Transparent video behavior varies across browsers; PNG fallback must remain first-class.
- The companion's current gutter positioning may overlap content on narrow layouts or game canvases.
- Active games lack a shared pause contract. Opening an overlay could allow timers to continue and invalidate results.
- Existing avatar messages are largely hard-coded Hebrew, while the rest of the application supports Hebrew and English.
- Mapping `climb` and `drop` to existing clips may not communicate the same progression meaning as the current Framer Motion avatar.
- Browser custom events are weakly typed; adding more cross-component events would increase coordination risk. React Context should handle chat visibility instead.
- Centralizing game IDs and routes during avatar work could unintentionally break navigation. Treat that cleanup separately.
- The accessibility widget's global animation suppression may interact with inline animation styles in the companion flight state machine.

### Assumptions

- The animated companion in `frontend/public/companion` is the avatar to integrate throughout the site.
- Existing media assets are sufficient for the initial implementation; no new artwork is assumed.
- `chatBot` behavior at commit `11ad4ec0` is the required baseline.
- The AI chat should remain one logical session regardless of which avatar or button opens it.
- Training-duration recommendations remain advisory until a product requirement defines a shared timer and pause policy.
- Journey tab state remains local unless direct-link requirements are explicitly added.
- Admin and authentication pages are outside the initial avatar rollout unless later requested.
- No new global state library is necessary; a small React Context provides the required coordination.

### SessionResults integration deferred

`SessionResults` is mounted by all eight game pages, but normal gameplay
currently reaches it only from Shapes Click.

The other games navigate directly to `/games` without explicitly ending the
active session while the page remains mounted. As a result, the server may
finalize the session after the results UI has already been unmounted.

Replacing the results avatar is deferred until the games share a consistent
session-ending and results-display flow.
