'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { useLockBodyScroll } from '../../hooks/use-lock-body-scroll';
import {
  APPOINTMENT_TYPES,
  appointmentTypeLabel,
  type AppointmentTypeValue,
} from '../../lib/patient-types';

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
  appointmentTypeIds: string[];
}

interface SchedulerConfig {
  settings: { slotIntervalMinutes: number };
  appointmentTypes: AppointmentTypeSetting[];
  slotTemplates: SchedulerSlotTemplate[];
  canManage: boolean;
}

function normalizeSlotTemplate(
  template: SchedulerSlotTemplate & { appointmentTypes?: Array<{ appointmentTypeId: string }> },
  fallbackAppointmentTypeIds: string[] = [],
): SchedulerSlotTemplate {
  return {
    ...template,
    appointmentTypeIds: Array.isArray(template.appointmentTypeIds)
      ? template.appointmentTypeIds
      : Array.isArray(template.appointmentTypes)
        ? template.appointmentTypes.map((assignment) => assignment.appointmentTypeId)
        : fallbackAppointmentTypeIds,
  };
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
  appointmentTypeIds: [],
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
  const [eligibleProviders, setEligibleProviders] = useState<
    Array<{ id: string; displayName: string; role: string }>
  >([]);

  const [selectedDays, setSelectedDays] = useState<number[]>([1]);
  const [blockModalOpen, setBlockModalOpen] = useState(false);
  const [draftTemplate, setDraftTemplate] = useState<SchedulerSlotTemplate>(EMPTY_TEMPLATE);
  const [blockFormError, setBlockFormError] = useState<string | null>(null);
  const [blockSaving, setBlockSaving] = useState(false);
  const [togglingBlockId, setTogglingBlockId] = useState<string | null>(null);
  const [deletingBlockId, setDeletingBlockId] = useState<string | null>(null);
  const [blockFeedback, setBlockFeedback] = useState<{
    text: string;
    tone: 'success' | 'error';
  } | null>(null);
  const [expandedSections, setExpandedSections] = useState({
    grid: false,
    types: true,
    blocks: true,
  });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const blockFeedbackTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useLockBodyScroll(blockModalOpen || Boolean(typeDraft && !typeDraft.id));

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

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [response, providers] = await Promise.all([
        fetch('/api/scheduler-config', { cache: 'no-store' }),
        fetch('/api/scheduler-config/appointment-types/eligible-providers', { cache: 'no-store' }),
      ]);
      if (!response.ok || !providers.ok) throw new Error('Could not load scheduling settings.');
      const body = (await response.json()) as SchedulerConfig;
      setConfig({
        ...body,
        slotTemplates: body.slotTemplates.map((template) => normalizeSlotTemplate(template)),
      });
      setEligibleProviders((await providers.json()) as typeof eligibleProviders);
    } catch (caught) {
      setLoadError(
        caught instanceof Error && !(caught instanceof TypeError)
          ? caught.message
          : 'Could not load scheduling settings.',
      );
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

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

  function toggleSection(section: keyof typeof expandedSections) {
    setExpandedSections((current) => ({ ...current, [section]: !current[section] }));
  }

  async function saveInterval(value: number) {
    if (saving !== null) return;
    setSaving('interval');
    setMessage(null);
    try {
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
    } catch {
      setMessage('Could not update the schedule grid. Try again.');
    } finally {
      setSaving(null);
    }
  }

  async function saveAppointmentType(setting: AppointmentTypeSetting) {
    if (saving !== null) return;
    if (!setting.appointmentType) {
      setMessage('Choose an appointment category before saving.');
      return;
    }
    setSaving(setting.id);
    setMessage(null);
    try {
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
                appointmentTypes: current.appointmentTypes.some(
                  (candidate) => candidate.id === saved.id,
                )
                  ? current.appointmentTypes.map((candidate) =>
                      candidate.id === saved.id ? saved : candidate,
                    )
                  : [...current.appointmentTypes, saved],
              }
            : current,
        );
        setEditingTypeId(null);
        setTypeDraft(null);
        setMessage('Appointment type updated.');
      } else {
        const body = (await response.json().catch(() => null)) as { message?: string } | null;
        setMessage(body?.message ?? 'Could not update appointment type.');
      }
    } catch {
      setMessage('Could not save appointment type. Your edits are retained.');
    } finally {
      setSaving(null);
    }
  }

  function beginTypeEdit(setting: AppointmentTypeSetting) {
    setEditingTypeId(setting.id);
    setTypeDraft(setting);
    setMessage(null);
  }

  function beginTypeCreate() {
    setEditingTypeId('');
    setTypeDraft({
      id: '',
      appointmentType: null,
      name: '',
      description: null,
      defaultDurationMinutes: 0,
      color: '#1FA9A0',
      isActive: true,
      sortOrder: (sortedAppointmentTypes.length + 1) * 10,
      providers: [],
      isBookable: false,
    });
  }

  function closeTypeEditor() {
    if (saving !== null) return;
    setEditingTypeId(null);
    setTypeDraft(null);
  }

  function openAddBlock() {
    setExpandedSections((current) => ({ ...current, blocks: true }));
    setDraftTemplate(EMPTY_TEMPLATE);
    setSelectedDays([1]);
    setBlockFormError(null);
    setBlockModalOpen(true);
  }

  function openEditBlock(template: SchedulerSlotTemplate) {
    setDraftTemplate(normalizeSlotTemplate(template));
    setSelectedDays([template.dayOfWeek]);
    setBlockFormError(null);
    setBlockModalOpen(true);
  }

  function closeBlockModal() {
    if (blockSaving) return;
    setBlockModalOpen(false);
    setBlockFormError(null);
    setDraftTemplate(EMPTY_TEMPLATE);
  }

  async function saveSlotTemplate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (blockSaving) return;
    const validationError = selectedDays.length ? validateBlockDraft(draftTemplate) : 'Choose at least one weekday.';
    if (validationError) {
      setBlockFormError(validationError);
      return;
    }

    setBlockSaving(true);
    setBlockFormError(null);
    const { id, ...templateWithoutId } = draftTemplate;
    const payload = id ? draftTemplate : { templates: selectedDays.map((dayOfWeek) => ({ ...templateWithoutId, dayOfWeek })) };
    try {
      const response = await fetch(id ? '/api/scheduler-config/slot-templates' : '/api/scheduler-config/slot-templates/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (response.ok) {
        const body = await response.json() as SchedulerSlotTemplate | SchedulerSlotTemplate[];
        const saved = (Array.isArray(body) ? body : [body]).map((template) =>
          normalizeSlotTemplate(template, draftTemplate.appointmentTypeIds));
        setConfig((current) => current ? { ...current, slotTemplates: [
          ...current.slotTemplates.filter((candidate) => !saved.some((item) => item.id === candidate.id)),
          ...saved,
        ] } : current);
        setBlockModalOpen(false);
        setBlockFormError(null);
        setDraftTemplate(EMPTY_TEMPLATE);
        showBlockFeedback(id ? 'Schedule block updated.' : `${saved.length} weekly block${saved.length === 1 ? '' : 's'} created — one per selected weekday.`, 'success');
      } else {
        const body = (await response.json().catch(() => null)) as { message?: string } | null;
        setBlockFormError(body?.message ?? 'Could not save schedule block.');
      }
    } catch {
      setBlockFormError('Could not save schedule block. Your edits are retained.');
    } finally {
      setBlockSaving(false);
    }
  }

  async function toggleBlockVisibility(template: SchedulerSlotTemplate) {
    if (togglingBlockId || deletingBlockId || blockSaving) return;
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

    try {
      const response = await fetch(
        `/api/scheduler-config/slot-templates/${template.id}/visibility`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isActive: nextIsActive }),
        },
      );

      if (response.ok) {
        showBlockFeedback(
          nextIsActive ? 'Schedule block shown.' : 'Schedule block hidden.',
          'success',
        );
      } else {
        setConfig((current) =>
          current
            ? {
                ...current,
                slotTemplates: current.slotTemplates.map((candidate) =>
                  candidate.id === template.id
                    ? { ...candidate, isActive: template.isActive }
                    : candidate,
                ),
              }
            : current,
        );
        const body = (await response.json().catch(() => null)) as { message?: string } | null;
        showBlockFeedback(body?.message ?? "Couldn't update schedule block visibility.", 'error');
      }
    } catch {
      setConfig((current) =>
        current
          ? {
              ...current,
              slotTemplates: current.slotTemplates.map((candidate) =>
                candidate.id === template.id ? template : candidate,
              ),
            }
          : current,
      );
      showBlockFeedback(
        "Couldn't update schedule block visibility. Previous setting restored.",
        'error',
      );
    } finally {
      setTogglingBlockId(null);
    }
  }

  async function deleteBlock(template: SchedulerSlotTemplate) {
    if (togglingBlockId || deletingBlockId || blockSaving) return;
    const confirmed = window.confirm(
      'Delete this schedule block? It will no longer appear on the scheduler.',
    );
    if (!confirmed) return;

    setDeletingBlockId(template.id);
    try {
      const response = await fetch(`/api/scheduler-config/slot-templates/${template.id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setConfig((current) =>
          current
            ? {
                ...current,
                slotTemplates: current.slotTemplates.filter(
                  (candidate) => candidate.id !== template.id,
                ),
              }
            : current,
        );
        showBlockFeedback('Schedule block deleted.', 'success');
      } else {
        const body = (await response.json().catch(() => null)) as { message?: string } | null;
        showBlockFeedback(body?.message ?? "Couldn't delete schedule block.", 'error');
      }
    } catch {
      showBlockFeedback("Couldn't delete schedule block. Try again.", 'error');
    } finally {
      setDeletingBlockId(null);
    }
  }

  const canManage = Boolean(config?.canManage);
  const isEditingBlock = Boolean(draftTemplate.id);

  return (
    <section className="settings-section" aria-labelledby="settings-scheduler-heading">
      <h2 id="settings-scheduler-heading">Scheduling</h2>
      <p className="settings-section__intro">
        Set up the appointments your team offers and when they can be booked.
      </p>

      {loading ? <p role="status">Loading scheduling settings…</p> : null}
      {loadError ? (
        <div className="admin-feedback admin-feedback--error" role="alert">
          <p>{loadError}</p>
          <button
            type="button"
            className="button-secondary"
            disabled={loading}
            onClick={() => void load()}
          >
            Try again
          </button>
        </div>
      ) : null}
      {config ? (
        <div className="admin-booking-summary">
          <div>
            <strong>Booking setup</strong>
            <p>
              {config.appointmentTypes.filter((type) => type.isActive).length} active appointment
              types · {config.slotTemplates.filter((block) => block.isActive).length} active weekly
              blocks
            </p>
            <p>
              {!config.appointmentTypes.some((type) => type.isActive)
                ? 'Start with an appointment type, assign eligible providers, then add weekly availability.'
                : !config.slotTemplates.some((block) => block.isActive)
                  ? 'Add weekly blocks with matching appointment types and providers to enable booking.'
                  : 'Booking requires a matching type, eligible provider, and available time. Date exceptions close those times.'}
            </p>
          </div>
        </div>
      ) : null}
      {!loading && config && !canManage ? (
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
              <h2 id="schedule-grid-heading">Schedule grid</h2>
              <p>
                Calendar spacing{config ? ` · ${config.settings.slotIntervalMinutes} minutes` : ''}.
                Appointment duration is set per type.
              </p>
            </div>
            <div className="settings-section-header-actions">
              {saving === 'interval' ? (
                <span className="scheduler-settings-saving">Saving...</span>
              ) : null}
              <button
                type="button"
                className={
                  expandedSections.grid
                    ? 'settings-collapse-button settings-collapse-button--expanded'
                    : 'settings-collapse-button'
                }
                aria-expanded={expandedSections.grid}
                aria-controls="schedule-grid-content"
                aria-label={
                  expandedSections.grid ? 'Collapse schedule grid' : 'Expand schedule grid'
                }
                onClick={() => toggleSection('grid')}
              >
                <span aria-hidden="true" />
              </button>
            </div>
          </div>
          <div
            id="schedule-grid-content"
            className="scheduler-interval-control"
            aria-label="Time slot interval"
            hidden={!expandedSections.grid}
          >
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
              <h2 id="appointment-types-heading">Appointment types</h2>
              <p>Choose duration, color, and eligible providers for each kind of appointment.</p>
            </div>
            <div className="settings-section-header-actions">
              {canManage ? (
                <button
                  type="button"
                  className="schedule-block-icon-button schedule-block-icon-button--add"
                  aria-label="Add appointment type"
                  title="Add appointment type"
                  onClick={() => {
                    setExpandedSections((current) => ({ ...current, types: true }));
                    beginTypeCreate();
                  }}
                >
                  <PlusIcon />
                </button>
              ) : null}
              <button
                type="button"
                className={
                  expandedSections.types
                    ? 'settings-collapse-button settings-collapse-button--expanded'
                    : 'settings-collapse-button'
                }
                aria-expanded={expandedSections.types}
                aria-controls="appointment-types-content"
                aria-label={
                  expandedSections.types ? 'Collapse appointment types' : 'Expand appointment types'
                }
                onClick={() => toggleSection('types')}
              >
                <span aria-hidden="true" />
              </button>
            </div>
          </div>
          <div
            id="appointment-types-content"
            className="scheduler-type-list"
            hidden={!expandedSections.types}
          >
            {!loading && config && !sortedAppointmentTypes.length ? (
              <p className="admin-empty">
                No appointment types yet. Add the appointments your team offers to start booking.
              </p>
            ) : null}
            {sortedAppointmentTypes.map((setting) => {
              const editorDraft = editingTypeId === setting.id ? typeDraft : null;
              const displaySetting = setting;
              return (
                <article
                  key={setting.id}
                  className={
                    editorDraft
                      ? 'scheduler-type-card scheduler-type-card--editing'
                      : 'scheduler-type-card'
                  }
                >
                  <div className="scheduler-type-card__main">
                    <span
                      className="scheduler-type-card__swatch"
                      style={{ backgroundColor: displaySetting.color }}
                      aria-hidden="true"
                    />
                    <div>
                      <strong>{displaySetting.name}</strong>
                      <span>
                        {displaySetting.defaultDurationMinutes} min ·{' '}
                        {displaySetting.providers.length} provider
                        {displaySetting.providers.length === 1 ? '' : 's'} ·{' '}
                        {displaySetting.isActive &&
                        displaySetting.providers.some((provider) => provider.isActive)
                          ? 'Weekly availability required'
                          : 'Not available for booking'}
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
                      className="schedule-block-icon-button"
                      aria-label={`Edit ${setting.name}`}
                      title="Edit"
                      onClick={() => beginTypeEdit(setting)}
                    >
                      <PencilIcon />
                    </button>
                  ) : null}
                </article>
              );
            })}
          </div>
        </section>

        {typeDraft ? (
          <div
            className={typeDraft.id ? 'appointment-type-editor-inline' : 'status-editor-modal'}
            role={typeDraft.id ? 'region' : 'presentation'}
            aria-label={typeDraft.id ? `Edit ${typeDraft.name}` : undefined}
            onMouseDown={typeDraft.id || saving !== null ? undefined : closeTypeEditor}
          >
            <div
              className={
                typeDraft.id
                  ? 'appointment-type-editor-inline__panel'
                  : 'status-editor-modal__panel appointment-type-editor-modal__panel'
              }
              role={typeDraft.id ? undefined : 'dialog'}
              aria-modal={typeDraft.id ? undefined : true}
              aria-labelledby="appointment-type-editor-heading"
              onMouseDown={(event) => event.stopPropagation()}
            >
              <form
                className="scheduler-type-editor status-editor appointment-type-editor"
                onSubmit={(event) => {
                  event.preventDefault();
                  void saveAppointmentType(typeDraft);
                }}
              >
                <fieldset disabled={saving !== null} className="admin-editor-fields">
                  <div className="status-editor__heading">
                    <div>
                      <span className="eyebrow">Appointment settings</span>
                      <h2 id="appointment-type-editor-heading">
                        {typeDraft.id ? `Edit ${typeDraft.name}` : 'Create appointment type'}
                      </h2>
                      <p>Control scheduling, appearance, duration, and eligible providers.</p>
                    </div>
                    <span
                      className="appointment-type-editor__preview"
                      style={{ '--status-editor-color': typeDraft.color } as CSSProperties}
                    >
                      <span>{typeDraft.name || 'Appointment preview'}</span>
                      <small>{typeDraft.defaultDurationMinutes || 0} min</small>
                    </span>
                  </div>

                  <div className="appointment-type-editor__details">
                    <label>
                      <span>Category</span>
                      <select
                        value={typeDraft.appointmentType ?? ''}
                        onChange={(event) =>
                          setTypeDraft({
                            ...typeDraft,
                            appointmentType: event.target.value as AppointmentTypeValue,
                          })
                        }
                        required
                      >
                        <option value="" disabled>
                          Select category
                        </option>
                        {APPOINTMENT_TYPES.map((type) => (
                          <option key={type} value={type}>
                            {appointmentTypeLabel(type)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="appointment-type-editor__name">
                      <span>Display name</span>
                      <input
                        autoFocus
                        value={typeDraft.name}
                        onChange={(event) =>
                          setTypeDraft({ ...typeDraft, name: event.target.value })
                        }
                        required
                      />
                    </label>
                    <label className="appointment-type-editor__description">
                      <span>Description</span>
                      <input
                        value={typeDraft.description ?? ''}
                        onChange={(event) =>
                          setTypeDraft({ ...typeDraft, description: event.target.value })
                        }
                        placeholder="Explain when this appointment type is used"
                      />
                    </label>
                    <label>
                      <span>Default duration</span>
                      <div className="appointment-type-editor__duration">
                        <input
                          type="number"
                          min="5"
                          max="1440"
                          step="5"
                          value={typeDraft.defaultDurationMinutes}
                          onChange={(event) =>
                            setTypeDraft({
                              ...typeDraft,
                              defaultDurationMinutes: Number(event.target.value),
                            })
                          }
                          required
                        />
                        <strong>minutes</strong>
                      </div>
                    </label>
                    <label>
                      <span>Color</span>
                      <span className="status-editor__color-control">
                        <input
                          type="color"
                          value={typeDraft.color}
                          onChange={(event) =>
                            setTypeDraft({ ...typeDraft, color: event.target.value })
                          }
                        />
                        <strong>{typeDraft.color.toUpperCase()}</strong>
                      </span>
                    </label>
                  </div>

                  <div className="appointment-type-editor__behavior">
                    <div>
                      <h3>Availability</h3>
                      <p>Choose whether staff can use this appointment type.</p>
                    </div>
                    <label className="status-editor__switch">
                      <input
                        type="checkbox"
                        checked={typeDraft.isActive}
                        onChange={(event) =>
                          setTypeDraft({ ...typeDraft, isActive: event.target.checked })
                        }
                      />
                      <span aria-hidden="true" />
                      <div>
                        <strong>Active</strong>
                        <small>Show this type in scheduling and booking workflows.</small>
                      </div>
                    </label>
                  </div>

                  <fieldset className="appointment-type-editor__doctors">
                    <legend>Eligible providers</legend>
                    <div className="appointment-type-editor__doctors-heading">
                      <p>Select every provider who can perform this appointment.</p>
                      <div>
                        <button
                          type="button"
                          onClick={() =>
                            setTypeDraft({
                              ...typeDraft,
                              providers: eligibleProviders.map((provider) => ({
                                ...provider,
                                isActive: true,
                              })),
                            })
                          }
                        >
                          Select all
                        </button>
                        <button
                          type="button"
                          onClick={() => setTypeDraft({ ...typeDraft, providers: [] })}
                        >
                          Clear
                        </button>
                      </div>
                    </div>
                    <div className="appointment-type-editor__doctor-grid">
                      {eligibleProviders.map((provider) => {
                        const selected = typeDraft.providers.some(
                          (candidate) => candidate.id === provider.id,
                        );
                        return (
                          <label
                            key={provider.id}
                            className={
                              selected
                                ? 'appointment-type-editor__doctor appointment-type-editor__doctor--selected'
                                : 'appointment-type-editor__doctor'
                            }
                          >
                            <input
                              type="checkbox"
                              checked={selected}
                              onChange={(event) =>
                                setTypeDraft({
                                  ...typeDraft,
                                  providers: event.target.checked
                                    ? [...typeDraft.providers, { ...provider, isActive: true }]
                                    : typeDraft.providers.filter(
                                        (candidate) => candidate.id !== provider.id,
                                      ),
                                })
                              }
                            />
                            <span aria-hidden="true" />
                            <div>
                              <strong>{provider.displayName}</strong>
                              <small>{selected ? 'Eligible' : 'Not eligible'}</small>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                    {typeDraft.providers.length === 0 ? (
                      <p className="appointment-type-editor__warning" role="alert">
                        Assign at least one provider before this appointment type can be booked.
                      </p>
                    ) : null}
                  </fieldset>

                  {message ? (
                    <p className="admin-feedback" role="status">
                      {message}
                    </p>
                  ) : null}
                  <div className="scheduler-type-editor__actions status-editor__actions">
                    <button
                      type="submit"
                      className="scheduler-primary-action"
                      disabled={saving === typeDraft.id}
                    >
                      {saving === typeDraft.id
                        ? 'Saving…'
                        : typeDraft.id
                          ? 'Save appointment type'
                          : 'Create appointment type'}
                    </button>
                    <button type="button" className="button-secondary" onClick={closeTypeEditor}>
                      Cancel
                    </button>
                  </div>
                </fieldset>
              </form>
            </div>
          </div>
        ) : null}

        <section className="scheduler-settings-card" aria-labelledby="schedule-blocks-heading">
          <div className="scheduler-settings-card__header">
            <div>
              <h2 id="schedule-blocks-heading">Schedule blocks</h2>
              <p>
                Set recurring weekly availability for appointment booking. These blocks enable
                booking; they do not reserve or block off time.
              </p>
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
              <button
                type="button"
                className={
                  expandedSections.blocks
                    ? 'settings-collapse-button settings-collapse-button--expanded'
                    : 'settings-collapse-button'
                }
                aria-expanded={expandedSections.blocks}
                aria-controls="schedule-blocks-content"
                aria-label={
                  expandedSections.blocks ? 'Collapse schedule blocks' : 'Expand schedule blocks'
                }
                onClick={() => toggleSection('blocks')}
              >
                <span aria-hidden="true" />
              </button>
            </div>
          </div>

          {!loading && config && !canManage ? (
            <p className="schedule-blocks-lock">
              You can view schedule blocks, but only users with scheduler settings permission can
              edit them.
            </p>
          ) : null}

          <div
            id="schedule-blocks-content"
            className="schedule-block-list"
            hidden={!expandedSections.blocks}
          >
            {sortedBlocks.length > 0 ? (
              sortedBlocks.map((template) => (
                <div
                  key={template.id}
                  className={
                    template.isActive
                      ? 'schedule-block-row'
                      : 'schedule-block-row schedule-block-row--hidden'
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
                    <span>
                      {(template.appointmentTypeIds ?? []).length > 0
                        ? (template.appointmentTypeIds ?? [])
                            .map(
                              (id) => config?.appointmentTypes.find((type) => type.id === id)?.name,
                            )
                            .filter(Boolean)
                            .join(', ')
                        : 'All unassigned appointment types'}
                    </span>
                  </div>

                  <label
                    className="schedule-block-toggle"
                    title={template.isActive ? 'Visible on calendar' : 'Hidden from calendar'}
                  >
                    <input
                      type="checkbox"
                      checked={template.isActive}
                      disabled={
                        !canManage || Boolean(togglingBlockId || deletingBlockId) || blockSaving
                      }
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
                        disabled={Boolean(togglingBlockId || deletingBlockId) || blockSaving}
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

      {blockModalOpen ? createPortal(
        <div className="schedule-block-modal-overlay sparki-dialog-surface" role="presentation" onClick={closeBlockModal}>
          <div
            className="schedule-block-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="schedule-block-modal-heading"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="schedule-block-modal__header">
              <div>
                <span className="eyebrow">Scheduler availability</span>
                <h2 id="schedule-block-modal-heading">
                  {isEditingBlock ? 'Edit schedule block' : 'Add schedule block'}
                </h2>
                <p>
                  Define weekly booking hours in the clinic time zone. This block repeats every week
                  on the selected weekdays.
                </p>
              </div>
              <span
                className="schedule-block-modal__preview"
                style={{ '--schedule-block-preview': draftTemplate.color } as CSSProperties}
              >
                <strong>{draftTemplate.label || 'Block preview'}</strong>
                <small>
                  {selectedDays.map((day) => shortDay(day)).join(', ') || 'Choose days'} · {timeLabel(draftTemplate.startTime)}–
                  {timeLabel(draftTemplate.endTime)}
                </small>
              </span>
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
              <fieldset disabled={blockSaving} className="admin-editor-fields">
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
                {isEditingBlock ? <label>
                  <span>Day</span>
                  <select value={draftTemplate.dayOfWeek} onChange={(event) => {
                    const dayOfWeek = Number(event.target.value);
                    setDraftTemplate((current) => ({ ...current, dayOfWeek }));
                    setSelectedDays([dayOfWeek]);
                  }}>
                    {DAY_LABELS.map((day, index) => <option key={day} value={index}>{day}</option>)}
                  </select>
                </label> : <fieldset className="weekday-picker">
                  <legend>Repeat every week on</legend>
                  <div className="weekday-picker__days">
                    {DAY_LABELS.map((day, index) => <label key={day}>
                      <input type="checkbox" checked={selectedDays.includes(index)} onChange={(event) =>
                        setSelectedDays((current) => event.target.checked ? [...current, index].sort() : current.filter((value) => value !== index))} />
                      {day.slice(0, 3)}
                    </label>)}
                  </div>
                  <div className="weekday-picker__presets">
                    <button type="button" className="button-secondary" onClick={() => setSelectedDays([1,2,3,4,5])}>Weekdays</button>
                    <button type="button" className="button-secondary" onClick={() => setSelectedDays([0,6])}>Weekends</button>
                    <button type="button" className="button-secondary" onClick={() => setSelectedDays([0,1,2,3,4,5,6])}>Every day</button>
                  </div>
                  <p role="status">
                    {selectedDays.length === 0 ? 'Choose at least one weekday.' : `This creates ${selectedDays.length} weekly block${selectedDays.length === 1 ? '' : 's'} — one for ${selectedDays.map(shortDay).join(', ')}. Each weekday appears separately in the list.`}
                  </p>
                </fieldset>}
                <div className="schedule-block-modal__form-row">
                  <label>
                    <span>Start time</span>
                    <input
                      type="time"
                      value={draftTemplate.startTime}
                      onChange={(event) =>
                        setDraftTemplate((current) => ({
                          ...current,
                          startTime: event.target.value,
                        }))
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
                <div className="schedule-block-modal__form-row">
                  <label>
                    <span>Provider (optional)</span>
                    <select
                      value={draftTemplate.staffId ?? ''}
                      onChange={(event) =>
                        setDraftTemplate((current) => ({
                          ...current,
                          staffId: event.target.value || null,
                        }))
                      }
                    >
                      <option value="">Any eligible provider</option>
                      {eligibleProviders.map((provider) => (
                        <option key={provider.id} value={provider.id}>
                          {provider.displayName}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Room (optional)</span>
                    <input
                      value={draftTemplate.room ?? ''}
                      onChange={(event) =>
                        setDraftTemplate((current) => ({ ...current, room: event.target.value }))
                      }
                      placeholder="Room 2"
                    />
                  </label>
                </div>
                <fieldset className="schedule-block-style-picker">
                  <legend>Appointment types allowed in this block</legend>
                  <p>
                    Select appointment types that may be booked in this block. Leave empty to allow
                    types with no specifically assigned blocks.
                  </p>
                  <div className="schedule-block-style-picker__grid">
                    {sortedAppointmentTypes
                      .filter((type) => type.isActive)
                      .map((type) => {
                        const selected = draftTemplate.appointmentTypeIds.includes(type.id);
                        return (
                          <label
                            key={type.id}
                            className={
                              selected
                                ? 'schedule-block-style-picker__option schedule-block-style-picker__option--selected'
                                : 'schedule-block-style-picker__option'
                            }
                          >
                            <input
                              type="checkbox"
                              checked={selected}
                              onChange={(event) =>
                                setDraftTemplate((current) => ({
                                  ...current,
                                  appointmentTypeIds: event.target.checked
                                    ? [...current.appointmentTypeIds, type.id]
                                    : current.appointmentTypeIds.filter((id) => id !== type.id),
                                }))
                              }
                            />
                            <span aria-hidden="true" style={{ backgroundColor: type.color }} />
                            <div>
                              <strong>{type.name}</strong>
                              <small>{selected ? 'Allowed in this block' : 'Not assigned'}</small>
                            </div>
                          </label>
                        );
                      })}
                  </div>
                </fieldset>
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
                        setDraftTemplate((current) => ({
                          ...current,
                          isActive: event.target.checked,
                        }))
                      }
                    />
                    Visible on calendar
                  </label>
                </div>

                {blockFormError ? (
                  <p className="schedule-block-modal__error">{blockFormError}</p>
                ) : null}

                <div className="schedule-block-modal__actions">
                  <button type="submit" className="scheduler-primary-action" disabled={blockSaving}>
                    {blockSaving ? 'Saving...' : 'Save schedule block'}
                  </button>
                  <button type="button" className="button-secondary" onClick={closeBlockModal}>
                    Cancel
                  </button>
                </div>
              </fieldset>
            </form>
          </div>
        </div>
      , document.body) : null}
    </section>
  );
}
