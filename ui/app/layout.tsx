import './globals.css';
import type { ReactNode } from 'react';
import dynamic from 'next/dynamic';

const NavBar = dynamic(() => import('./components/NavBar'), { ssr: false });

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="container">
          <header style={{ marginBottom: '2rem' }}>
            <h1>RAG Studio</h1>
            <p style={{ color: '#94a3b8' }}>
              Production-ready retrieval augmented generation workspace
            </p>
          </header>
          <NavBar />
          {children}
        </div>
      </body>
    </html>
  );
}
