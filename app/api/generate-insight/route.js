import { NextResponse } from 'next/server';
import { generateInsight } from '@/lib/openaiGenerate';

export async function POST(request) {
  try {
    const { brandName, analytics } = await request.json();
    if (!brandName?.trim()) {
      return NextResponse.json({ success: false, error: 'Brand name is required' }, { status: 400 });
    }
    if (!analytics?.followers) {
      return NextResponse.json(
        { success: false, error: 'Fill in the Instagram numbers first — the insight is written from them.' },
        { status: 400 }
      );
    }
    const insight = await generateInsight({ brandName, analytics });
    return NextResponse.json({ success: true, insight });
  } catch (err) {
    console.error('Insight generation error:', err);
    return NextResponse.json({ success: false, error: err.message || 'Generation failed' }, { status: 500 });
  }
}
