# Brief media

Scheduled publishers place durable editorial media here:

```text
public/media/briefs/YYYY/MM/<edition-id>/<story-or-game-id>.webp
```

Use 16:9 crops for news. Covers preserve verified storefront ratios: PSN/eShop square, Xbox or PC store landscape, and physical editions portrait only when the preferred digital store has no listing. Retain source URL, credit, and `aspect` in JSON; keep files below 500 KB.

Never replace an image in an archived edition without marking the edition revised. Never delete media referenced by an archived JSON file.

The UI fallbacks under `public/media/fallback/` support legacy editions only. New editions must provide real assets.
