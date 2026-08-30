import { NextResponse } from 'next/server';
import { fetchProspects } from '@/lib/prospects';
import { archiveItems } from '@/lib/feedArchive';

// Three outlets fetched in parallel, each cached for half an hour by the fetch
// in lib/prospects.js — so this is usually a parse of already-warm text, not
// three round trips. 30s is headroom for the cold case where all three are slow.
export const maxDuration = 30;

export async function GET(request) {
  const limit = Number(new URL(request.url).searchParams.get('limit')) || 24;

  try {
    const { brands, parsed, counts, failed } = await fetchProspects({ limit });

    // This poll is also what fills the archive the History page reads. Awaited
    // rather than fired and forgotten: on a serverless host the function can be
    // frozen the moment the response is sent, and a dangling insert would be
    // dropped. It is one upsert, and it cannot fail the request — archiveItems
    // swallows its own errors.
    await archiveItems(parsed);

    return NextResponse.json({ success: true, brands, counts, failed });
  } catch (err) {
    // fetchProspects swallows individual feed failures, so reaching here means
    // something worse — a parse blowing up rather than an outlet being down.
    console.error('Prospect feed error:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Could not read the feeds' },
      { status: 500 }
    );
  }
}
