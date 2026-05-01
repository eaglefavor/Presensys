## 2024-06-25 - [Optimize nested array filters to Map in useLiveQuery]
**Learning:** Using nested `.filter()` inside a `.map()` on an array of Dexie records creates an O(N*M) time complexity bottleneck which hurts frontend performance during `useLiveQuery` renders.
**Action:** Always process flat arrays into `Map` lookups with a single O(N) pass to aggregate stats before doing the mapping, achieving O(N+M) time complexity.
## 2024-06-25 - [Optimize nested array filters to Map in loops]
**Learning:** Using nested `.filter()` inside loops on large arrays of Dexie records creates an O(N*M) time complexity bottleneck which hurts frontend performance during aggregation and rendering.
**Action:** Always pre-calculate statistics into a `Map` lookup with a single O(N) pass to aggregate stats before iterating the target entities, achieving O(N+M) time complexity.

## $(date +%Y-%m-%d) - Refactoring complex React components cleanly
**Learning:** String replacements inside extremely large JSX trees with complex `{...}` conditional logic often lead to syntax errors (`TS1128: Declaration or statement expected`) or dangling closures (`}`), due to missing or overlapping regex capture boundaries.
**Action:** When extracting React child components from a 1000+ line monolith file, preserve the `// comments` dividing sections in the parent file, and use `.find()` indexing between these specific comment block strings rather than relying strictly on regex dot-all patterns. This prevents accidentally pruning structural `</Wrapper>` end-tags.
