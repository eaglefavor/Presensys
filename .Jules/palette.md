## $(date +%Y-%m-%d) - ARIA labels on Bootstrap close buttons
**Learning:** Bootstrap's `btn-close` class uses a background SVG for the "X" icon, which is inherently inaccessible to screen readers without an explicit `aria-label`. Found this pattern in modal components (`Semesters.tsx`, `Courses.tsx`).
**Action:** Always verify that `.btn-close` buttons have an `aria-label="Close"` attribute when adding or modifying modals.
