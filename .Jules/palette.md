## $(date +%Y-%m-%d) - ARIA labels on Bootstrap close buttons
**Learning:** Bootstrap's `btn-close` class uses a background SVG for the "X" icon, which is inherently inaccessible to screen readers without an explicit `aria-label`. Found this pattern in modal components (`Semesters.tsx`, `Courses.tsx`).
**Action:** Always verify that `.btn-close` buttons have an `aria-label="Close"` attribute when adding or modifying modals.
## 2024-05-18 - Icon-Only Button Accessibility in Layout
**Learning:** Found multiple icon-only navigation buttons in the primary layout component (`src/components/Layout.tsx`) lacking `aria-label`s, which is a common pattern that hurts screen reader accessibility.
**Action:** Always verify `aria-label` presence when using icon-only buttons from libraries like `lucide-react` across all standard layout and navigation components.
## 2024-05-07 - Improved PDF Legibility on Mobile
**Learning:** Hardcoding \`jsPDF\` orientation to landscape with small font sizes can cause visual strain on smaller screens when the data width isn't large enough to warrant it.
**Action:** Dynamically calculate the \`jsPDF\` orientation based on header length and increase font size, line spacing, and use softer alternate row colors to ensure a more readable layout across varying screen sizes.
