import fs from 'fs';
import https from 'https';

const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || 'trhvihhaidboeodffgcj';
const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN;

if (!ACCESS_TOKEN) {
  console.error('Error: SUPABASE_ACCESS_TOKEN environment variable is required.');
  process.exit(1);
}

const sqlFilePath = process.argv[2];

if (!sqlFilePath) {
  console.error('Usage: node deploy_sql.js <path_to_sql_file>');
  process.exit(1);
}

try {
  const query = fs.readFileSync(sqlFilePath, 'utf8');
  const payload = JSON.stringify({ query });

  const options = {
    hostname: 'api.supabase.com',
    port: 443,
    path: `/v1/projects/${PROJECT_REF}/database/query`,
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload)
    }
  };

  const req = https.request(options, (res) => {
    let data = '';

    res.on('data', (chunk) => {
      data += chunk;
    });

    res.on('end', () => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        console.log('Success:', data || 'Query executed successfully.');
      } else {
        console.error(`Error (${res.statusCode}):`, data);
        process.exit(1);
      }
    });
  });

  req.on('error', (e) => {
    console.error('Request Error:', e);
    process.exit(1);
  });

  req.write(payload);
  req.end();

} catch (err) {
  console.error('File Error:', err.message);
  process.exit(1);
}
