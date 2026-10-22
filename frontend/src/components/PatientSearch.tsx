import { useMemo, useState } from "react";
import type { KeyboardEvent, MouseEvent } from "react";

import RiskBadge from "./RiskBadge.tsx";
import { formatPatientName } from "../lib/patient.ts";
import type { Patient } from "../lib/patient.ts";

/**
 * Registry search for wizard step 1: type-ahead over name/MRN with a
 * suggestions list below the input (ARIA combobox pattern). Selecting a
 * suggestion behaves exactly like picking from the former native dropdown —
 * including the "＋ New" quick-create companion button.
 *
 * Keyboard: ↑/↓ move the highlight, Enter picks it, Escape closes and
 * restores either the current selection or an empty field.
 */
export default function PatientSearch({
  patients,
  selected,
  disabled,
  onSelect,
  onQuickCreate,
}: {
  patients: Patient[] | null;
  selected: Patient | null;
  disabled?: boolean;
  onSelect: (id: string) => void;
  onQuickCreate: () => void;
}) {
  const [draftInput, setDraftInput] = useState(false);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);

  const listboxId = "patient-search-options";

  const suggestions = useMemo(() => {
    const pool = patients ?? [];
    const needle = query.trim().toLowerCase();
    const matches =
      needle === ""
        ? pool
        : pool.filter(
            (patient) =>
              `${patient.firstName} ${patient.lastName}`
                .toLowerCase()
                .includes(needle) || (patient.mrn ?? "").toLowerCase().includes(needle),
          );
    return matches.slice(0, 8);
  }, [patients, query]);

  function displayValue(patient: Patient | null): string {
    if (patient == null) return "";
    const mrn = patient.mrn ? ` — MRN ${patient.mrn}` : "";
    return `${formatPatientName(patient)}${mrn}`;
  }

  function close() {
    setOpen(false);
    setDraftInput(false);
    setQuery("");
    setHighlight(0);
  }

  function choose(patient: Patient) {
    close();
    onSelect(patient.id);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!open) {
      if (event.key === "ArrowDown" || event.key === "Enter") {
        setOpen(true);
        setHighlight(0);
        event.preventDefault();
      }
      return;
    }
    if (event.key === "ArrowDown") {
      setHighlight((index) => Math.min(index + 1, Math.max(suggestions.length - 1, 0)));
      event.preventDefault();
    } else if (event.key === "ArrowUp") {
      setHighlight((index) => Math.max(index - 1, 0));
      event.preventDefault();
    } else if (event.key === "Escape") {
      close();
      event.stopPropagation();
    } else if (event.key === "Enter") {
      const choice = suggestions[highlight];
      if (choice != null) choose(choice);
      event.preventDefault();
    }
  }

  // prevent the input's blur from firing before the click lands
  function optionMouseDown(event: MouseEvent) {
    event.preventDefault();
  }

  function onBlur(event: React.FocusEvent<HTMLDivElement>) {
    const next = event.relatedTarget as Node | null;
    if (next != null && event.currentTarget.contains(next)) return;
    close();
  }

  return (
    <div className="flex gap-2.5" onBlur={onBlur}>
      <div className="relative flex-1">
        <input
          id="patient"
          role="combobox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-activedescendant={
            open && suggestions[highlight] != null
              ? `${listboxId}-${suggestions[highlight].id}`
              : undefined
          }
          aria-describedby={
            patients != null && patients.length === 0 ? "empty-registry-hint" : undefined
          }
          autoComplete="off"
          disabled={disabled}
          value={draftInput ? query : displayValue(selected)}
          onChange={(event) => {
            if (!draftInput) setDraftInput(true);
            setQuery(event.target.value);
            setOpen(true);
            setHighlight(0);
          }}
          onFocus={() => {
            setOpen(true);
            setHighlight(0);
          }}
          onKeyDown={onKeyDown}
          placeholder={disabled ? "Loading registry…" : "Search patients by name or MRN…"}
          className="w-full rounded-lg border border-theme-line bg-white px-3.5 py-2 text-sm text-theme-ink transition-colors placeholder:text-theme-gray focus:border-theme-maroon focus:outline-none focus:ring-2 focus:ring-theme-maroon/25 disabled:opacity-60"
        />

        {open ? (
          <ul
            id={listboxId}
            role="listbox"
            aria-label="Patients"
            className="absolute inset-x-0 top-full z-20 mt-1 max-h-72 overflow-y-auto rounded-lg border border-theme-line bg-white py-1 shadow-lg"
          >
            {suggestions.map((patient, index) => (
              <li
                key={patient.id}
                id={`${listboxId}-${patient.id}`}
                role="option"
                aria-selected={selected?.id === patient.id}
                onMouseDown={optionMouseDown}
                onMouseEnter={() => setHighlight(index)}
                onClick={() => choose(patient)}
                className={`flex cursor-pointer items-center justify-between gap-3 px-3.5 py-2 ${
                  index === highlight ? "bg-theme-light-gray" : ""
                }`}
              >
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-semibold text-theme-ink">
                    {formatPatientName(patient)}
                  </span>
                  <span className="text-xs text-theme-gray">
                    {patient.mrn ? `MRN ${patient.mrn}` : "No MRN"}
                  </span>
                </span>
                <RiskBadge level={patient.riskLevel} />
              </li>
            ))}
            {suggestions.length === 0 ? (
              <li aria-disabled className="px-3.5 py-2 text-sm text-theme-gray">
                No patient matches “{query.trim()}” — use ＋ New to register
                them.
              </li>
            ) : null}
          </ul>
        ) : null}
      </div>

      <button
        type="button"
        tabIndex={-1}
        onMouseDown={optionMouseDown}
        onClick={onQuickCreate}
        className="shrink-0 rounded-lg border border-theme-maroon px-3.5 py-2 text-sm font-semibold text-theme-maroon transition-colors hover:bg-theme-maroon/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-theme-maroon"
      >
        ＋ New
      </button>
    </div>
  );
}
