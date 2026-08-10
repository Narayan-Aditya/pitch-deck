import { NextResponse } from 'next/server';
import { generateAudienceFit } from '@/lib/openaiGenerate';

// See generate-overview: 10s is the serverless default and a model call
// exceeds it. 60s is the Hobby-plan maximum.
export const maxDuration = 60;

export async function POST(request) {
  try {
    const { brandName, about, analytics } = await request.json();
    if (!brandName?.trim()) {
      return NextResponse.json({ success: false, error: 'Brand name is required' }, { status: 400 });
    }
    const audienceFit = await generateAudienceFit({ brandName, about, analytics });
    return NextResponse.json({ success: true, audienceFit });
  } catch (err) {
    console.error('Audience fit generation error:', err);
    return NextResponse.json({ success: false, error: err.message || 'Generation failed' }, { status: 500 });
  }
}
