import { NextResponse } from 'next/server';
import pool from '@/lib/db';

export async function GET() {
  try {
    const result = await pool.query(
      'SELECT * FROM wip_toggles ORDER BY page_path'
    );
    return NextResponse.json(result.rows);
  } catch (error) {
    console.error('Error fetching WIP toggles:', error);
    return NextResponse.json(
      { error: 'Failed to fetch WIP toggles' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const { page_path, page_label, is_wip } = await request.json();

    const result = await pool.query(
      `INSERT INTO wip_toggles (page_path, page_label, is_wip, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (page_path)
       DO UPDATE SET is_wip = $3, updated_at = NOW()
       RETURNING *`,
      [page_path, page_label, is_wip]
    );

    return NextResponse.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating WIP toggle:', error);
    return NextResponse.json(
      { error: 'Failed to update WIP toggle' },
      { status: 500 }
    );
  }
}
