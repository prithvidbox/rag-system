'use client';

import { useState } from 'react';

const steps = [
  {
    title: 'Welcome to Thinkbox',
    description: 'Your enterprise knowledge orchestration platform.',
  },
  {
    title: 'Search & Chat',
    description: 'Use the global search bar or chat to query your knowledge base.',
  },
  {
    title: 'Upload & Integrate',
    description: 'Upload documents or connect data sources like SharePoint.',
  },
  {
    title: 'Insights & Sources',
    description: 'Track ingestion progress and view cited knowledge sources.',
  },
];

export default function Onboarding() {
  const [step, setStep] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  return (
    <div className="onboarding-overlay">
      <div className="onboarding-card">
        <h2 className="onboarding-title">{steps[step].title}</h2>
        <p className="onboarding-description">{steps[step].description}</p>
        <div className="onboarding-actions">
          {step < steps.length - 1 ? (
            <button
              className="btn btn-primary"
              onClick={() => setStep((s) => s + 1)}
            >
              Next
            </button>
          ) : (
            <button
              className="btn btn-primary"
              onClick={() => setDismissed(true)}
            >
              Finish
            </button>
          )}
          <button
            className="btn btn-ghost"
            onClick={() => setDismissed(true)}
          >
            Skip
          </button>
        </div>
      </div>
    </div>
  );
}
