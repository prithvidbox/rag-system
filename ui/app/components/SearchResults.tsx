'use client';

import { useState } from 'react';

interface SearchResult {
  id: string;
  title: string;
  snippet: string;
  source: string;
  date?: string;
  score?: number;
}

interface Props {
  results: SearchResult[];
}

export default function SearchResults({ results }: Props) {
  const [sortBy, setSortBy] = useState<'relevance' | 'date'>('relevance');
  const [filter, setFilter] = useState<string>('');

  const filteredResults = results
    .filter((r) =>
      filter ? r.source.toLowerCase().includes(filter.toLowerCase()) : true
    )
    .sort((a, b) => {
      if (sortBy === 'date' && a.date && b.date) {
        return new Date(b.date).getTime() - new Date(a.date).getTime();
      }
      return (b.score ?? 0) - (a.score ?? 0);
    });

  return (
    <div className="search-results">
      <div className="search-controls">
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as 'relevance' | 'date')}
        >
          <option value="relevance">Sort by Relevance</option>
          <option value="date">Sort by Date</option>
        </select>
        <input
          type="text"
          placeholder="Filter by source..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>

      {filteredResults.length === 0 ? (
        <div className="empty-state">
          <p>No results found.</p>
        </div>
      ) : (
        <ul className="results-list">
          {filteredResults.map((result) => (
            <li key={result.id} className="result-card">
              <h3 className="result-title">{result.title}</h3>
              <p className="result-snippet">{result.snippet}</p>
              <div className="result-meta">
                <span className="result-source">{result.source}</span>
                {result.date && <span className="result-date">{result.date}</span>}
                {result.score && (
                  <span className="result-score">
                    Relevance: {Math.round(result.score * 100)}%
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
