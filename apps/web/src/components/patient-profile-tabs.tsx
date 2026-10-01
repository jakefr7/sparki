'use client';

import { type ReactNode, useEffect, useRef, useState } from 'react';

export interface PatientProfileTab {
  id: string;
  label: string;
  panel: ReactNode;
}

export function PatientProfileTabs({ tabs }: { tabs: PatientProfileTab[] }) {
  const firstTab = tabs[0]?.id ?? '';
  const [activeTab, setActiveTab] = useState(firstTab);
  const [visitedTabs, setVisitedTabs] = useState<string[]>([firstTab]);
  const buttons = useRef<Record<string, HTMLButtonElement | null>>({});
  const tabList = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const list = tabList.current;
    if (!list) return;
    function revealSelectedTab() {
      const button = buttons.current[activeTab];
      if (!button || !list) return;
      const bounds = list.getBoundingClientRect();
      const selected = button.getBoundingClientRect();
      if (selected.left < bounds.left) list.scrollLeft += selected.left - bounds.left;
      else if (selected.right > bounds.right) list.scrollLeft += selected.right - bounds.right;
    }
    revealSelectedTab();
    const observer = new ResizeObserver(revealSelectedTab);
    observer.observe(list);
    return () => observer.disconnect();
  }, [activeTab]);

  useEffect(() => {
    function readHash() {
      const id = window.location.hash.replace('#patient-profile-tab-', '');
      if (tabs.some((tab) => tab.id === id)) {
        setActiveTab(id);
        setVisitedTabs((visited) => (visited.includes(id) ? visited : [...visited, id]));
      }
    }
    readHash();
    window.addEventListener('hashchange', readHash);
    return () => window.removeEventListener('hashchange', readHash);
  }, [tabs]);

  function selectTab(id: string, focus = false) {
    setActiveTab(id);
    setVisitedTabs((visited) => (visited.includes(id) ? visited : [...visited, id]));
    window.history.replaceState(window.history.state, '', `#patient-profile-tab-${id}`);
    if (focus) buttons.current[id]?.focus();
  }

  return (
    <section className="patient-profile-tabs-shell">
      <div
        ref={tabList}
        className="patient-profile-tabs"
        role="tablist"
        aria-label="Patient profile sections"
      >
        {tabs.map((tab, index) => (
          <button
            key={tab.id}
            ref={(button) => {
              buttons.current[tab.id] = button;
            }}
            type="button"
            role="tab"
            id={`patient-profile-tab-${tab.id}`}
            tabIndex={activeTab === tab.id ? 0 : -1}
            aria-selected={activeTab === tab.id}
            aria-controls={`patient-profile-panel-${tab.id}`}
            className={
              activeTab === tab.id
                ? 'patient-profile-tab patient-profile-tab--active'
                : 'patient-profile-tab'
            }
            onClick={() => selectTab(tab.id)}
            onKeyDown={(event) => {
              const next =
                event.key === 'ArrowRight'
                  ? (index + 1) % tabs.length
                  : event.key === 'ArrowLeft'
                    ? (index - 1 + tabs.length) % tabs.length
                    : event.key === 'Home'
                      ? 0
                      : event.key === 'End'
                        ? tabs.length - 1
                        : null;
              if (next !== null) {
                event.preventDefault();
                selectTab(tabs[next]!.id, true);
              }
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {tabs.map((tab) => (
        <div
          key={tab.id}
          id={`patient-profile-panel-${tab.id}`}
          className="patient-profile-tab-panel"
          role="tabpanel"
          aria-labelledby={`patient-profile-tab-${tab.id}`}
          hidden={activeTab !== tab.id}
          tabIndex={0}
        >
          {visitedTabs.includes(tab.id) ? tab.panel : null}
        </div>
      ))}
    </section>
  );
}
