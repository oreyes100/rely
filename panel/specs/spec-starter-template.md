# Feature Specification: Dark Mode Preference

> ⚠️ **Starter example.** Duplicate this file (e.g. `dark-mode-preference.spec.md`), fill the `[brackets]`,
> and update **Status** to `Draft`. Real specs are also generated on the spot in opencode with `/speckit.specify`.

**Feature Branch**: `[###-dark-mode-preference]`

**Created**: 2026-08-14

**Status**: Draft

**Input**: User description: "Add a dark mode toggle that persists the user's preference across sessions and devices."

## User Scenarios & Testing *(mandatory)*

Stories are PRIORITIZED as user journeys. Each must be independently testable (a viable MVP on its own).

### User Story 1 - Toggle theme in-page (Priority: P1)

When I'm on any page, I can flip a switch to switch between light and dark themes and see the change immediately.

**Why this priority**: This is the core value of the feature; nothing else is ship-able without it.

**Independent Test**: Can be fully tested by opening the app, toggling the switch, and confirming the UI theme changes in under 2 seconds with no reload.

**Acceptance Scenarios**:

1. **Given** the user is on any app page with the theme switch visible, **When** they click/tap the toggle, **Then** the UI theme switches to the opposite scheme within 250 ms and the switch reflects the new state.
2. **Given** a theme has been selected, **When** the user navigates between pages, **Then** the selected theme persists for the session.

---

### User Story 2 - Persist preference locally (Priority: P2)

My theme choice survives closing/reopening the browser.

**Why this priority**: A toggle that resets on reload provides a broken, low-trust experience.

**Independent Test**: Toggle theme, close the browser tab, reopen the app URL, and confirm the previously chosen theme is applied.

**Acceptance Scenarios**:

1. **Given** the user has chosen a theme, **When** the browser session ends and restarts, **Then** the last-selected theme is reapplied on load.
2. **Given** no preference is stored yet, **When** the app loads for the first time, **Then** it respects the OS-level `prefers-color-scheme` default.

---

### User Story 3 - Sync preference across devices (Priority: P3)

My theme choice on one device appears on my other devices signed into the same account.

**Why this priority**: Nice-to-have polish; the core problem is solved by Story 1+2.

**Independent Test**: Set a theme on device A, then sign in on device B and confirm the theme matches.

**Acceptance Scenarios**:

1. **Given** the user is signed in, **When** they change the theme on device A, **Then** device B shows the same theme within 5 seconds of a page load.
2. **Given** the user is signed out, **When** they change the theme, **Then** the choice is stored only in local storage and not synced.

---

### Edge Cases

- What happens when `prefers-color-scheme` changes at runtime (OS toggles while app open)? → Listen for `change` event only if no explicit preference is stored.
- How does the system handle an offline change that should sync later? → Write to local store immediately, enqueue a synced write on reconnect.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide a theme toggle control in the header/app shell.
- **FR-002**: System MUST persist the user's theme preference in `localStorage` (key: `theme`).
- **FR-003**: System MUST apply the stored theme on initial page load before first paint.
- **FR-004**: When the user is signed in, System MUST sync the preference to `user.settings.theme` and broadcast changes in real time.
- **FR-005**: System MUST respect the OS `prefers-color-scheme` as the default when no preference is stored.

### Key Entities

- **User**: an authenticated principal; may have a `settings.theme` attribute (`light | dark | system`).
- **ThemePreference**: `{ source: 'user' | 'local' | 'system', value: 'light' | 'dark' }`; source determines precedence and sync behavior.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Theme switch applies in < 250 ms without a page reload.
- **SC-002**: Preference persists across browser restarts (100% of test cases).
- **SC-003**: Cross-device sync reflects within 5 s for signed-in users.
- **SC-004**: First paint theme is correct on load (no flash of incorrect theme).

## Assumptions

- Users have JS enabled and a modern browser supporting CSS custom properties + `prefers-color-scheme`.
- Auth/session is handled by the existing `/api/users` surface (no new auth work here).
- Dark theme uses the same component library tokens; only the root color scheme flips.

## Out of Scope

- Custom theme editor (color pickers / per-accent tint selection) — future feature.
- System-wide OS theme enforcement — only CSS `prefers-color-scheme` is read for defaults.
