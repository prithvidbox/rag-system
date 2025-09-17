'use client';

import './globals.css';
import './theme.css';
import type { ReactNode } from 'react';
import { useEffect } from 'react';

export default function RootLayout({ children }: { children: ReactNode }) {
  useEffect(() => {
    // Default theme
    if (!document.documentElement.getAttribute('data-theme')) {
      document.documentElement.setAttribute('data-theme', 'light');
    }
  }, []);

  return (
    <html lang="en" data-theme="light">
      <head>
        <title>Thinkbox</title>
        <meta name="description" content="Thinkbox knowledge orchestration platform" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body className="app-body">
        {/* Global Navigation */}
        <div id="global-nav">
          {/* NavBar will be rendered at the top of every page */}
        </div>
        {children}
      </body>
    </html>
  );
}
