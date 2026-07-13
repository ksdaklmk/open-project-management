# Product

## Register

product

## Users

Members of a workspace team (PMs, designers, engineers) working tasks day to day:
triaging, re-prioritizing, reassigning, and tracking status across six views (List,
Board, Gantt, Timeline, Activity, Workload). They live in this tool for hours and
scan dense information fast. The job on any given screen is "find the task, change one
field, move on" without losing context.

## Product Purpose

A multi-tenant project-management app on a maintainable stack (React + Supabase). It
exists to make a team's work legible and editable in place: grouped, sortable tasks
with inline status / priority / assignee editing, fast enough to trust. Success is the
interface disappearing into the task.

## Brand Personality

Focused, calm, precise. The voice of a sharp tool, not a marketing site. Three words:
quiet, dense, dependable.

## Anti-references

- Generic SaaS-cream dashboards with rounded card grids and a hero metric.
- Gradient accents, glassmorphism, decorative motion, and oversized display type in UI chrome.
- Anything that makes a 200-row table feel like a landing page.

## Design Principles

- **The tool disappears into the task.** Earned familiarity over novelty; standard affordances.
- **Density serves scanning.** Tight rhythm, aligned columns, tabular numerals; whitespace where it groups, not everywhere.
- **Color carries meaning, not decoration.** The status / priority / type / tag palette signals state; neutral chrome stays out of the way.
- **One quiet light vocabulary.** Cream canvas, near-black structure, and coral interaction accents are expressed through semantic CSS variables.
- **Color is never the only signal.** Status and priority always pair a hue with a readable text label.

## Accessibility & Inclusion

WCAG 2.1 AA: body text and control labels meet >=4.5:1; chips pair color
with text so meaning never rides on hue alone. Inline editors are native `<select>`s
(keyboard- and screen-reader-operable, labelled). Loading state is announced via a live
region. All motion has a `prefers-reduced-motion` fallback.
