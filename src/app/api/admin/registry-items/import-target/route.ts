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

// POST — accepts either:
//   { items: TargetItem[] }  — JSON from the bookmarklet
//   { csv: string }          — CSV text from bookmarklet fallback
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const config = getConfig();
    const existing: RegistryItem[] = config.registryItems || [];
    const added: RegistryItem[] = [];
    const skipped: string[] = [];

    // ── JSON path (bookmarklet sends structured data) ──────────────────────
    if (Array.isArray(body.items)) {
      for (const item of body.items) {
        const title: string = (item.title || item.name || '').trim();
        if (!title) continue;

        if (existing.some(e => e.title.toLowerCase() === title.toLowerCase()) ||
            added.some(e => e.title.toLowerCase() === title.toLowerCase())) {
          skipped.push(title);
          continue;
        }

        added.push({
          id: genId(),
          store: 'target',
          title,
          description: item.description || '',
          image: item.image || '',
          price: String(item.price || '').replace(/^\$/, ''),
          url: item.url || '',
        });
      }
    }

    // ── CSV path (fallback) ────────────────────────────────────────────────
    else if (typeof body.csv === 'string') {
      const lines = body.csv.split(/\r?\n/).filter((l: string) => l.trim());
      if (lines.length < 2) {
        return NextResponse.json({ error: 'CSV has no data rows' }, { status: 400 });
      }

      const rawHeaders = parseCsvLine(lines[0].replace(/^﻿/, ''));
      const headers = rawHeaders.map((h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, ''));

      const idx = (candidates: string[]) => {
        for (const c of candidates) {
          const i = headers.findIndex((h: string) => h.includes(c));
          if (i !== -1) return i;
        }
        return -1;
      };

      const colTitle = idx(['title', 'itemname', 'name', 'productname', 'item']);
      const colPrice = idx(['price', 'amount', 'cost']);
      const colUrl   = idx(['url', 'link', 'producturl']);
      const colImage = idx(['image', 'imageurl', 'img', 'picture', 'photo', 'thumbnail']);
      const colDesc  = idx(['description', 'desc', 'notes']);

      if (colTitle === -1) {
        return NextResponse.json({ error: 'Could not find a title/name column in CSV.' }, { status: 400 });
      }

      for (const line of lines.slice(1)) {
        if (!line.trim()) continue;
        const cols = parseCsvLine(line);
        const title = (cols[colTitle] ?? '').trim();
        if (!title) continue;

        if (existing.some(e => e.title.toLowerCase() === title.toLowerCase()) ||
            added.some(e => e.title.toLowerCase() === title.toLowerCase())) {
          skipped.push(title);
          continue;
        }

        added.push({
          id: genId(),
          store: 'target',
          title,
          description: colDesc !== -1 ? (cols[colDesc] ?? '') : '',
          image: colImage !== -1 ? (cols[colImage] ?? '') : '',
          price: colPrice !== -1 ? (cols[colPrice] ?? '').replace(/^\$/, '') : '',
          url: colUrl !== -1 ? (cols[colUrl] ?? '') : '',
        });
      }
    } else {
      return NextResponse.json({ error: 'Send { items: [] } or { csv: "..." }' }, { status: 400 });
    }

    const updated = [...existing, ...added];
    saveConfig({ ...config, registryItems: updated });

    return NextResponse.json({ success: true, added: added.length, skipped: skipped.length });
  } catch (err) {
    console.error('Target import error:', err);
    return NextResponse.json({ error: 'Failed to import' }, { status: 500 });
  }
}
