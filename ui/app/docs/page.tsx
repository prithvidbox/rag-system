'use client';

import { useEffect, useState } from 'react';
import { getApiBase } from '../lib/api';

interface OpenApiDocument {
  info?: { title?: string; version?: string; description?: string };
}

export default function DocsPage() {
  const [spec, setSpec] = useState<OpenApiDocument | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const response = await fetch(`${getApiBase()}/openapi.json`);
        if (!response.ok) {
          throw new Error('Failed to load OpenAPI spec');
        }
        setSpec(await response.json());
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load docs');
      }
    })();
  }, []);

  return (
    <main className="card">
      <h2>API Documentation</h2>
      <p style={{ color: '#94a3b8' }}>
        Explore the REST API. Full Swagger UI available at <a style={{ color: '#38bdf8' }} href={`${getApiBase()}/docs`} target="_blank" rel="noreferrer">/docs</a>.
      </p>
      {error && <p style={{ color: '#f87171' }}>{error}</p>}
      {spec && (
        <pre style={{ maxHeight: '480px', overflow: 'auto', background: '#0f172a', padding: '1rem', borderRadius: '8px' }}>
          {JSON.stringify(spec, null, 2)}
        </pre>
      )}
    </main>
  );
}
