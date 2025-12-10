import { NextResponse } from 'next/server';
import pool from '@/lib/db';

export async function GET() {
  try {
    const result = await pool.query(
      'SELECT page_path, is_wip FROM wip_toggles WHERE is_wip = true'
    );

    const wipPages: Record<string, boolean> = {};
    result.rows.forEach((row) => {
      wipPages[row.page_path] = row.is_wip;
    });

    return NextResponse.json(wipPages);
  } catch (error) {
    console.error('Error fetching WIP status:', error);
    return NextResponse.json({}, { status: 200 });
  }
}
