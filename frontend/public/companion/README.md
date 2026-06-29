# Companion mascot asset

Drop the NeuroStep robot mascot image here as:

    frontend/public/companion/neurostep-bot.png

- Use the PNG with a **transparent background**.
- It is served at runtime from `/companion/neurostep-bot.png` and rendered by
  `src/components/companion/CompanionAvatar.tsx`.
- Until the file exists, the component falls back to a simple SVG placeholder
  automatically (no build error).

Optional future poses (same path convention) for richer animation:
`neurostep-bot-wave.png`, `neurostep-bot-celebrate.png`, `neurostep-bot-think.png`.
