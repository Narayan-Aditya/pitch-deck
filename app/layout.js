import './globals.css';

export const metadata = {
  title: 'Open Grey | Pitch Report Generator',
  description: 'Generate brand pitch reports from a name and Instagram handle.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body>
        {/* Navbar */}
        <nav className="navbar">
          <a href="/" className="navbar-brand" style={{ textDecoration: 'none' }}>
            <div className="navbar-logo">OG</div>
            <div>
              <div className="navbar-name">Open Grey</div>
              <div className="navbar-sub">Reports</div>
            </div>
          </a>
          <a href="/new-report" className="btn btn-primary btn-sm">
            + New Report
          </a>
        </nav>

        <main>{children}</main>
      </body>
    </html>
  );
}
