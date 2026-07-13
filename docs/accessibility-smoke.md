# Manual keyboard and screen-reader release smoke

Automated Axe and Playwright keyboard checks are necessary but do not replace assistive-technology
testing. Record tester, UTC time, release ID, OS/browser, screen reader/version, and failures in the
private release record.

## Keyboard-only

1. Sign in without a pointer. Confirm focus is visible and follows visual order.
2. Activate “Skip to main content”; confirm focus/reading position reaches the current view.
3. Visit all six views and Settings. Operate filters, sort, task creation, and workspace selection.
4. Open a task, traverse the drawer in both directions, edit every control, post a comment, and
   close with Escape. Confirm focus returns to the opener.
5. On Board, move a card up/down and to another status using only the disclosure controls. Confirm
   the live announcement communicates task, destination, and position.
6. Arm task/project/member destructive confirmations. Confirm focus lands on the safe action and
   pending controls cannot be submitted twice.

## Screen reader

Run VoiceOver + Safari on macOS and NVDA + Firefox or Chrome on Windows when available.

1. Navigate by landmarks and headings; confirm Workspace navigation, View controls, Task tools,
   main view, and drawer are announced distinctly.
2. In List, confirm table caption, headers, task key/title, status, priority, assignee, and points.
3. In Board/Gantt/Timeline/Activity/Workload, confirm status meaning is textual—not colour-only.
4. Confirm loading, error/retry, empty, mutation failure, Realtime reconnect, and Board move live
   messages are announced once and do not steal focus.
5. Open and close the drawer; confirm modal context, title, controls, focus containment, and restored
   opener. Read comments in chronological order and load older history.

Any critical or serious issue blocks release. Moderate issues require an owner and explicit launch
decision; do not check the Phase 1 gate merely because this document exists.
