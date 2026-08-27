import io

def patch(p, pairs):
    s = io.open(p, encoding='utf-8').read()
    for old, new in pairs:
        assert old in s, f"NOT FOUND in {p}: {old[:70]!r}"
        s = s.replace(old, new, 1)
    io.open(p, 'w', encoding='utf-8').write(s)
    print('patched', p)

# The last lint error, and it is a real one now that there is no report page:
# a raw <a> to "/" throws the whole document away on every logo click.
patch('app/layout.js', [
    ("import './globals.css';", "import Link from 'next/link';\nimport './globals.css';"),
    ("""            <a href="/" className="navbar-brand" style={{ textDecoration: 'none' }}>""",
     """            <Link href="/" className="navbar-brand" style={{ textDecoration: 'none' }}>"""),
])

s = io.open('app/layout.js', encoding='utf-8').read()
# close the tag that was opened as <a>
i = s.index('<Link href="/" className="navbar-brand"')
j = s.index('</a>', i)
s = s[:j] + '</Link>' + s[j + len('</a>'):]
io.open('app/layout.js', 'w', encoding='utf-8').write(s)
print('layout: navbar-brand is a Link')

# The month's paid lookups. The migration put the column on usage_summary and
# nothing selected it — which made the one number that costs money the one
# number nobody could see.
patch('lib/usage.js', [
    (".select('reports_created, decks_downloaded, slides_exported, last_activity')",
     ".select('reports_created, decks_downloaded, slides_exported, lookups_this_month, last_activity')"),
    (".select('user_id, email, full_name, avatar_url, is_admin, reports_created, decks_downloaded, slides_exported, last_activity')",
     ".select('user_id, email, full_name, avatar_url, is_admin, reports_created, decks_downloaded, slides_exported, lookups_this_month, last_activity')"),
])

patch('app/admin/page.js', [
    ("""      slides: acc.slides + (r.slides_exported || 0),""",
     """      slides: acc.slides + (r.slides_exported || 0),
      lookups: acc.lookups + (r.lookups_this_month || 0),"""),
    ("""{ people: 0, reports: 0, decks: 0, slides: 0 }""",
     """{ people: 0, reports: 0, decks: 0, slides: 0, lookups: 0 }"""),
    ("""            <div className="metric-value">{totals.slides}</div>
            <div className="metric-label">Sent to Google Slides</div>
          </div>""",
     """            <div className="metric-value">{totals.slides}</div>
            <div className="metric-label">Sent to Google Slides</div>
          </div>
          <div className="metric-card">
            <div className="metric-value">{totals.lookups}</div>
            <div className="metric-label">Paid lookups this month</div>
          </div>"""),
    (""">Last active</th>""",
     """>Lookups</th>
                  <th style={{ textAlign: 'right', padding: '14px 16px', fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>Last active</th>"""),
    ("""                    <td style={{ padding: '14px 16px', textAlign: 'right', color: 'var(--text-muted)', fontSize: '13px', whiteSpace: 'nowrap' }}>
                      {relativeTime(r.last_activity)}
                    </td>""",
     """                    {/* Against the monthly allowance, so a person who is out
                        of lookups reads as out rather than as merely busy. */}
                    <td style={{ padding: '14px 16px', textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap',
                      color: (r.lookups_this_month || 0) >= MONTHLY_LIMIT ? 'var(--error)' : undefined }}>
                      {r.lookups_this_month || 0}
                      <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}> / {MONTHLY_LIMIT}</span>
                    </td>
                    <td style={{ padding: '14px 16px', textAlign: 'right', color: 'var(--text-muted)', fontSize: '13px', whiteSpace: 'nowrap' }}>
                      {relativeTime(r.last_activity)}
                    </td>"""),
])

# the limit the column is drawn against
s = io.open('app/admin/page.js', encoding='utf-8').read()
anchor = "export default function AdminPage"
s = s.replace(anchor, """// Mirrors INSTAGRAM_MONTHLY_LIMIT on the server. Shown, not enforced — the API
// is what actually refuses a lookup (lib/quota.js); this only draws the bar.
const MONTHLY_LIMIT = 20;

""" + anchor, 1)
io.open('app/admin/page.js', 'w', encoding='utf-8').write(s)
print('admin: lookups column')
