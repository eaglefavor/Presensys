1. **Disable "Snap-to-Mark" Functionality:**
   - In `src/pages/attendance/AIOptionScreen.tsx`, modify the "Snap to Mark" button to be disabled and show an "Under Construction" or "Coming Soon" badge. The user request states it "is still in the works".

2. **Improve Error Boundaries and Fallbacks:**
   - Enhance the main React rendering to handle uncaught errors gracefully.

3. **Improve Network Resiliency and Edge Cases:**
   - Ensure IndexedDB queries wrap any potential asynchronous failures and fallback gracefully.
   - Refactor `RealtimeSyncEngine.ts` to improve conflict resolution or robustness.

4. **Testing for Accurate Audits:**
   - Increase unit test coverage. The current codebase has 7 tests across 4 files. We will write comprehensive tests for `useAppStore`, `useAuthStore`, and critical utility components.
   - Create test suites for missing edge-cases (e.g., failed API calls, missing DB entries, incorrect parameters).

5. **Stability Capacity and "What-if" Circumvention:**
   - Implement structured error handling across the app. Add proper error toasts using `react-hot-toast` in generic `catch` blocks.
   - Address any strict ESLint issues (like the ones shown during `npm run test` with unresolved imports) by ensuring the package configuration and paths are correct.

6. **Pre-commit checks:**
   - Complete pre-commit steps to make sure proper testing, verifications, reviews and reflections are done.
