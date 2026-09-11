// One-time bulk loader for historical period-start dates.
//
// Reads backend/scripts/dates.local.json (gitignored — real dates never
// get committed) and POSTs each one to the deployed API. Existing dates
// are skipped so this is safe to re-run.
//
// Usage:
//   node backend/scripts/seed-dates.mjs
//
// API_BASE_URL and PASSCODE are read from terraform output / terraform.tfvars
// by default; override with env vars if needed:
//   API_BASE_URL=https://... PASSCODE=... node backend/scripts/seed-dates.mjs

import { readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const terraformDir = join(__dirname, '..', 'terraform');
const datesFile = join(__dirname, 'dates.local.json');

function getApiBaseUrl() {
  if (process.env.API_BASE_URL) return process.env.API_BASE_URL;
  try {
    return execSync('terraform output -raw api_base_url', {
      cwd: terraformDir,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
  } catch {
    throw new Error(
      'Could not read api_base_url from terraform output. Run `terraform apply` first, or set API_BASE_URL yourself.'
    );
  }
}

function getPasscode() {
  if (process.env.PASSCODE) return process.env.PASSCODE;
  const tfvarsPath = join(terraformDir, 'terraform.tfvars');
  if (!existsSync(tfvarsPath)) {
    throw new Error('terraform.tfvars not found and PASSCODE env var not set.');
  }
  const content = readFileSync(tfvarsPath, 'utf-8');
  // Value may be quoted ("abc123") or a bare number (962026) — HCL allows both for a string variable.
  const match = content.match(/^\s*passcode\s*=\s*(.+)$/m);
  if (!match) {
    throw new Error('Could not find `passcode = ...` in terraform.tfvars.');
  }
  return match[1].trim().replace(/^"|"$/g, '');
}

function loadDates() {
  if (!existsSync(datesFile)) {
    throw new Error(
      `${datesFile} not found. Copy dates.local.example.json to dates.local.json and fill in the real dates (it's gitignored).`
    );
  }
  const dates = JSON.parse(readFileSync(datesFile, 'utf-8'));
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  for (const date of dates) {
    if (!DATE_RE.test(date)) {
      throw new Error(`Invalid date "${date}" — expected YYYY-MM-DD.`);
    }
  }
  return [...new Set(dates)].sort();
}

async function main() {
  const apiBaseUrl = getApiBaseUrl();
  const passcode = getPasscode();
  const dates = loadDates();

  console.log(`Seeding ${dates.length} date(s) to ${apiBaseUrl} ...`);

  const existingRes = await fetch(`${apiBaseUrl}/logs`, {
    headers: { 'x-passcode': passcode },
  });
  if (!existingRes.ok) {
    throw new Error(`Failed to fetch existing dates: ${existingRes.status}`);
  }
  const { dates: existing } = await existingRes.json();
  const existingSet = new Set(existing || []);

  let added = 0;
  let skipped = 0;
  for (const date of dates) {
    if (existingSet.has(date)) {
      skipped++;
      continue;
    }
    const res = await fetch(`${apiBaseUrl}/logs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-passcode': passcode },
      body: JSON.stringify({ date }),
    });
    if (!res.ok) {
      throw new Error(`Failed to add ${date}: ${res.status} ${await res.text()}`);
    }
    added++;
    console.log(`  added ${date}`);
  }

  console.log(`Done. Added ${added}, skipped ${skipped} already-present.`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
