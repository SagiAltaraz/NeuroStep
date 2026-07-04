/**
 * A tiny global bus for the "the player just leveled up" moment.
 *
 * The CompanionAvatar lives at the app root, far from the per-game session
 * hook that knows about level-ups. Rather than thread a level-up prop through
 * the whole tree, the shared SessionResults overlay emits this event when a
 * report arrives with a node promotion, and the avatar listens for it and
 * plays its celebrate clip. One event name, no coupling between the two.
 */
export const CELEBRATE_EVENT = 'neurostep:celebrate';

export function emitCelebrate(): void {
   if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(CELEBRATE_EVENT));
   }
}
