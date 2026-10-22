import type { ReactNode } from "react";

interface FormInputProps {
  id: string;
  label: string;
  /** Required field: bold asterisk after the label + aria-required. */
  required?: boolean;
  /** Optional supporting copy placed under the input. */
  hint?: string;
  /** Extra classes controlling hint visibility (e.g. height media queries). */
  hintClass?: string;
  /** Inline validation error; renders in red and marks the input invalid. */
  error?: string | null;
  /** Optional trailing element (e.g. password show/hide button). */
  trailing?: ReactNode;
  /** Additional text for screen readers describing the field. */
  describedBy?: string;
}

const baseFieldClasses = [
  "w-full rounded-lg border bg-white px-3.5 py-2 text-sm",
  "placeholder:text-theme-placeholder",
  "transition-colors duration-150",
  "focus:outline-none focus:ring-2 focus:ring-offset-0",
].join(" ");

const validFieldClasses = [
  "border-theme-line",
  "text-theme-ink",
  "focus:border-theme-maroon focus:ring-theme-maroon/25",
].join(" ");

const invalidFieldClasses = [
  "border-risk-high-fg text-theme-ink",
  "focus:border-risk-high-fg focus:ring-risk-high-fg/25",
].join(" ");

export default function FormInput({
  id,
  label,
  required,
  hint,
  hintClass,
  error,
  trailing,
  describedBy,
  className,
  ...props
}: FormInputProps & React.InputHTMLAttributes<HTMLInputElement>) {
  const hintId = describedBy ?? `${id}-hint`;
  const validMessageId = `${id}-error`;

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-theme-ink">
        {label}
        {required ? (
          <span
            aria-hidden
            className="ml-1 font-bold text-theme-maroon"
            title="Required"
          >
            *
          </span>
        ) : null}
      </label>
      <div className="relative">
        <input
          id={id}
          required={required}
          aria-required={required || undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={
            [error ? validMessageId : null, (hint || describedBy) ? hintId : null]
              .filter(Boolean)
              .join(" ") || undefined
          }
          className={[
            baseFieldClasses,
            error ? invalidFieldClasses : validFieldClasses,
            props.type === "password" || trailing ? "pr-11" : "",
            className ?? "",
          ].join(" ")}
          {...props}
        />
        {trailing ? (
          <div className="absolute inset-y-0 right-0 flex items-center pr-2 text-theme-gray">
            {trailing}
          </div>
        ) : null}
      </div>
      {error ? (
        <p id={validMessageId} className="text-xs font-medium text-risk-high-fg">
          {error}
        </p>
      ) : null}
      {hint && !error ? (
        <p id={hintId} className={`text-xs text-theme-gray ${hintClass ?? ""}`}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}
