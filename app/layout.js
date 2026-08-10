import './globals.css';
import { AuthProvider } from '@/lib/AuthContext';
import AuthNav from './AuthNav';

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
        <AuthProvider>
          {/* Navbar */}
          <nav className="navbar">
            <a href="/" className="navbar-brand" style={{ textDecoration: 'none' }}>
              <div className="navbar-logo">OG</div>
              <div>
                <div className="navbar-name">Open Grey</div>
                <div className="navbar-sub">Reports</div>
              </div>
            </a>
            {/* Renders nothing while signed out, which is what the login page
                wants — no "New Report" button for someone who can't use it. */}
            <AuthNav />
          </nav>

          <main>{children}</main>
        </AuthProvider>
      </body>
    </html>
  );
}
