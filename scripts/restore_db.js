/**
 * restore_db.js
 *
 * Restores (or re-creates) the Presensys Supabase schema by executing the
 * three SQL migration files in the correct order:
 *
 *   1. supabase/schema_realtime.sql  — core tables, RLS, realtime
 *   2. supabase/security_hardening.sql — hardened per-operation RLS policies
 *   3. supabase/polishing_migrations.sql — indexes, triggers, helper functions
 *
 * Usage:
 *   SUPABASE_ACCESS_TOKEN=<token> node scripts/restore_db.js
 *
 * Optional env vars:
 *   SUPABASE_PROJECT_REF  — defaults to the project ref hard-coded below
 */

import fs from 'fs';
import https from 'https';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || 'trhvihhaidboeodffgcj';
const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN;

if (!ACCESS_TOKEN) {
  console.error('Error: SUPABASE_ACCESS_TOKEN environment variable is required.');
  process.exit(1);
}

const SQL_FILES = [
  path.resolve(__dirname, '../supabase/schema_realtime.sql'),
  path.resolve(__dirname, '../supabase/security_hardening.sql'),
  path.resolve(__dirname, '../supabase/polishing_migrations.sql'),
];

function runQuery(filePath) {
  return new Promise((resolve, reject) => {
    let query;
    try {
      query = fs.readFileSync(filePath, 'utf8');
    } catch (err) {
      return reject(new Error(`Cannot read ${filePath}: ${err.message}`));
    }

    const payload = JSON.stringify({ query });

    const options = {
      hostname: 'api.supabase.com',
      port: 443,
      path: `/v1/projects/${PROJECT_REF}/database/query`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve('Done');
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', (e) => reject(new Error(`Request error: ${e.message}`)));
    req.write(payload);
    req.end();
  });
}

async function main() {
  console.log(`Restoring Presensys schema on project: ${PROJECT_REF}\n`);

  for (const filePath of SQL_FILES) {
    const label = path.relative(path.resolve(__dirname, '..'), filePath);
    process.stdout.write(`  Running ${label} ... `);
    try {
      const result = await runQuery(filePath);
      console.log(`✓  ${result}`);
    } catch (err) {
      console.error(`✗\n\nFailed on ${label}:\n${err.message}`);
      process.exit(1);
    }
  }

  console.log('\nAll migrations applied successfully.');
}

main();
