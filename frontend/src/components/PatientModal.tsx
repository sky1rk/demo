import { useState } from "react";

import ChoiceGroup from "./ChoiceGroup.tsx";
import type { ChoiceOption } from "./ChoiceGroup.tsx";
import FormInput from "./FormInput.tsx";
import Modal from "./Modal.tsx";
import Notice from "./Notice.tsx";
import PrimaryButton from "./PrimaryButton.tsx";
import { guide } from "../lib/authErrors.ts";
import { createPatient } from "../lib/db.ts";
import type { Patient } from "../lib/patient.ts";
import type { Sex } from "../lib/patient.ts";

const SEX_OPTIONS: ReadonlyArray<ChoiceOption<"female" | "male">> = [
  { value: "female", label: "Female" },
  { value: "male", label: "Male" },
];

const MODE_OPTIONS: ReadonlyArray<ChoiceOption<"vaginal" | "cesarean">> = [
  { value: "vaginal", label: "Vaginal" },
  { value: "cesarean", label: "Cesarean" },
];

function withinRange(value: number, min: number, max: number): boolean {
  return Number.isFinite(value) && value >= min && value <= max;
}

/**
 * Register-new-patient dialog, shared by the dashboard wizard (compact set)
 * and the registry's Add Patient (full set with MRN, DOB, delivery mode and
 * notes). Creates a real `patients` row.
 */
export default function PatientModal({
  mode,
  title,
  onClose,
  onCreated,
}: {
  /** compact = minimal wizard fields; full = everything the registry keeps. */
  mode: "compact" | "full";
  title: string;
  onClose: () => void;
  onCreated: (patient: Patient) => void;
}) {
  const full = mode === "full";

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [mrn, setMrn] = useState("");
  const [sex, setSex] = useState<Sex>(null);
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [gestationalAgeWeeks, setGa] = useState("");
  const [birthWeightGrams, setBw] = useState("");
  const [deliveryMode, setDeliveryMode] = useState<"vaginal" | "cesarean" | null>(null);
  const [notes, setNotes] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (firstName.trim() === "" || lastName.trim() === "") {
      setError("Enter at least the patient's first and last name.");
      return;
    }
    const ga = gestationalAgeWeeks.trim();
    const bw = birthWeightGrams.trim();
    if (ga !== "" && !withinRange(Number(ga), 20, 45)) {
      setError("Gestational age must be between 20 and 45 weeks.");
      return;
    }
    if (bw !== "" && !withinRange(Number(bw), 200, 8000)) {
      setError("Birth weight must be between 200 and 8000 grams.");
      return;
    }

    setPending(true);
    try {
      const patient = await createPatient(
        {
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          sex,
          gestationalAgeWeeks: ga === "" ? null : Number(ga),
          birthWeightGrams: bw === "" ? null : Number(bw),
          mrn: full && mrn.trim() !== "" ? mrn.trim() : null,
        },
        full
          ? {
              dateOfBirth: dateOfBirth === "" ? null : dateOfBirth,
              deliveryMode,
              notes: notes.trim() === "" ? null : notes.trim(),
            }
          : {},
      );
      onCreated(patient);
    } catch (createError) {
      console.error("[palse] patient create failed", createError);
      setError(guide(createError, "Could not create the patient. Please try again."));
      setPending(false);
    }
  }

  return (
    <Modal title={title} onClose={onClose}>
      <div className="flex flex-col gap-5">
        {error ? <Notice tone="danger">{error}</Notice> : null}

        <div className="grid gap-5 md:grid-cols-2">
          <FormInput
            id="new-first-name"
            label="First name"
            value={firstName}
            onChange={(event) => setFirstName(event.target.value)}
          />
          <FormInput
            id="new-last-name"
            label="Last name"
            value={lastName}
            onChange={(event) => setLastName(event.target.value)}
          />
        </div>

        {full ? (
          <FormInput
            id="new-mrn"
            label="MRN № (optional)"
            placeholder="e.g. NEO-2024-001"
            value={mrn}
            onChange={(event) => setMrn(event.target.value)}
          />
        ) : null}

        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-theme-ink">Sex</span>
          <ChoiceGroup options={SEX_OPTIONS} value={sex} onChange={setSex} allowUnset />
        </div>

        {full ? (
          <FormInput
            id="new-dob"
            label="Date of birth"
            type="date"
            value={dateOfBirth}
            onChange={(event) => setDateOfBirth(event.target.value)}
          />
        ) : null}

        <div className="grid gap-5 md:grid-cols-2">
          <FormInput
            id="new-ga"
            label="Gestational age (weeks)"
            placeholder="e.g. 38"
            type="number"
            min={20}
            max={45}
            value={gestationalAgeWeeks}
            onChange={(event) => setGa(event.target.value)}
          />
          <FormInput
            id="new-bw"
            label="Birth weight (grams)"
            placeholder="e.g. 3200"
            type="number"
            min={200}
            max={8000}
            value={birthWeightGrams}
            onChange={(event) => setBw(event.target.value)}
          />
        </div>

        {full ? (
          <>
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-theme-ink">Delivery mode</span>
              <ChoiceGroup
                options={MODE_OPTIONS}
                value={deliveryMode}
                onChange={setDeliveryMode}
                allowUnset
              />
            </div>

            <FormInput
              id="new-notes"
              label="Notes (optional)"
              placeholder="Allergies, birth complications, transfer context…"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </>
        ) : null}

        <PrimaryButton pending={pending} onClick={() => void handleSubmit()}>
          Create patient
        </PrimaryButton>
      </div>
    </Modal>
  );
}
