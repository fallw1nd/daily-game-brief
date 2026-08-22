---
version: "neuform-top-creators-featured"
name: "Lumina — Onboarding Architecture"
description: "Lumina Architecture Onboarding Section is designed for building reusable UI components in modern web projects. Key features include reusable structure, responsive behavior, and production-ready presentation. It is suitable for component libraries and responsive product interfaces."
colors:
  primary: "#EA580C"
  secondary: "#000000"
  accent: "#D04D09"
  background: "#000000"
  surface: "#2C2A28"
  text-primary: "#FFFFFF"
  text-secondary: "#A1A1AA"
  border: "#2C2A28"
typography:
  display-lg:
    fontFamily: "Inter"
    fontSize: "64px"
    fontWeight: 500
    lineHeight: "1.04"
    letterSpacing: "0"
  body-md:
    fontFamily: "JetBrains Mono"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: "1.6"
  label-md:
    fontFamily: "JetBrains Mono"
    fontSize: "12px"
    fontWeight: 600
    lineHeight: "1.2"
spacing:
  base: "8px"
  gap: "16px"
  card-padding: "24px"
  section-padding: "80px"
rounded:
  card: "32px"
  control: "32px"
  pill: "9999px"
components:
  card:
    background: "Use the surface token with subtle borders and HTML-matched shadow depth"
    radius: "Match the declared card radius token"
  button:
    background: "Use primary or accent colors for the main action"
    radius: "Use the control or pill radius based on the source HTML"
---
# Lumina — Onboarding Architecture
Source: Neuform Featured templates from top creators. Author: Meng To (@mengto). Views: 238; favorites: 13; remixes: 3.
Tags: onboarding, animated, threejs, cta, bento, dither, charts, navigation.
## Overview
Lumina Architecture Onboarding Section is designed for building reusable UI components in modern web projects. Key features include reusable structure, responsive behavior, and production-ready presentation. It is suitable for component libraries and responsive product interfaces.

Lumina Flow OS · Experience Design Modules Kits Thesis Support Replace fragmented workflows with unified paper-soft interfaces. Discover clarity. A production-ready onboarding and form design system built for modern Saa…
## Composition
Use the attached HTML reference as the source of truth. Preserve the visible hierarchy, first-screen composition, section rhythm, density, and interaction tone before adapting copy or content.
Key visible headings include: Lumina; Replace fragmented workflows with unified paper-soft interfaces. Discover clarity.; The friction point.; Five pillars. Seamless adoption.; Contextual Entry; Guided Progression.
## Colors
Anchor the default palette in primary #EA580C, secondary #000000, accent #D04D09, background #000000, surface #2C2A28, text-primary #FFFFFF. Keep background, surface, text, and border roles distinct so generated layouts retain the same contrast pattern as the source.

The reader may switch the semantic accent without changing hierarchy or content. Approved pairs are orange (#EA580C dark / #B34200 light), cobalt (#7CA5FF / #2457C5), jade (#4DD9A7 / #087A52), and violet (#C58AFF / #7537A8). Accent colors belong to issue numbers, active rules, links, focus rings, selection, and small interaction signals. They must not become large reading backgrounds. Text must retain WCAG AA contrast; interactive state must also use shape, movement, underline, or labels rather than color alone.
## Typography
Use Inter for display moments and JetBrains Mono for body copy unless the HTML clearly demands a compatible fallback. Labels and technical metadata should use JetBrains Mono or an equivalent mono face. The edition H1 must display the issue's verified `archiveTitle` (for example, `晚报｜本期重磅事实`) rather than the generic `游戏早报` or `游戏晚报`; balance it to two lines on desktop and no more than three on narrow screens.
## Layout
Keep spacing deliberate and stable. Favor the same grid direction, max-width behavior, card density, and responsive stacking seen in the HTML. Do not replace distinctive source structures with generic SaaS sections.
## Components
Dashboard, chart, and data panels should preserve their compact operational hierarchy, nested surfaces, and metric emphasis.
## Motion
Preserve existing motion cues such as masked reveals, staggered entrance, hover lift, scroll-triggered transitions, and ambient movement. Keep easing smooth and restrained. Rectangular interactive regions use a boundary-aligned state layer plus an inset edge rule on hover or keyboard focus; do not place detached circles or ornaments behind labels. Keep article movement within 4px and entrance durations below 900ms; never animate body copy continuously. All nonessential motion must collapse under prefers-reduced-motion.

## Editorial Chrome
The sticky top bar uses a distinct chrome surface, a short accent signal rail, and a filled issue-number block. The footer alone carries publication ownership on the deepest chrome surface with a narrow accent termination rule; do not insert a duplicate publication-information panel above it. In dark mode, page, navigation, transient interaction layer, and footer must remain visibly distinct without raising body-copy brightness. Keep these regions square-edged and information-dense; do not convert them into floating rounded containers.
## WebGL & Effects

If the source includes canvas, WebGL, Three.js, gradients, particles, or atmospheric effects, rebuild them as supporting layers behind the content. Keep effects performant, responsive, and secondary to the interface.

## Guardrails
- Do not flatten the source into a generic card grid.
- Do not swap the color mode unless the source clearly supports it.
- Preserve the first viewport signal, focal object, and visual density.
- Keep buttons, cards, and badges aligned to the same radius and border language.