# Claude Dashboard — Design System

## Product context

A local web interface for Claude Code. It hosts one coding-agent session at a
time and gives it an interface worthy of what the underlying harness can do.

The user is a senior developer running long agent sessions on real repositories.
They keep this window open for hours, alongside an editor and a terminal. They
need to know at a glance what the agent is doing, what it changed, what it costs
and what it has in context — without reading a wall of log output.

This is a **dense professional tool**, not a marketing page. There is no hero,
no landing section, no feature grid, no testimonial, no call-to-action, no
gradient banner. Every pixel of chrome must earn its place.

## Key screens

1. **Home** — recent folders and resumable session cards. Becomes a multi-agent
   overview later, so the card grid must scale.
2. **Session** — the main screen. Top bar, wide conversation column, single
   right sidebar, status footer.
3. **Settings** — granted permissions, MCP servers, hooks, prompts, workflows.

## Three laws of the layout

These decide every ambiguous case.

1. **The conversation is sovereign.** Only agent text, user messages, workflow
   checkpoints and approval requests live in the centre column. Tool calls never
   appear there.
2. **Top to act, bottom to know.** The top bar contains only clickable controls.
   The footer contains only state, never a command.
3. **Nothing is permanently visible unless it earned it.** Every secondary panel
   is collapsed by default.

## Visual direction

Quiet, technical, high-signal. The interface recedes so the agent's work reads.
Think of a well-made code editor rather than a SaaS product page: neutral
surfaces, hairline borders, restrained colour used only where it carries
meaning.

Colour is semantic, never decorative. A coloured element means something:
pending approval, running step, added line, removed line, live session. Nothing
is coloured to look lively.

No gradients on surfaces. No glassmorphism. No drop shadows except on genuinely
floating layers (popover, command palette). No rounded-pill buttons. No emoji as
interface iconography.

## Colour

Both themes ship complete. Dark is the default; light must be equally finished,
not an afterthought.

### Dark (default)

| Token | Value | Use |
|---|---|---|
| `--bg` | `#0e0f11` | Application background |
| `--surface` | `#141619` | Top bar, footer, sidebar |
| `--surface-raised` | `#1a1d21` | Popover, palette, cards |
| `--border` | `#26292e` | Hairline separators |
| `--border-strong` | `#33373d` | Focused or active edges |
| `--text` | `#e8eaed` | Primary text |
| `--text-muted` | `#9aa0a8` | Secondary text, labels |
| `--text-faint` | `#646a72` | Counters, timestamps |
| `--accent` | `#6b8afd` | Current step, active tab, focus ring |
| `--accent-soft` | `rgba(107,138,253,.12)` | Active tab background |
| `--warn` | `#e0a23c` | Pending approval, dirty working tree |
| `--warn-soft` | `rgba(224,162,60,.10)` | Approval block background |
| `--ok` | `#5ec26a` | Completed step, live session, added lines |
| `--danger` | `#e06a6a` | Deny action, removed lines |

### Light

| Token | Value | Use |
|---|---|---|
| `--bg` | `#ffffff` | Application background |
| `--surface` | `#f7f8f9` | Top bar, footer, sidebar |
| `--surface-raised` | `#ffffff` | Popover, palette, cards |
| `--border` | `#e3e5e8` | Hairline separators |
| `--border-strong` | `#c9ccd1` | Focused or active edges |
| `--text` | `#16181b` | Primary text |
| `--text-muted` | `#5c6269` | Secondary text, labels |
| `--text-faint` | `#8a9098` | Counters, timestamps |
| `--accent` | `#3558d4` | Current step, active tab, focus ring |
| `--accent-soft` | `rgba(53,88,212,.09)` | Active tab background |
| `--warn` | `#b4741a` | Pending approval, dirty working tree |
| `--warn-soft` | `rgba(180,116,26,.09)` | Approval block background |
| `--ok` | `#2f8f42` | Completed step, live session, added lines |
| `--danger` | `#c0392f` | Deny action, removed lines |

## Typography

Two families only.

**Interface** — Inter. Used for everything that is not code.
**Monospace** — JetBrains Mono. Used for file paths, shell commands, diffs,
token counts, branch names, model identifiers and cost figures. Anything a user
might copy or compare character by character is monospace.

| Role | Size | Weight | Notes |
|---|---|---|---|
| Conversation body | 14px / 1.6 | 400 | The only generous line height in the app |
| Interface default | 13px / 1.45 | 400 | Panels, menus, cards |
| Section header | 11px / 1.4 | 600 | Accordion headers, uppercase, .06em tracking |
| Label | 10px / 1.3 | 500 | Counters, metadata, uppercase, .07em tracking |
| Footer | 11px / 1.3 | 400 | Status strip |
| Code and diff | 12px / 1.55 | 400 | Monospace |

No font larger than 18px anywhere in the application, including the home screen
title. This is a tool, not a page.

## Spacing and density

Base unit 4px. The scale is 4 / 6 / 8 / 10 / 12 / 16 / 20 / 24.

Deliberately tight. Panel rows are 24-28px tall. Accordion headers are 30px.
The top bar and footer are fixed: 40px and 26px respectively.

| Region | Dimension |
|---|---|
| Top bar height | 40px |
| Footer height | 26px |
| Right sidebar width | 280px |
| Conversation max width | 760px, centred in remaining space |
| Popover width | 360px |
| Command palette width | 560px |

The conversation is capped so long lines stay readable even on a wide monitor.
The space left over is empty, not filled.

## Shape and depth

Radius: 5px on controls and blocks, 7px on cards and popovers, 99px only on
status dots. Nothing else is round.

Borders are 1px and do most of the separation work. Shadows exist only on
floating layers, and stay soft and low: `0 10px 28px rgba(0,0,0,.30)` in dark,
`0 8px 24px rgba(16,18,20,.10)` in light.

## Components

**Control pill** — the top bar dropdowns (model, effort, permission mode,
process). 1px border, 5px radius, 22px tall, label plus a small chevron. Neutral
by default; the permission-mode pill turns `--warn` when set to manual, because
that state means the session can stop and wait.

**Accordion section** — a 30px header with a disclosure triangle, a title, and a
right-aligned counter in `--text-faint`. Body rows are 26px, 5px radius, a
barely-there fill (`rgba(127,127,127,.06)`), with trailing metadata right-aligned
in monospace.

**Sidebar selector** — three icon tabs across the top of the sidebar, 34px tall.
The active tab carries `--accent-soft` and a 2px bottom border in `--accent`.

**Approval block** — 1px `--warn` border, `--warn-soft` fill, a header naming
the tool and its target, a monospace body showing the exact command or diff, and
three actions: allow, always-allow, deny. Keyboard hints sit inside the buttons
in `--text-faint`.

**Anchored approval reminder** — a single 28px row directly above the composer,
same warn treatment, present only while something waits. It occupies no space
when nothing is pending.

**Checkpoint** — a 2px left border and a 4% tint. `--ok` when done, `--accent`
when running, `--warn` when it is a gate awaiting a decision. Carries the step
name, the model used and the elapsed time.

**Diff** — monospace, added lines in `--ok`, removed in `--danger`, on a tinted
background at 8% of the respective colour. No line numbers unless the hunk
exceeds ten lines.

**Context meter** — a 4px track, 52px wide, in the footer. Fills `--accent`,
switches to `--warn` past 80%. It is the only footer element allowed to attract
attention, and only when it should.

**Session card** (home) — 7px radius, 1px border, a status dot, the project
name, then a metadata line in monospace: branch, dirty count, relative time,
cost. Hover raises the border to `--border-strong`. No shadow, no lift.

## States

Every interactive element defines four states. Focus is never suppressed.

| State | Treatment |
|---|---|
| Hover | Border to `--border-strong`, fill up by 4% |
| Active | `--accent-soft` fill, `--accent` border or underline |
| Focus | 2px `--accent` outline at 2px offset, always visible |
| Disabled | 45% opacity, no pointer |

Empty states are a single line of `--text-muted`, never an illustration and
never a card with a call to action. A section with nothing in it collapses
rather than showing an empty frame.

## Motion

Almost none. 120ms ease-out on hover and focus, 160ms on accordion expand and
popover entry. Streaming text appears without animation — no typewriter effect,
no fade per token.

Nothing loops, pulses or bounces. The one exception is the generating indicator,
a slow two-second opacity cycle at low amplitude.

The reason is not minimalism for its own sake: this window stays open for hours
in peripheral vision, and any repeating movement becomes an irritant.

## Hard constraints for generation

Use ONLY the fonts, colours, spacing and component styles defined above. Do not
introduce any font, colour, gradient or visual style not listed here.

Specifically forbidden: hero sections, marketing copy, feature grids, pricing
tables, testimonials, decorative illustration, purple or pink accents, neon,
glassmorphism, surface gradients, pill-shaped buttons, emoji used as icons, and
any font other than Inter and JetBrains Mono.
