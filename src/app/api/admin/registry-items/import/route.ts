import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { RegistryItem } from '../route';

const CONFIG_PATH = path.join(process.cwd(), 'public/config/site.json');

function getConfig() {
  if (!fs.existsSync(CONFIG_PATH)) return {};
  try { return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')); }
  catch { return {}; }
}

function saveConfig(config: Record<string, unknown>) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

function genId() {
  return Math.random().toString(36).slice(2, 10);
}

// Parse a simple CSV line respecting quoted fields
function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else { inQuotes = !inQuotes; }
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

// Extract ASIN from an Amazon URL or ASIN-looking string
function extractAsin(url: string): string | null {
  const m = url.match(/\/dp\/([A-Z0-9]{10})|\/gp\/product\/([A-Z0-9]{10})|^([A-Z0-9]{10})$/);
  if (!m) return null;
  return m[1] || m[2] || m[3] || null;
}

function asinImageUrl(asin: string): string {
  return `https://images.amazon.com/images/P/${asin}.01.LZZZZZZZ.jpg`;
}

// POST — accepts a raw CSV string in the request body
// Parses Amazon registry export format and bulk-inserts items
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const csv: string = body.csv ?? '';

    const lines = csv.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) {
      return NextResponse.json({ error: 'CSV is empty or has no data rows' }, { status: 400 });
    }

    // Parse header row — normalize to lowercase, strip BOM
    const rawHeaders = parseCsvLine(lines[0].replace(/^﻿/, ''));
    const headers = rawHeaders.map(h => h.toLowerCase().replace(/[^a-z0-9]/g, ''));

    // Map known column names to indices (Amazon export columns vary slightly)
    const idx = (candidates: string[]) => {
      for (const c of candidates) {
        const i = headers.findIndex(h => h.includes(c));
        if (i !== -1) return i;
      }
      return -1;
    };

    const colTitle   = idx(['itemname', 'title', 'name', 'productname']);
    const colPrice   = idx(['price', 'amount', 'cost']);
    const colUrl     = idx(['producturl', 'url', 'link', 'itemurl']);
    const colAsin    = idx(['asin']);
    const colImage   = idx(['imageurl', 'image', 'picture', 'photo']);
    const colQty     = idx(['quantitydesired', 'qty', 'quantity']);

    if (colTitle === -1) {
      return NextResponse.json(
        { error: 'Could not find a title/name column in CSV. Make sure you exported from Amazon.' },
        { status: 400 }
      );
    }

    const config = getConfig();
    const existing: RegistryItem[] = config.registryItems || [];
    const added: RegistryItem[] = [];
    const skipped: string[] = [];

    for (const line of lines.slice(1)) {
      if (!line.trim()) continue;
      const cols = parseCsvLine(line);

      const title = colTitle !== -1 ? cols[colTitle] ?? '' : '';
      if (!title) { skipped.push('(blank title)'); continue; }

      // Skip duplicates already in the config
      if (existing.some(e => e.title.toLowerCase() === title.toLowerCase())) {
        skipped.push(title);
        continue;
      }

      const rawUrl   = colUrl   !== -1 ? cols[colUrl]   ?? '' : '';
      const rawPrice = colPrice !== -1 ? cols[colPrice]  ?? '' : '';
      const rawAsin  = colAsin  !== -1 ? cols[colAsin]   ?? '' : '';
      const rawImage = colImage !== -1 ? cols[colImage]  ?? '' : '';

      // Build product URL — prefer direct URL, fall back to ASIN link
      const asin = rawAsin || extractAsin(rawUrl) || null;
      const url = rawUrl || (asin ? `https://www.amazon.com/dp/${asin}` : '');

      // Build image — prefer explicit image column, fall back to ASIN image CDN
      const image = rawImage || (asin ? asinImageUrl(asin) : '');

      // Normalise price string (strip $ and whitespace)
      const price = rawPrice.replace(/^\$/, '').trim();

      const item: RegistryItem = {
        id: genId(),
        store: 'amazon',
        title,
        description: colQty !== -1 && cols[colQty] ? `Qty wanted: ${cols[colQty]}` : '',
        image,
        price,
        url,
      };

      added.push(item);
    }

    const updated = [...existing, ...added];
    saveConfig({ ...config, registryItems: updated });

    return NextResponse.json({ success: true, added: added.length, skipped: skipped.length, skippedTitles: skipped });
  } catch (err) {
    console.error('CSV import error:', err);
    return NextResponse.json({ error: 'Failed to import CSV' }, { status: 500 });
  }
}
