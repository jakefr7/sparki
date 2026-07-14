'use client';

import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { type AppointmentTypeValue } from '../../lib/patient-types';

const INTERVAL_OPTIONS = [15, 20, 30, 45, 60] as const;
const DAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

interface AppointmentTypeSetting {
  id: string;
  appointmentType: AppointmentTypeValue | null;
  name: string;
  description: string | null;
  defaultDurationMinutes: number;
  color: string;
  isActive: boolean;
  sortOrder: number;
  providers: Array<{ id: string; displayName: string; role: string; isActive: boolean }>;
  isBookable: boolean;
}

interface SchedulerSlotTemplate {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  label: string;
  color: string;
  staffId: string | null;
  room: string | null;
  isActive: boolean;
}

interface SchedulerConfig {
  settings: { slotIntervalMinutes: number };
  appointmentTypes: AppointmentTypeSetting[];
  slotTemplates: SchedulerSlotTemplate[];
  canManage: boolean;
}

const EMPTY_TEMPLATE: SchedulerSlotTemplate = {
  id: '',
  dayOfWeek: 1,
  startTime: '09:00',
  endTime: '10:00',
  label: '',
  color: '#DCFCE7',
  staffId: null,
  room: '',
  isActive: true,
};

function shortDay(dayOfWeek: number): string {
  return DAY_LABELS[dayOfWeek]?.slice(0, 3) ?? 'Day';
}

function timeLabel(value: string): string {
  const [hour = '0', minute = '0'] = value.split(':');
  const date = new Date();
  date.setHours(Number(hour), Number(minute), 0, 0);
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function validateBlockDraft(draft: SchedulerSlotTemplate): string | null {
  if (!draft.label.trim()) return 'Label is required.';
  if (!draft.color.trim()) return 'Color is required.';
  if (!draft.startTime) return 'Start time is required.';
  if (!draft.endTime) return 'End time is required.';
  if (draft.startTime >= draft.endTime) return 'End time must be after start time.';
  return null;
}

function PencilIcon() {
  return (
    <svg viewBox="0 0 20 20" width="14" height="14" fill="none" aria-hidden="true">
      <path
        d="M13.4 3.6a1.4 1.4 0 0 1 2 0l1 1a1.4 1.4 0 0 1 0 2L7.5 15.5l-3.3.8.8-3.3L13.4 3.6Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 20 20" width="14" height="14" fill="none" aria-hidden="true">
      <path
        d="M4.5 6h11M8 6V4.6c0-.55.45-1 1-1h2c.55 0 1 .45 1 1V6m-6.5 0 .6 9.1c.04.7.62 1.2 1.32 1.2h5.16c.7 0 1.28-.5 1.32-1.2L14.5 6"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" fill="none" aria-hidden="true">
      <path d="M10 4v12M4 10h12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function SchedulerSettingsSection() {
  const [config, setConfig] = useState<SchedulerConfig | null>(null);
  const [editingTypeId, setEditingTypeId] = useState<string | null>(null);
  const [typeDraft, setTypeDraft] = useState<AppointmentTypeSetting | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [eligibleProviders, setEligibleProviders] = useState<Array<{ id: string; displayName: string; role: string }>>([]);

  const [blockModalOpen, setBlockModalOpen] = useState(false);
  const [draftTemplate, setDraftTemplate] = useState<SchedulerSlotTemplate>(EMPTY_TEMPLATE);
  const [blockFormError, setBlockFormError] = useState<string | null>(null);
  const [blockSaving, setBlockSaving] = useState(false);
  const [togglingBlockId, setTogglingBlockId] = useState<string | null>(null);
  const [deletingBlockId, setDeletingBlockId] = useState<string | null>(null);
  const [blockFeedback, setBlockFeedback] = useState<{ text: string; tone: 'success' | 'error' } | null>(
    null,
  );
  const blockFeedbackTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sortedAppointmentTypes = useMemo(
    () => [...(config?.appointmentTypes ?? [])].sort((a, b) => a.sortOrder - b.sortOrder),
    [config?.appointmentTypes],
  );

  const sortedBlocks = useMemo(
    () =>
      [...(config?.slotTemplates ?? [])].sort(
        (a, b) => a.dayOfWeek - b.dayOfWeek || a.startTime.localeCompare(b.startTime),
      ),
    [config?.slotTemplates],
  );

  useEffect(() => {
    let cancelled = false;
    fetch('/api/scheduler-config', { cache: 'no-store' })
      .then((response) => (response.ok ? (response.json() as Promise<SchedulerConfig>) : null))
      .then((body) => {
        if (!cancelled) setConfig(body);
      })
      .catch(() => {
        if (!cancelled) setConfig(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!config?.canManage) return;
    fetch('/api/scheduler-config/appointment-types/eligible-providers', { cache: 'no-store' })
      .then((response) => response.ok ? response.json() as Promise<typeof eligibleProviders> : [])
      .then(setEligibleProviders)
      .catch(() => setEligibleProviders([]));
  }, [config?.canManage]);

  useEffect(() => {
    return () => {
      if (blockFeedbackTimeout.current) clearTimeout(blockFeedbackTimeout.current);
    };
  }, []);

  function showBlockFeedback(text: string, tone: 'success' | 'error') {
    setBlockFeedback({ text, tone });
    if (blockFeedbackTimeout.current) clearTimeout(blockFeedbackTimeout.current);
    blockFeedbackTimeout.current = setTimeout(() => setBlockFeedback(null), 4000);
  }

  async function saveInterval(value: number) {
    setSaving('interval');
    setMessage(null);
    const response = await fetch('/api/scheduler-config/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slotIntervalMinutes: value }),
    });
    if (response.ok) {
      setConfig((current) =>
        current ? { ...current, settings: { slotIntervalMinutes: value } } : current,
      );
      setMessage('Schedule grid updated.');
    } else {
      setMessage('Could not update the schedule grid.');
    }
    setSaving(null);
  }

  async function saveAppointmentType(setting: AppointmentTypeSetting) {
    if (!setting.appointmentType) return;
    setSaving(setting.id);
    setMessage(null);
    const response = await fetch('/api/scheduler-config/appointment-types', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: setting.id || undefined,
        appointmentType: setting.appointmentType,
        name: setting.name,
        description: setting.description,
        defaultDurationMinutes: setting.defaultDurationMinutes,
        color: setting.color,
        isActive: setting.isActive,
        sortOrder: setting.sortOrder,
        providerIds: setting.providers.map((provider) => provider.id),
      }),
    });
    if (response.ok) {
      const saved = (await response.json()) as AppointmentTypeSetting;
      setConfig((current) =>
        current
          ? {
              ...current,
              appointmentTypes: current.appointmentTypes.map((candidate) =>
                candidate.appointmentType === saved.appointmentType ? saved : candidate,
              ),
            }
          : current,
      );
      setEditingTypeId(null);
      setTypeDraft(null);
      setMessage('Appointment type updated.');
    } else {
      setMessage('Could not update appointment type.');
    }
    setSaving(null);
  }

  function beginTypeEdit(setting: AppointmentTypeSetting) {
    setEditingTypeId(setting.id);
    setTypeDraft(setting);
    setMessage(null);
  }

  function beginTypeCreate() {
    setEditingTypeId('');
    setTypeDraft({ id: '', appointmentType: null, name: '', description: null, defaultDurationMinutes: 0, color: '#1FA9A0', isActive: true, sortOrder: (sortedAppointmentTypes.length + 1) * 10, providers: [], isBookable: false });
  }

  function openAddBlock() {
    setDraftTemplate(EMPTY_TEMPLATE);
    setBlockFormError(null);
    setBlockModalOpen(true);
  }

  function openEditBlock(template: SchedulerSlotTemplate) {
    setDraftTemplate(template);
    setBlockFormError(null);
    setBlockModalOpen(true);
  }

  function closeBlockModal() {
    setBlockModalOpen(false);
    setBlockFormError(null);
    setDraftTemplate(EMPTY_TEMPLATE);
  }

  async function saveSlotTemplate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validationError = validateBlockDraft(draftTemplate);
    if (validationError) {
      setBlockFormError(validationError);
      return;
    }

    setBlockSaving(true);
    setBlockFormError(null);
    const { id, ...templateWithoutId } = draftTemplate;
    const payload = id ? draftTemplate : templateWithoutId;
    const response = await fetch('/api/scheduler-config/slot-templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (response.ok) {
      const saved = (await response.json()) as SchedulerSlotTemplate;
      setConfig((current) =>
        current
          ? {
              ...current,
              slotTemplates: [
                ...current.slotTemplates.filter((candidate) => candidate.id !== saved.id),
                saved,
              ],
            }
          : current,
      );
      closeBlockModal();
      showBlockFeedback('Schedule block saved.', 'success');
    } else {
      setBlockFormError('Could not save schedule block.');
    }
    setBlockSaving(false);
  }

  async function toggleBlockVisibility(template: SchedulerSlotTemplate) {
    const nextIsActive = !template.isActive;
    setTogglingBlockId(template.id);
    setConfig((current) =>
      current
        ? {
            ...current,
            slotTemplates: current.slotTemplates.map((candidate) =>
              candidate.id === template.id ? { ...candidate, isActive: nextIsActive } : candidate,
            ),
          }
        : current,
    );

    const response = await fetch(`/api/scheduler-config/slot-templates/${template.id}/visibility`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: nextIsActive }),
    });

    if (response.ok) {
      showBlockFeedback(nextIsActive ? 'Schedule block shown.' : 'Schedule block hidden.', 'success');
    } else {
      setConfig((current) =>
        current
          ? {
              ...current,
              slotTemplates: current.slotTemplates.map((candidate) =>
                candidate.id === template.id ? { ...candidate, isActive: template.isActive } : candidate,
              ),
            }
          : current,
      );
      showBlockFeedback("Couldn't update schedule block visibility.", 'error');
    }
    setTogglingBlockId(null);
  }

  async function deleteBlock(template: SchedulerSlotTemplate) {
    const confirmed = window.confirm(
      'Delete this schedule block? It will no longer appear on the scheduler.',
    );
    if (!confirmed) return;

    setDeletingBlockId(template.id);
    const response = await fetch(`/api/scheduler-config/slot-templates/${template.id}`, {
      method: 'DELETE',
    });

    if (response.ok) {
      setConfig((current) =>
        current
          ? {
              ...current,
              slotTemplates: current.slotTemplates.filter((candidate) => candidate.id !== template.id),
            }
          : current,
      );
      showBlockFeedback('Schedule block deleted.', 'success');
    } else {
      showBlockFeedback("Couldn't delete schedule block.", 'error');
    }
    setDeletingBlockId(null);
  }

  const canManage = Boolean(config?.canManage);
  const loading = !config;
  const isEditingBlock = Boolean(draftTemplate.id);

  return (
    <section className="settings-section" aria-labelledby="settings-scheduler-heading">
      <h1 id="settings-scheduler-heading">Scheduler</h1>
      <p className="settings-section__intro">
        Configure the calendar experience for appointment scheduling.
      </p>

      {!loading && !canManage ? (
        <div className="scheduler-settings-lock">
          <strong>View only</strong>
          <span>
            You can view scheduler settings, but only users with scheduler settings permission can
            edit them.
          </span>
        </div>
      ) : null}

      <div className="scheduler-settings-stack">
        <section className="scheduler-settings-card" aria-labelledby="schedule-grid-heading">
          <div className="scheduler-settings-card__header">
            <div>
              <h2 id="schedule-grid-heading">Schedule Grid</h2>
              <p>Control the time spacing used across the calendar.</p>
            </div>
            {saving === 'interval' ? (
              <span className="scheduler-settings-saving">Saving...</span>
            ) : null}
          </div>
          <div className="scheduler-interval-control" aria-label="Time slot interval">
            {INTERVAL_OPTIONS.map((minutes) => (
              <button
                key={minutes}
                type="button"
                className={
                  config?.settings.slotIntervalMinutes === minutes
                    ? 'scheduler-interval-control__button scheduler-interval-control__button--active'
                    : 'scheduler-interval-control__button'
                }
                disabled={!canManage || loading || saving === 'interval'}
                onClick={() => void saveInterval(minutes)}
              >
                {minutes} min
              </button>
            ))}
          </div>
        </section>

        <section className="scheduler-settings-card" aria-labelledby="appointment-types-heading">
          <div className="scheduler-settings-card__header">
            <div>
              <h2 id="appointment-types-heading">Appointment Types</h2>
              <p>Manage duration, color, availability, and which doctors can perform each appointment.</p>
            </div>
            {canManage ? <button type="button" className="scheduler-primary-action" onClick={beginTypeCreate}>New Appointment Type</button> : null}
          </div>
          <div className="scheduler-type-list">
            {[...sortedAppointmentTypes, ...(editingTypeId === '' && typeDraft ? [typeDraft] : [])].map((setting) => {
              const editorDraft = editingTypeId === setting.id ? typeDraft : null;
              const displaySetting = editorDraft ?? setting;
              return (
                <article key={setting.id} className="scheduler-type-card">
                  <div className="scheduler-type-card__main">
                    <span
                      className="scheduler-type-card__swatch"
                      style={{ backgroundColor: displaySetting.color }}
                      aria-hidden="true"
                    />
                    <div>
                      <strong>{displaySetting.name}</strong>
                      <span>
                        {displaySetting.defaultDurationMinutes} min · {displaySetting.providers.length} doctor{displaySetting.providers.length === 1 ? '' : 's'} · {displaySetting.providers.length > 0 ? 'Bookable' : 'Not bookable'}
                      </span>
                    </div>
                  </div>
                  <span
                    className="scheduler-type-preview"
                    style={
                      {
                        '--scheduler-preview-color': displaySetting.color,
                      } as CSSProperties
                    }
                  >
                    Preview
                  </span>
                  <span
                    className={
                      displaySetting.isActive
                        ? 'scheduler-type-state scheduler-type-state--active'
                        : 'scheduler-type-state'
                    }
                  >
                    {displaySetting.isActive ? 'Active' : 'Inactive'}
                  </span>
                  {canManage ? (
                    <button
                      type="button"
                      className="button-secondary"
                      onClick={() => beginTypeEdit(setting)}
                    >
                      Edit
                    </button>
                  ) : null}
                  {editorDraft ? (
                    <form
                      className="scheduler-type-editor"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void saveAppointmentType(editorDraft);
                      }}
                    >
                      <label>
                        <span>Display name</span>
                        <input
                          value={editorDraft.name}
                          onChange={(event) =>
                            setTypeDraft((current) =>
                              current ? { ...current, name: event.target.value } : current,
                            )
                          }
                        />
                      </label>
                      <label>
                        <span>Description (optional)</span>
                        <input value={editorDraft.description ?? ''} onChange={(event) => setTypeDraft((current) => current ? { ...current, description: event.target.value } : current)} />
                      </label>
                      <label>
                        <span>Default duration</span>
                        <input type="number" min="5" max="1440" step="5" value={editorDraft.defaultDurationMinutes} onChange={(event) => setTypeDraft((current) => current ? { ...current, defaultDurationMinutes: Number(event.target.value) } : current)} />
                      </label>
                      <label>
                        <span>Color</span>
                        <input
                          type="color"
                          value={editorDraft.color}
                          onChange={(event) =>
                            setTypeDraft((current) =>
                              current ? { ...current, color: event.target.value } : current,
                            )
                          }
                        />
                      </label>
                      <fieldset className="appointment-type-doctors">
                        <legend>Doctors who can perform this appointment</legend>
                        <div className="appointment-type-doctors__actions">
                          <button type="button" onClick={() => setTypeDraft((current) => current ? { ...current, providers: eligibleProviders.map((provider) => ({ ...provider, isActive: true })) } : current)}>Select all eligible doctors</button>
                          <button type="button" onClick={() => setTypeDraft((current) => current ? { ...current, providers: [] } : current)}>Clear all</button>
                        </div>
                        {eligibleProviders.map((provider) => <label key={provider.id}><input type="checkbox" checked={editorDraft.providers.some((selected) => selected.id === provider.id)} onChange={(event) => setTypeDraft((current) => current ? { ...current, providers: event.target.checked ? [...current.providers, { ...provider, isActive: true }] : current.providers.filter((selected) => selected.id !== provider.id) } : current)} />{provider.displayName}</label>)}
                        {editorDraft.providers.length === 0 ? <p role="alert">This appointment type will not be available for new appointments until at least one doctor is assigned.</p> : null}
                      </fieldset>
                      <label className="scheduler-type-editor__toggle">
                        <input
                          type="checkbox"
                          checked={editorDraft.isActive}
                          onChange={(event) =>
                            setTypeDraft((current) =>
                              current ? { ...current, isActive: event.target.checked } : current,
                            )
                          }
                        />
                        Active
                      </label>
                      <div className="scheduler-type-editor__actions">
                        <button
                          type="submit"
                          className="scheduler-primary-action"
                          disabled={saving === editorDraft.id}
                        >
                          {saving === editorDraft.id ? 'Saving...' : 'Save changes'}
                        </button>
                        <button
                          type="button"
                          className="button-secondary"
                          onClick={() => {
                            setEditingTypeId(null);
                            setTypeDraft(null);
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  ) : null}
                </article>
              );
            })}
          </div>
        </section>

        <section className="scheduler-settings-card" aria-labelledby="schedule-blocks-heading">
          <div className="scheduler-settings-card__header">
            <div>
              <h2 id="schedule-blocks-heading">Schedule Blocks</h2>
              <p>Mark reserved time, surgery windows, or room availability on the calendar.</p>
            </div>
            <div className="schedule-blocks-header__actions">
              {blockFeedback ? (
                <span
                  className={
                    blockFeedback.tone === 'success'
                      ? 'schedule-blocks-feedback schedule-blocks-feedback--success'
                      : 'schedule-blocks-feedback schedule-blocks-feedback--error'
                  }
                  role="status"
                >
                  {blockFeedback.text}
                </span>
              ) : null}
              {canManage ? (
                <button
                  type="button"
                  className="schedule-block-icon-button schedule-block-icon-button--add"
                  onClick={openAddBlock}
                  aria-label="Add schedule block"
                  title="Add schedule block"
                >
                  <PlusIcon />
                </button>
              ) : null}
            </div>
          </div>

          {!loading && !canManage ? (
            <p className="schedule-blocks-lock">
              You can view schedule blocks, but only users with scheduler settings permission can
              edit them.
            </p>
          ) : null}

          <div className="schedule-block-list">
            {sortedBlocks.length > 0 ? (
              sortedBlocks.map((template) => (
                <div
                  key={template.id}
                  className={
                    template.isActive ? 'schedule-block-row' : 'schedule-block-row schedule-block-row--hidden'
                  }
                >
                  <span
                    className="schedule-block-row__swatch"
                    style={{ backgroundColor: template.color }}
                    aria-hidden="true"
                  />
                  <div className="schedule-block-row__info">
                    <strong>{template.label}</strong>
                    <span>
                      {shortDay(template.dayOfWeek)} · {timeLabel(template.startTime)}–
                      {timeLabel(template.endTime)}
                      {template.room ? ` · ${template.room}` : ''}
                    </span>
                  </div>

                  <label
                    className="schedule-block-toggle"
                    title={template.isActive ? 'Visible on calendar' : 'Hidden from calendar'}
                  >
                    <input
                      type="checkbox"
                      checked={template.isActive}
                      disabled={!canManage || togglingBlockId === template.id}
                      onChange={() => void toggleBlockVisibility(template)}
                      aria-label={
                        template.isActive
                          ? `Hide ${template.label} from calendar`
                          : `Show ${template.label} on calendar`
                      }
                    />
                    <span className="schedule-block-toggle__track" aria-hidden="true" />
                    <span className="schedule-block-toggle__label">
                      {template.isActive ? 'Visible' : 'Hidden'}
                    </span>
                  </label>

                  {canManage ? (
                    <div className="schedule-block-row__actions">
                      <button
                        type="button"
                        className="schedule-block-icon-button"
                        onClick={() => openEditBlock(template)}
                        aria-label={`Edit ${template.label}`}
                        title="Edit"
                      >
                        <PencilIcon />
                      </button>
                      <button
                        type="button"
                        className="schedule-block-icon-button schedule-block-icon-button--danger"
                        onClick={() => void deleteBlock(template)}
                        disabled={deletingBlockId === template.id}
                        aria-label={`Delete ${template.label}`}
                        title="Delete"
                      >
                        <TrashIcon />
                      </button>
                    </div>
                  ) : null}
                </div>
              ))
            ) : (
              <p className="scheduler-settings-empty">No schedule blocks yet.</p>
            )}
          </div>
        </section>
      </div>

      {message ? <p className="settings-save-message">{message}</p> : null}

      {blockModalOpen ? (
        <div className="schedule-block-modal-overlay" role="presentation" onClick={closeBlockModal}>
          <div
            className="schedule-block-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="schedule-block-modal-heading"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="schedule-block-modal__header">
              <h2 id="schedule-block-modal-heading">
                {isEditingBlock ? 'Edit schedule block' : 'Add schedule block'}
              </h2>
              <button
                type="button"
                className="schedule-block-modal__close"
                onClick={closeBlockModal}
                aria-label="Close"
              >
                <span aria-hidden="true">×</span>
              </button>
            </div>
            <form className="schedule-block-modal__form" onSubmit={saveSlotTemplate}>
              <label>
                <span>Label</span>
                <input
                  value={draftTemplate.label}
                  onChange={(event) =>
                    setDraftTemplate((current) => ({ ...current, label: event.target.value }))
                  }
                  placeholder="Surgery block"
                  required
                />
              </label>
              <label>
                <span>Day</span>
                <select
                  value={draftTemplate.dayOfWeek}
                  onChange={(event) =>
                    setDraftTemplate((current) => ({
                      ...current,
                      dayOfWeek: Number(event.target.value),
                    }))
                  }
                >
                  {DAY_LABELS.map((day, index) => (
                    <option key={day} value={index}>
                      {day}
                    </option>
                  ))}
                </select>
              </label>
              <div className="schedule-block-modal__form-row">
                <label>
                  <span>Start time</span>
                  <input
                    type="time"
                    value={draftTemplate.startTime}
                    onChange={(event) =>
                      setDraftTemplate((current) => ({ ...current, startTime: event.target.value }))
                    }
                    required
                  />
                </label>
                <label>
                  <span>End time</span>
                  <input
                    type="time"
                    value={draftTemplate.endTime}
                    onChange={(event) =>
                      setDraftTemplate((current) => ({ ...current, endTime: event.target.value }))
                    }
                    required
                  />
                </label>
              </div>
              <label>
                <span>Room / provider (optional)</span>
                <input
                  value={draftTemplate.room ?? ''}
                  onChange={(event) =>
                    setDraftTemplate((current) => ({ ...current, room: event.target.value }))
                  }
                  placeholder="Room 2 / Dr. Patel"
                />
              </label>
              <div className="schedule-block-modal__form-row schedule-block-modal__form-row--tight">
                <label>
                  <span>Color</span>
                  <input
                    type="color"
                    value={draftTemplate.color}
                    onChange={(event) =>
                      setDraftTemplate((current) => ({ ...current, color: event.target.value }))
                    }
                    required
                  />
                </label>
                <label className="schedule-block-modal__toggle">
                  <input
                    type="checkbox"
                    checked={draftTemplate.isActive}
                    onChange={(event) =>
                      setDraftTemplate((current) => ({ ...current, isActive: event.target.checked }))
                    }
                  />
                  Visible on calendar
                </label>
              </div>

              {blockFormError ? <p className="schedule-block-modal__error">{blockFormError}</p> : null}

              <div className="schedule-block-modal__actions">
                <button type="submit" className="scheduler-primary-action" disabled={blockSaving}>
                  {blockSaving ? 'Saving...' : 'Save schedule block'}
                </button>
                <button type="button" className="button-secondary" onClick={closeBlockModal}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </section>
  );
}
