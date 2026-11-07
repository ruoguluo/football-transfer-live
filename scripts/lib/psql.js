'use strict';

const { spawnSync } = require('node:child_process');

function parseDatabaseUrl(databaseUrl) {
  let parsed;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error('DATABASE_URL is not a valid URL.');
  }
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    throw new Error('DATABASE_URL must use postgres:// or postgresql://.');
  }
  const database = decodeURIComponent(parsed.pathname.replace(/^\/+/, '')) || 'postgres';
  return {
    host: parsed.hostname,
    port: parsed.port || '5432',
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database,
    sslmode: parsed.searchParams.get('sslmode') || 'require'
  };
}

function redact(value, secrets) {
  let output = String(value || '');
  for (const secret of secrets) {
    if (secret && secret.length > 3) output = output.split(secret).join('[REDACTED]');
  }
  return output;
}

function runPsql({ databaseUrl, sql, sqlFile, args = [] }) {
  const db = parseDatabaseUrl(databaseUrl);
  const env = {
    ...process.env,
    PGHOST: db.host,
    PGPORT: db.port,
    PGUSER: db.user,
    PGPASSWORD: db.password,
    PGDATABASE: db.database,
    PGSSLMODE: db.sslmode,
    PGCONNECT_TIMEOUT: '10'
  };
  const psqlArgs = ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1', ...args];
  if (sqlFile) psqlArgs.push('-f', sqlFile);
  else if (sql) psqlArgs.push('-c', sql);
  else throw new Error('runPsql requires sql or sqlFile.');

  const result = spawnSync(process.env.PSQL_PATH || 'psql', psqlArgs, {
    env,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024
  });
  const secrets = [db.password, process.env.SPORTMONKS_TOKEN];
  const stdout = redact(result.stdout, secrets);
  const stderr = redact(result.stderr, secrets);
  if (result.error) {
    throw new Error(`Unable to run psql: ${result.error.message}. Install PostgreSQL client or set PSQL_PATH.`);
  }
  if (result.status !== 0) {
    const detail = (stderr || stdout).trim().slice(0, 1000);
    throw new Error(`psql exited with status ${result.status}: ${detail}`);
  }
  if (stderr.trim()) process.stderr.write(`${stderr.trim()}\n`);
  return stdout.trim();
}

module.exports = { parseDatabaseUrl, redact, runPsql };
