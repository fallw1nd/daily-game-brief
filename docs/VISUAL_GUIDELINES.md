# Visual reference

The accepted ReadingApp implementation and `docs/READING_SAMPLE.md` describe the current default UI. The original hierarchy below remains a reference for the classic view; do not undo an accepted design merely to match old numeric values. Use Phosphor icons consistently.

## Permanent Editorial Hierarchy

Treat the product as news, never a marketing landing page. Keep this type language stable across themes:

- L0 site chrome: 12px JetBrains Mono, weight 600, tabular figures.
- L1 edition H1: Inter with Noto Sans SC/system fallback, 40px desktop/32px mobile, weight 500, line-height 1.05.
- L2 section headings: 28px desktop/24px mobile, weight 600, line-height 1.2; 12px semantic-accent mono numbers.
- L3 story headlines: 22px desktop/19px mobile, weight 600, line-height 1.35; summaries 15.5px/1.75 near 65 characters per line.
- L3a story subject: game/product name at 18px desktop/17px mobile, weight 650, line-height 1.28, with a semantic-accent rule; it appears before the event headline.
- L4 evidence: 11–12px JetBrains Mono, line-height 1.5, muted text; semantic-accent links and active states.

Use `#000000`, `#FFFFFF`, `#A1A1AA`, and default `#EA580C` in dark mode; use warm paper `#F6F1E8`, ink `#1A1714`, and default `#B34200` in light mode. Reader-selectable cobalt, jade, violet, and rose accents may replace orange only through the approved `DESIGN.md` semantic tokens; typography and hierarchy never change with accent choice. Group with rules, columns, and spacing—not large rounded story cards. Ban promotional slogans and generic AI copy.

## Archive Titles, Themes & Search

Every manifest item needs a distinctive `archiveTitle` formatted `早报｜本期重磅事实`, `晚报｜本期重磅事实`, or `日报｜本期重磅事实` according to its `period`, plus a `leadEntryId` resolving to that story. Render the same `archiveTitle` as the edition page H1; never fall back to generic `游戏早报`, `游戏晚报`, or `游戏日报` when the field exists. Prefer a major game, publisher/platform decision, or widely discussed event; never overstate rumor status. Schema v2 archives store the same fields. Historical title corrections require explicit approval.

Maintain accessible dark/light themes with persistent keyboard-operable switching. Hide empty departments from content, directories, and top-level links. Archive rows represent editions; cross-edition search links results to their source edition and entry anchor.

Keep top navigation to `内容`, `日历`, and `归档`. Use `DAILY EDITION` as the nonnumeric masthead eyebrow and show `NO.###` only once in top chrome. Let edition H1 titles use the full available width and remain single-line when they fit. Reserve inset space for archive selection rails so they never overlap issue or date text.

