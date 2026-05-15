# Adding a New Game to NeuroStep

Copy this folder and follow the checklist below.
Each step maps to a `// STEP N:` comment in the template files.

## Checklist

- [ ] Copy `_template/` → `games/your-game-name/`
- [ ] Rename `TemplateScene` → `YourGameScene` (class name + scene key + constructor super call)
- [ ] Rename `TemplatePage` → `YourGamePage` (component name)
- [ ] Add your `GameId` string to `frontend/src/types/game.types.ts`
      ```ts
      export type GameId = ... | 'your-game-name';
      ```
- [ ] Add your event types to `GameEventType` in `frontend/src/types/game.types.ts`
      ```ts
      // your-game-name
      | 'YOUR_EVENT_A'
      | 'YOUR_EVENT_B'
      ```
- [ ] Replace `'REPLACE_WITH_GAME_ID'` in `YourGamePage.tsx` with your GameId string
- [ ] Define your `GameConfig` in `YourGamePage.tsx` (STEP 3)
- [ ] Implement `create()` and `update()` in `YourGameScene.ts` (STEP 2)
  - Use `this.fireAction(type, payload, reactionMs, correct)` for **every** player action
  - Never call WebSocket or Kafka directly from a scene
- [ ] Implement `applyParams(params)` — apply relevant difficulty fields to your config
- [ ] Add a route in `frontend/src/App.tsx`
- [ ] Add a `computeAdjustment` case in `game-server/server.ts` for your gameId
  - Add your event types to `SCORED_TYPES`
  - Add difficulty adjustment logic (or delegate to a new file under `agents/`)
- [ ] Add your game card to `frontend/src/pages/games/GamesPage.tsx`

## Architecture contract

```
YourGameScene                    YourGamePage
  fireAction(type, payload)  →  sendEvent(action)    ← useGameSession
                                    │
                                    ▼
                              game-server/server.ts
                                    │
                              ┌─────┴──────────┐
                              ▼                ▼
                          Kafka topic       computeAdjustment()
                          game-events           │
                              │            ws.send({ type:'adjustment', params })
                         Kafka UI                 │
                         :8080            applyParams(params)
                                              │
                                         YourGameScene
```

Every event the player generates flows left-to-right through this pipeline.
The game never knows about Kafka — it only calls `fireAction()`.
The page never knows about Phaser internals — it only holds `sceneRef.current`.
