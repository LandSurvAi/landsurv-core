import React from 'react';
import { StandardsComplianceIcon } from '../icons.tsx';

export const StandardsComplianceContent: React.FC = () => {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 p-4 bg-gray-900/50 rounded-lg border border-gray-700">
        <StandardsComplianceIcon className="w-16 h-16 text-violet-400 flex-shrink-0" />
        <div>
          <h3 className="text-2xl font-bold text-violet-400">Standards Compliance Agent</h3>
          <p className="text-gray-300">Automated plan-sheet completeness and CAD standards pre-checks.</p>
        </div>
      </div>

      <p>
        The Standards Compliance Agent compares a subject PDF against a user-defined checklist and optional standards sources.
        It can use CAD Manager context, any number of reference/control PDFs, or both.
      </p>

      <ul className="list-disc list-inside space-y-2 pl-2 text-gray-300">
        <li><strong className="text-gray-100">Checklist-driven audits:</strong> Enable only the checks needed for each review run.</li>
        <li><strong className="text-gray-100">Multiple reference PDFs:</strong> Upload as many example/baseline sheets as you have — the agent synthesizes a common standard across all of them.</li>
        <li><strong className="text-gray-100">CAD Manager integration:</strong> Pull active layers and linetypes through CACP when available.</li>
        <li><strong className="text-gray-100">Feature-aware layer/linetype checks:</strong> A layer or linetype is only flagged when its underlying feature is actually present on the subject sheet — not simply for being absent.</li>
        <li><strong className="text-gray-100">Actionable output:</strong> Pass/fail result with grouped issues, evidence snippets, and remediation suggestions.</li>
      </ul>

      <p>
        Use this agent as an automated pre-flight before final QA to reduce omissions and standardization drift.
      </p>
    </div>
  );
};
