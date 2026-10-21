export interface ChipOption<K extends string> {
  key: K;
  label: string;
}

/**
 * Multi-select toggle chips bound to a boolean record. Modern equivalent of
 * the old clinical "toggle chips" groups.
 */
export default function ChipGroup<K extends string>({
  legend,
  options,
  values,
  onChange,
  disabled,
}: {
  legend: string;
  options: ReadonlyArray<ChipOption<K>>;
  values: Readonly<Partial<Record<K, boolean>>>;
  onChange: (next: Record<K, boolean>) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium text-theme-ink">{legend}</legend>
      <div className="flex flex-wrap gap-2.5" role="group">
        {options.map((option) => {
          const active = values[option.key] === true;
          return (
            <button
              key={option.key}
              type="button"
              role="switch"
              aria-checked={active}
              disabled={disabled}
              onClick={() => onChange({ ...values, [option.key]: !active } as Record<K, boolean>)}
              className={[
                "rounded-full border px-4 py-1.5 text-xs font-semibold transition-colors duration-150",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-theme-maroon",
                "disabled:cursor-not-allowed disabled:opacity-60",
                active
                  ? "border-theme-maroon bg-theme-maroon text-theme-white"
                  : "border-theme-line bg-white text-theme-ink-soft hover:border-theme-maroon/40",
              ].join(" ")}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
