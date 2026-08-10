// Pure parsing helper, no network call — turns a handle or profile URL
// into a bare @handle for display.
export function extractHandle(input) {
  if (!input) return '';
  const s = input.trim();
  const urlMatch = s.match(/instagram\.com\/([^/?#]+)/i);
  if (urlMatch) return urlMatch[1];
  return s.replace(/^@/, '');
}
