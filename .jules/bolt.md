## 2024-06-25 - [Optimize nested array filters to Map in useLiveQuery]
**Learning:** Using nested `.filter()` inside a `.map()` on an array of Dexie records creates an O(N*M) time complexity bottleneck which hurts frontend performance during `useLiveQuery` renders.
**Action:** Always process flat arrays into `Map` lookups with a single O(N) pass to aggregate stats before doing the mapping, achieving O(N+M) time complexity.
## 2024-06-25 - [Optimize nested array filters to Map in loops]
**Learning:** Using nested `.filter()` inside loops on large arrays of Dexie records creates an O(N*M) time complexity bottleneck which hurts frontend performance during aggregation and rendering.
**Action:** Always pre-calculate statistics into a `Map` lookup with a single O(N) pass to aggregate stats before iterating the target entities, achieving O(N+M) time complexity.
