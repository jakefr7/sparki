'use client';

import { useId, useState } from 'react';

// AI-drafted starter vocabulary, not a diagnostic recommendation or billing code set.
// Terminology reference: https://www.merckvetmanual.com/
const DIAGNOSES = [
  'Acute kidney injury', 'Allergic dermatitis', 'Anal sac impaction', 'Anemia',
  'Anxiety', 'Atopic dermatitis', 'Bacterial cystitis', 'Brachycephalic airway syndrome',
  'Canine infectious respiratory disease', 'Canine parvovirus infection', 'Cataract',
  'Chronic bronchitis', 'Chronic kidney disease', 'Colitis', 'Conjunctivitis',
  'Congestive heart failure', 'Constipation', 'Corneal ulcer', 'Cranial cruciate ligament disease',
  'Dental fracture', 'Dermatophytosis', 'Diabetes mellitus', 'Dilated cardiomyopathy',
  'Ear mite infestation', 'Epilepsy', 'Feline asthma', 'Feline idiopathic cystitis',
  'Feline immunodeficiency virus infection', 'Feline leukemia virus infection',
  'Feline lower urinary tract disease', 'Feline upper respiratory infection',
  'Flea allergy dermatitis', 'Flea infestation', 'Food allergy', 'Gastric dilatation-volvulus',
  'Gastroenteritis', 'Gastrointestinal foreign body', 'Giardiasis', 'Gingivitis', 'Glaucoma',
  'Heartworm disease', 'Hepatic lipidosis', 'Hip dysplasia', 'Hyperadrenocorticism',
  'Hypertension', 'Hyperthyroidism', 'Hypertrophic cardiomyopathy', 'Hypoadrenocorticism',
  'Hypothyroidism', 'Inflammatory bowel disease', 'Intervertebral disc disease',
  'Intestinal parasitism', 'Laryngeal paralysis', 'Leptospirosis', 'Lipoma', 'Lymphoma',
  'Mast cell tumor', 'Mitral valve disease', 'Obesity', 'Osteoarthritis', 'Otitis externa',
  'Otitis media', 'Pancreatitis', 'Patellar luxation', 'Periodontal disease', 'Pneumonia',
  'Pyoderma', 'Pyometra', 'Tracheal collapse', 'Urinary incontinence', 'Urinary tract infection',
  'Urolithiasis', 'Urethral obstruction', 'Uveitis', 'Wound infection',
].sort();

export function DiagnosisInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const id = useId();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(0);
  const selected = value.split('\n').filter(Boolean);
  const term = query.trim();
  const matches = term ? DIAGNOSES.filter((name) => name.toLowerCase().includes(term.toLowerCase()) && !selected.includes(name)).slice(0, 7) : [];
  const options = term && !selected.some((name) => name.toLowerCase() === term.toLowerCase()) && !matches.some((name) => name.toLowerCase() === term.toLowerCase()) ? [...matches, term] : matches;
  function add(name: string) {
    if ([...selected, name].join('\n').length > 4000) return;
    onChange([...selected, name].join('\n'));
    setQuery(''); setOpen(false); setActive(0);
  }
  function removeAt(index: number) {
    onChange(selected.filter((_, i) => i !== index).join('\n'));
  }
  return <div className="diagnosis-picker">
    <label htmlFor={id}>Diagnoses</label>
    <div className="diagnosis-picker__bar">
      {selected.map((name, index) => <span className="diagnosis-picker__tag" key={`${name}-${index}`}>{name}<button type="button" aria-label={`Remove ${name}`} onClick={() => removeAt(index)}>×</button></span>)}
      <input id={id} role="combobox" aria-autocomplete="list" aria-expanded={open && options.length > 0} aria-controls={`${id}-options`} aria-activedescendant={open && options[active] ? `${id}-${active}` : undefined} autoComplete="off" placeholder={focused ? '' : selected.length ? 'Add another diagnosis' : 'Search or enter a diagnosis'} value={query} maxLength={200} onFocus={() => { setFocused(true); setOpen(true); }} onBlur={() => { setFocused(false); setOpen(false); }} onChange={(e) => { setQuery(e.target.value); setOpen(true); setActive(0); }} onKeyDown={(e) => {
        if (e.nativeEvent.isComposing) return;
        if (e.key === 'Escape') setOpen(false);
        if (e.key === 'Backspace' && !query && selected.length) { e.preventDefault(); removeAt(selected.length - 1); return; }
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); setOpen(true); setActive((i) => Math.max(0, Math.min(options.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))); }
        if (e.key === 'Enter' && term) { e.preventDefault(); if (options[active]) add(options[active]); }
      }} />
    </div>
    {open && options.length > 0 ? <ul id={`${id}-options`} role="listbox" className="diagnosis-picker__options">{options.map((name, index) => {
      const custom = !DIAGNOSES.includes(name);
      return <li key={name} id={`${id}-${index}`} role="option" aria-selected={active === index} className={custom ? 'diagnosis-picker__option--custom' : undefined} onMouseDown={(e) => e.preventDefault()} onClick={() => add(name)}>{custom ? <><span className="diagnosis-picker__option-add">Add</span>“{name}”</> : name}</li>;
    })}</ul> : null}
  </div>;
}
