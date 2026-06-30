---
description: "Use when authoring styles: CSS, CSS Modules, Tailwind classes, or styled-components in a React + TS project. Covers tokens, responsive design, theming, and class composition."
applyTo: "**/*.{css,scss,module.css,module.scss,tsx,jsx}"
---

# Styling Guidelines

## Approach

- Pick **one** styling approach for the project and stick to it. Options, in rough order of preference for new projects:
  1. **CSS Modules** (`*.module.css`) — colocated, scoped, zero runtime.
  2. **Tailwind CSS** — utility-first, fast iteration. Requires discipline to extract repeated patterns.
  3. **CSS-in-JS** (styled-components, Emotion) — only when dynamic theming/runtime styling is required.

- Do not mix approaches in the same component without a documented reason.

## Tokens & Theming

- Colors, spacing, font sizes, radii, and shadows live as **design tokens** (CSS custom properties or a Tailwind config).
- Reference tokens; never hardcode hex values, raw pixel spacing, or magic numbers in component styles.
- Support dark mode via `prefers-color-scheme` and/or a `[data-theme]` attribute on `<html>`. Tokens swap; components don't change.

## Layout

- Use Flexbox/Grid for layout. No floats. No absolute positioning except for true overlays (tooltips, popovers).
- Mobile-first: base styles target small screens; use `min-width` media queries (or Tailwind `sm:`/`md:`/`lg:`) to scale up.
- Respect `prefers-reduced-motion` — gate non-essential animations behind it.

## Class Composition (Tailwind specifically)

- Use a helper like `clsx` or `cva` for conditional/variant classes. Don't concatenate strings inline beyond ~2 conditions.
- Extract repeated utility clusters into a component or a `@layer components` rule once it appears in 3+ places.
- Order: layout → box model → typography → color → state (`hover:`, `focus:`) → responsive.

## CSS Modules specifically

- Class names use camelCase in JS, kebab-case in CSS file; Modules handles the mapping.
- Compose shared styles with `composes:`, not by duplicating selectors.

## Don'ts

- No `!important` unless overriding a third-party style you don't control. Comment why.
- No inline `style={{ … }}` for static styles. Inline styles are for **dynamic** values only (e.g. computed transforms).
- No global selectors (`* { … }`, bare `a { … }`) outside a single `globals.css` reset.
