import { test, describe } from 'node:test';
import assert from 'node:assert';

// The ESM loader (mock-loader.mjs) intercepts '@supabase/supabase-js'
const { supabase } = await import('./supabase.ts');

describe('supabase client', () => {
  test('should be initialized with the correct URL and Key', () => {
    // The actual values from src/lib/supabase.ts
    const expectedUrl = 'https://trhvihhaidboeodffgcj.supabase.co';
    const expectedKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRyaHZpaGhhaWRib2VvZGZmZ2NqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcyODExNzMsImV4cCI6MjA4Mjg1NzE3M30.2XnP9E5nkva5Cwz5sL2ipsfKqO6LR0WElNZqbSwPtII';

    assert.strictEqual((supabase as any).url, expectedUrl);
    assert.strictEqual((supabase as any).key, expectedKey);
  });
});
