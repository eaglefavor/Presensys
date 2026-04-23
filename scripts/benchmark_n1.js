
const LATENCY_MS = 10; // 10ms per query simulate DB overhead

async function mockQuery(id) {
  return new Promise(resolve => {
    setTimeout(() => {
      resolve({ id, name: `Student ${id}` });
    }, LATENCY_MS);
  });
}

async function mockBatchQuery(ids) {
  return new Promise(resolve => {
    setTimeout(() => {
      resolve(ids.map(id => ({ id, name: `Student ${id}` })));
    }, LATENCY_MS);
  });
}

async function runNPlusOneBenchmark(count) {
  console.log(`Running N+1 Benchmark with ${count} items...`);
  const start = Date.now();
  const results = [];
  for (let i = 0; i < count; i++) {
    const result = await mockQuery(i);
    results.push(result);
  }
  const end = Date.now();
  const duration = end - start;
  console.log(`N+1 Benchmark took ${duration}ms`);
  return duration;
}

async function runBatchBenchmark(count) {
  console.log(`Running Batch Benchmark with ${count} items...`);
  const start = Date.now();
  const ids = Array.from({ length: count }, (_, i) => i);
  const results = await mockBatchQuery(ids);
  const end = Date.now();
  const duration = end - start;
  console.log(`Batch Benchmark took ${duration}ms`);
  return duration;
}

async function main() {
  const count = 50; // common size for a class
  const n1Time = await runNPlusOneBenchmark(count);
  const batchTime = await runBatchBenchmark(count);

  console.log('\nResults Summary:');
  console.log(`Items: ${count}`);
  console.log(`N+1 Duration: ${n1Time}ms`);
  console.log(`Batch Duration: ${batchTime}ms`);
  console.log(`Improvement: ${((n1Time - batchTime) / n1Time * 100).toFixed(2)}%`);
}

main();
