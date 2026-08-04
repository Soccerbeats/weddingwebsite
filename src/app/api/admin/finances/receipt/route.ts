import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import pool from '@/lib/db';
import { ensureFinanceTables } from '@/lib/financeDb';

/**
 * Receipt photo for a purchase.
 *
 * Stored under the existing photos volume so it persists across deploys, and
 * served by the existing `/api/photos/[...filepath]` route — Next's standalone
 * output doesn't serve runtime-written files statically.
 */
const RECEIPTS_DIR = path.join(process.cwd(), 'public/photos/receipts');
const ALLOWED = new Set(['jpg', 'jpeg', 'png', 'webp', 'avif', 'heic', 'pdf']);
const MAX_BYTES = 12 * 1024 * 1024;

function extensionOf(name: string) {
    const ext = (name.split('.').pop() ?? '').toLowerCase();
    return ALLOWED.has(ext) ? ext : null;
}

/** Remove a stored receipt, ignoring anything outside the receipts directory. */
function deleteStored(receiptPath: string | null | undefined) {
    if (!receiptPath) return;
    const filename = path.basename(receiptPath);
    const full = path.join(RECEIPTS_DIR, filename);
    if (!full.startsWith(RECEIPTS_DIR)) return;
    if (fs.existsSync(full)) fs.unlinkSync(full);
}

export async function POST(request: Request) {
    try {
        await ensureFinanceTables();
        const form = await request.formData();
        const id = Math.trunc(Number(form.get('id')));
        const file = form.get('file') as File | null;

        if (!Number.isFinite(id) || id <= 0) {
            return NextResponse.json({ error: 'Valid purchase id required' }, { status: 400 });
        }
        if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });
        if (file.size > MAX_BYTES) {
            return NextResponse.json({ error: 'File is larger than 12MB' }, { status: 400 });
        }
        const ext = extensionOf(file.name);
        if (!ext) {
            return NextResponse.json(
                { error: 'Use a JPG, PNG, WebP, AVIF, HEIC or PDF' }, { status: 400 },
            );
        }

        const existing = await pool.query(
            'SELECT receipt_path FROM finance_purchases WHERE id = $1', [id],
        );
        if (!existing.rowCount) return NextResponse.json({ error: 'Not found' }, { status: 404 });

        fs.mkdirSync(RECEIPTS_DIR, { recursive: true });
        // Include the id so a receipt is traceable back to its purchase, and a
        // timestamp so replacing one busts any cached copy.
        const filename = `purchase-${id}-${Date.now()}.${ext}`;
        fs.writeFileSync(
            path.join(RECEIPTS_DIR, filename),
            Buffer.from(await file.arrayBuffer()),
        );

        deleteStored(existing.rows[0].receipt_path);
        const stored = `receipts/${filename}`;
        await pool.query('UPDATE finance_purchases SET receipt_path = $1 WHERE id = $2', [stored, id]);
        return NextResponse.json({ success: true, receipt_path: stored });
    } catch (error) {
        console.error('Error saving receipt:', error);
        return NextResponse.json({ error: 'Failed to save receipt' }, { status: 500 });
    }
}

export async function DELETE(request: Request) {
    try {
        await ensureFinanceTables();
        const id = Math.trunc(Number(new URL(request.url).searchParams.get('id')));
        if (!Number.isFinite(id) || id <= 0) {
            return NextResponse.json({ error: 'Valid purchase id required' }, { status: 400 });
        }
        const existing = await pool.query(
            'SELECT receipt_path FROM finance_purchases WHERE id = $1', [id],
        );
        if (!existing.rowCount) return NextResponse.json({ error: 'Not found' }, { status: 404 });

        deleteStored(existing.rows[0].receipt_path);
        await pool.query('UPDATE finance_purchases SET receipt_path = NULL WHERE id = $1', [id]);
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error removing receipt:', error);
        return NextResponse.json({ error: 'Failed to remove receipt' }, { status: 500 });
    }
}
