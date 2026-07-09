'use client';

import { type ReactNode, useState } from 'react';

export interface PatientProfileTab {
  id: string;
  label: string;
  panel: ReactNode;
}

export function PatientProfileTabs({ tabs }: { tabs: PatientProfileTab[] }) {
  const [activeTab, setActiveTab] = useState(tabs[0]?.id ?? '');
  const activePanel = tabs.find((tab) => tab.id === activeTab)?.panel ?? tabs[0]?.panel;

  return (
    <section className="patient-profile-tabs-shell">
      <div className="patient-profile-tabs" role="tablist" aria-label="Patient profile sections">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`patient-profile-tab-${tab.id}`}
            aria-selected={activeTab === tab.id}
            aria-controls={`patient-profile-panel-${tab.id}`}
            className={activeTab === tab.id ? 'patient-profile-tab patient-profile-tab--active' : 'patient-profile-tab'}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div
        id={`patient-profile-panel-${activeTab}`}
        className="patient-profile-tab-panel"
        role="tabpanel"
        aria-labelledby={`patient-profile-tab-${activeTab}`}
      >
        {activePanel}
      </div>
    </section>
  );
}
