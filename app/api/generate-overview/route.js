import { NextResponse } from 'next/server';
import { generateOverview } from '@/lib/openaiGenerate';

export async function POST(request) {
  try {
    const { brandName, instagram, profile } = await request.json();
    if (!brandName?.trim()) {
      return NextResponse.json({ success: false, error: 'Brand name is required' }, { status: 400 });
    }
    const about = await generateOverview({ brandName, instagram, profile });
    return NextResponse.json({ success: true, about });
  } catch (err) {
    console.error('Overview generation error:', err);
    return NextResponse.json({ success: false, error: err.message || 'Generation failed' }, { status: 500 });
  }
}
