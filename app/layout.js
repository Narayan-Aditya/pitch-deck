import Link from 'next/link';
import './globals.css';
import { AuthProvider } from '@/lib/AuthContext';
import AuthNav from './AuthNav';
import ThemeToggle from './ThemeToggle';

export const metadata = {
  title: 'Open Grey | Pitch Report Generator',
  description: 'Generate brand pitch reports from a name and Instagram handle.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* Applies a saved theme choice before the first paint. Without it the
            browser's own preference paints for a frame and then flips, which
            reads as a bug. Deliberately does nothing when no choice is stored:
            the absence of the attribute is what lets the prefers-color-scheme
            rule in globals.css decide. */}
        <script
          dangerouslySetInnerHTML={{
            __html: "(function(){try{var t=localStorage.getItem('theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}})()",
          }}
        />
      </head>
      <body>
        <AuthProvider>
          {/* Navbar */}
          <nav className="navbar">
            <Link href="/" className="navbar-brand" style={{ textDecoration: 'none' }}>
              <div className="navbar-logo">OG</div>
              <div className="navbar-name">Open Grey</div>
            </Link>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              {/* Outside AuthNav on purpose: the theme is worth switching on the
                  login page too, and AuthNav renders nothing while signed out. */}
              <ThemeToggle />
              <AuthNav />
            </div>
          </nav>

          <main>{children}</main>
        </AuthProvider>
      </body>
    </html>
  );
}
