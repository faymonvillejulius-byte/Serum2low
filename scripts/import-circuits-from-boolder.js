#!/usr/bin/env node

/**
 * import-circuits-from-boolder.js
 * 
 * Fetches circuits from Boolder.db API and imports them to Cloudflare KV
 * 
 * Usage:
 *   node scripts/import-circuits-from-boolder.js [--sector=Apremont] [--dry-run]
 * 
 * Env vars:
 *   BOOLDER_API_URL (default: https://boolder.com/api)
 *   CF_ACCOUNT_ID
 *   CF_API_TOKEN
 *   CF_KV_NAMESPACE_ID (default from wrangler.toml)
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// Config
const BOOLDER_API = process.env.BOOLDER_API_URL || 'https://boolder.com/api';
const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID;
const CF_API_TOKEN = process.env.CF_API_TOKEN;
const CF_KV_NAMESPACE_ID = process.env.CF_KV_NAMESPACE_ID || '7c01d973651c40f2b0696078a610ba8a'; // From wrangler.jsonc

// Parse CLI args
const args = process.argv.slice(2);
const sectorFilter = args.find(a => a.startsWith('--sector='))?.split('=')[1] || null;
const dryRun = args.includes('--dry-run');

console.log(`🧗 Boolder Circuit Importer`);
console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
console.log(`API:        ${BOOLDER_API}`);
console.log(`KV Namespace: ${CF_KV_NAMESPACE_ID}`);
console.log(`Sector:     ${sectorFilter || 'ALL'}`);
console.log(`Dry Run:    ${dryRun ? 'YES' : 'NO'}`);
console.log();

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'HIGHSET/1.0' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`JSON parse failed: ${url}`));
        }
      });
    }).on('error', reject);
  });
}

async function postKv(key, value) {
  return new Promise((resolve, reject) => {
    const url = new URL(
      `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${CF_KV_NAMESPACE_ID}/values/${encodeURIComponent(key)}`
    );

    const body = typeof value === 'string' ? value : JSON.stringify(value);

    const req = https.request(url, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${CF_API_TOKEN}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(JSON.parse(data));
        } else {
          reject(new Error(`KV PUT failed: ${res.statusCode} ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ─────────────────────────────────────────────────────────────────────
// Main Import Logic
// ─────────────────────────────────────────────────────────────────────

async function importCircuits() {
  try {
    // 1. Fetch all areas from Boolder
    console.log('📡 Fetching areas from Boolder...');
    const areas = await fetchJson(`${BOOLDER_API}/areas`);
    console.log(`   ✓ Found ${areas.length} areas`);

    let totalCircuits = 0;
    let totalProblemsMapped = 0;

    // 2. For each area, fetch sectors and circuits
    for (const area of areas) {
      const areaSlug = area.slug || area.name.toLowerCase().replace(/\s+/g, '-');
      
      // Filter by sector if specified
      if (sectorFilter && areaSlug !== sectorFilter) {
        continue;
      }

      console.log(`\n🌄 Area: ${area.name}`);

      try {
        // Fetch sectors for this area
        const sectors = await fetchJson(`${BOOLDER_API}/areas/${area.id}/sectors`);
        console.log(`   → ${sectors.length} sectors`);

        for (const sector of sectors) {
          const sectorKey = sector.slug || sector.name.toLowerCase().replace(/\s+/g, '-');

          try {
            // Fetch problems (boulders) for this sector
            const problems = await fetchJson(`${BOOLDER_API}/sectors/${sector.id}/problems`);
            console.log(`   • Sector "${sector.name}": ${problems.length} problems`);

            // 3. Extract circuits from problems
            const circuits = new Map(); // circuitId -> circuit object

            for (const problem of problems) {
              // Each problem can have circuits
              if (problem.circuits && Array.isArray(problem.circuits)) {
                for (const circuit of problem.circuits) {
                  const circuitId = circuit.id;
                  
                  if (!circuits.has(circuitId)) {
                    circuits.set(circuitId, {
                      id: circuitId,
                      name: circuit.name,
                      color: circuit.color || 'black',
                      number: circuit.number || null,
                      features: [], // Will collect all polylines
                    });
                  }

                  // Add this problem's location to the circuit's features
                  if (problem.lat && problem.lng) {
                    circuits.get(circuitId).features.push({
                      type: 'Feature',
                      properties: {
                        problemId: problem.id,
                        problemName: problem.name,
                        grade: problem.grade,
                        color: circuit.color,
                        number: circuit.number,
                      },
                      geometry: {
                        type: 'Point',
                        coordinates: [problem.lng, problem.lat],
                      },
                    });
                  }

                  totalProblemsMapped++;
                }
              }
            }

            // 4. Save circuits to KV
            for (const [circuitId, circuit] of circuits) {
              const kvKey = `circuits_v4:${area.id}:${sector.id}:${circuitId}`;
              const kvValue = {
                circuitId,
                areaId: area.id,
                sectorId: sector.id,
                name: circuit.name,
                color: circuit.color,
                number: circuit.number,
                problemCount: circuit.features.length,
                type: 'FeatureCollection',
                features: circuit.features,
                importedAt: new Date().toISOString(),
              };

              if (dryRun) {
                console.log(`     [DRY] Would save: ${kvKey}`);
              } else {
                await postKv(kvKey, kvValue);
                console.log(`     ✓ Saved: ${kvKey} (${circuit.features.length} problems)`);
              }

              totalCircuits++;
            }
          } catch (sectorErr) {
            console.error(`   ✗ Error fetching sector: ${sectorErr.message}`);
          }
        }
      } catch (areaErr) {
        console.error(`   ✗ Error fetching area: ${areaErr.message}`);
      }
    }

    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`✅ Import complete!`);
    console.log(`   Circuits: ${totalCircuits}`);
    console.log(`   Problems mapped: ${totalProblemsMapped}`);
    console.log(`   Dry run: ${dryRun ? 'YES - no data was saved' : 'NO - data saved to KV'}`);

  } catch (error) {
    console.error(`❌ Fatal error: ${error.message}`);
    process.exit(1);
  }
}

// ─────────────────────────────────────────────────────────────────────
// Validate Environment
// ─────────────────────────────────────────────────────────────────────

if (!dryRun) {
  if (!CF_ACCOUNT_ID) {
    console.error('❌ Missing CF_ACCOUNT_ID environment variable');
    process.exit(1);
  }
  if (!CF_API_TOKEN) {
    console.error('❌ Missing CF_API_TOKEN environment variable');
    process.exit(1);
  }
}

// ─────────────────────────────────────────────────────────────────────
// Run
// ─────────────────────────────────────────────────────────────────────

importCircuits().catch(err => {
  console.error(`\n❌ Failed: ${err.message}`);
  process.exit(1);
});
