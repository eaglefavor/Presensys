# Comprehensive Stability and Quality Plan for Presensys

This document outlines a detailed and comprehensive plan to improve the stability, performance, and overall quality of the Presensys project. The focus is on robust testing, accurate audits, enforcing production standards, and anticipating "what-if" scenarios across devices and network conditions.

## 1. Static Analysis & Code Quality Audit

*   **Enforce Stricter Linting and Typing:**
    *   Audit current `eslint.config.js` to ensure rigorous checks.
    *   Enforce `@typescript-eslint/no-explicit-any` to prevent unsafe type casting (use `unknown` or precise interfaces).
    *   Enforce `verbatimModuleSyntax` for explicit type imports.
    *   Ensure strict React Hooks linting, especially avoiding synchronous `setState` in `useEffect` to prevent cascading renders.
*   **Accessibility (a11y) Review:**
    *   Ensure all UI modifications maintain strict accessibility standards.
    *   Verify all icon-only buttons (e.g., using Lucide-React) have descriptive `aria-label` attributes.
    *   Rely on existing Bootstrap 5 CSS utility classes instead of custom CSS.
    *   Preserve native HTML5 form validation when using custom UI components (using visually hidden inputs if necessary).
*   **Security & Environment Review:**
    *   Ensure sensitive user information (emails, IDs, profile details) is stripped from production logs using `if (import.meta.env.DEV)` blocks.
    *   Audit API keys (especially Google/Gemini keys for the Snap-to-Mark feature) to ensure they are not committed in plaintext, using in-code fallbacks and dynamic decoding.
    *   Verify WebAuthn (Passkeys) implementations execute logic entirely on the client-side to preserve offline capabilities.

## 2. Comprehensive Testing Implementation

*   **Unit Testing Expansion (Node.js native runner):**
    *   Increase coverage for critical domain logic (`src/lib`), Zustand stores (`src/store`), and utility functions.
    *   Test "what-if" scenarios: invalid data formats, missing fields, extreme dates, and malformed registration numbers.
    *   Mock globals (e.g., `navigator`, `window`) correctly using JSDOM for stores evaluating DOM globals upon instantiation.
*   **Integration Testing for Sync Engine:**
    *   Strengthen tests around `RealtimeSyncEngine.test.ts` and Dexie.js integration.
    *   Ensure offline-first capabilities function without data loss. Test conflict resolution, deduplication (LWW pull), and retry mechanisms when transitioning between offline and online states.
    *   Validate soft-delete synchronization patterns (`{ isDeleted: 1, synced: 0 }`).
*   **End-to-End (E2E) Testing (Playwright):**
    *   Introduce Playwright for critical user journeys.
    *   Test the "Snap-to-Mark" feature using fake video streams (`--use-fake-ui-for-media-stream`, `--use-fake-device-for-media-stream`).
    *   Test biometric WebAuthn flows.
    *   Test data export functionality (CSV/PDF) and offline operations.
    *   Use mocked `localStorage` (`'auth-store'`) sessions to bypass login and test authenticated routes reliably.

## 3. Performance Optimization & Stability Improvements

*   **Database Query Optimization:**
    *   Audit Dexie and Supabase data fetching patterns.
    *   Replace nested `.filter()` iterations with single-pass `Map` aggregations (O(n) complexity) for in-memory processing.
    *   Avoid N+1 query patterns by utilizing batched fetch methods like `anyOf` in Dexie or `.in()` in Supabase.
*   **Bulk Operations Resiliency:**
    *   Ensure efficient bulk updates in Dexie using `Collection.modify()`.
    *   Avoid `ConstraintError` during Dexie `bulkAdd` by explicitly assigning `crypto.randomUUID()` to new records instead of relying on default creation hooks.
*   **React Rendering Performance:**
    *   Eliminate unnecessary cascading renders by deriving values natively during component renders instead of syncing derived state via `useEffect`.

## 4. Error Handling & "What-If" Resiliency

*   **Global Error Boundaries:**
    *   Implement React Error Boundaries to catch unhandled component exceptions gracefully without crashing the entire app.
*   **Network Resiliency:**
    *   Audit network state transitions to ensure robust handling of poor connectivity (e.g., "slow 2G") and interrupted sync operations.
*   **Storage Quota Management:**
    *   Address potential IndexedDB storage limit scenarios. Implement data purging policies (e.g., archiving old semesters) and gracefully handle `QuotaExceededError`.
*   **Domain Rules Enforcement:**
    *   Ensure domain rules requiring cross-row consistency (e.g., single active semester per user) are implemented using Supabase PostgreSQL triggers alongside Dexie local constraints.

## 5. CI/CD & Production Readiness

*   **Automate Quality Gates:**
    *   Integrate comprehensive tests (`pnpm test`), type checks (`pnpm run build`), and linting (`pnpm lint`) into a continuous integration pipeline.
*   **Performance Benchmarking:**
    *   Continuously document and track optimization outcomes in `.jules/bolt.md` to prevent regressions. Include 'What', 'Why', 'Impact', and 'Measurement'.

This plan ensures that all issues are circumvented proactively, maintaining the highest quality and production standards for the application across all devices.
