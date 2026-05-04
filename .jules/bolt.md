## 2024-06-25 - [Optimize nested array filters to Map in useLiveQuery]
**Learning:** Using nested `.filter()` inside a `.map()` on an array of Dexie records creates an O(N*M) time complexity bottleneck which hurts frontend performance during `useLiveQuery` renders.
**Action:** Always process flat arrays into `Map` lookups with a single O(N) pass to aggregate stats before doing the mapping, achieving O(N+M) time complexity.
