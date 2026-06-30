---
description: "Use when building or reviewing UI: forms, buttons, modals, menus, navigation, images, color choices, keyboard interaction, focus management, ARIA. Apply for any user-facing React component."
---

# Accessibility (a11y) Guidelines

Target: WCAG 2.1 AA.

## Semantics First

- Use the right element: `<button>` for actions, `<a href>` for navigation, `<label>` for inputs, `<nav>/<main>/<header>/<footer>` for landmarks.
- A `<div onClick>` is not a button. If you must, add `role="button"`, `tabIndex={0}`, and Enter/Space handlers — but prefer the real element.
- Headings (`h1`–`h6`) describe document structure. Don't skip levels for styling; style with CSS instead.

## Forms

- Every input has a `<label>` (visible) or `aria-label` / `aria-labelledby` (only when visible label is impossible).
- Group related inputs in `<fieldset>` with `<legend>`.
- Errors: link to the input via `aria-describedby` and use `aria-invalid="true"`. Announce dynamic errors with a live region.
- Required fields: `required` attribute, and a visible indicator (not color alone).

## Keyboard

- Everything interactive is reachable and operable with `Tab`, `Shift+Tab`, `Enter`, `Space`, and arrow keys (for composite widgets).
- Visible focus styles. Never `outline: none` without a replacement.
- Modals/dialogs: trap focus inside while open, restore focus to the trigger on close, close on `Escape`.

## Images & Media

- `<img>` requires `alt`. Decorative images get `alt=""`. Don't describe ("image of…").
- Icons that convey meaning need an accessible name (`aria-label` on the button, not the icon).
- Video/audio: provide captions and transcripts.

## Color & Contrast

- Contrast ratio ≥ 4.5:1 for body text, ≥ 3:1 for large text and UI components.
- Never convey information by color alone — pair with icon, text, or pattern.

## ARIA

- First rule of ARIA: don't use ARIA when a native element does the job.
- If you do use it, make sure the role, state, and properties are kept in sync with reality.
- Live regions (`aria-live="polite"`) for non-critical updates; `assertive` only for urgent ones.

## Testing

- Run `axe` (e.g. `vitest-axe` or `jest-axe`) in component tests:

  ```ts
  const { container } = render(<MyComponent />);
  expect(await axe(container)).toHaveNoViolations();
  ```

- Manually verify with keyboard-only navigation and a screen reader (VoiceOver / NVDA) for non-trivial widgets.
