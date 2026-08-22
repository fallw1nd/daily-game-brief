# Brief media

Scheduled publishers place durable editorial media here:

```text
public/media/briefs/YYYY/MM/<edition-id>/<story-or-game-id>.webp
```

Use 16:9 crops for news and 3:4 covers for upcoming games. Prefer official press assets, retain their source URL and credit in JSON, and keep files below 500 KB when practical.

Never replace an image in an archived edition without marking the edition revised. Never delete media referenced by an archived JSON file.

The UI fallbacks under `public/media/fallback/` support legacy editions only. New editions must provide real assets.
