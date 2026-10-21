export interface ChoiceOption<V extends string> {
  value: V;
  label: string;
}

/**
 * Segmented single-choice control for small option sets (Yes/No, Vaginal/
 * Cesarean, Female/Male). `null` value means "not answered yet".
 */
export default function ChoiceGroup<V extends string>({
  options,
  value,
  onChange,
  disabled,
  allowUnset = false,
}: {
  options: ReadonlyArray<ChoiceOption<V>>;
  value: V | null;
  onChange: (next: V | null) => void;
  disabled?: boolean;
  /** Right-click/second-click the active option to clear it back to null. */
  allowUnset?: boolean;
}) {
  return (
    <div
      role="radiogroup"
      className="flex rounded-lg bg-theme-light-gray p-1"
      style={{ maxWidth: options.length * 120 }}
    >
      {options.map((option) => {
        const selected = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() =>
              onChange(allowUnset && selected ? null : (option.value as V))
            }
            className={[
              "flex-1 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors duration-150",
              "focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-theme-maroon",
              "disabled:cursor-not-allowed disabled:opacity-60",
              selected
                ? "bg-white text-theme-ink shadow-sm ring-1 ring-theme-line"
                : "text-theme-gray hover:text-theme-ink",
            ].join(" ")}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
