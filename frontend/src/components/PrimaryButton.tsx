export interface PrimaryButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Show a spinner and ignore the action while true. */
  pending?: boolean;
}

export default function PrimaryButton({
  pending = false,
  disabled,
  className,
  children,
  ...props
}: PrimaryButtonProps) {
  const isDisabled = pending || disabled;

  return (
    <button
      type="submit"
      disabled={isDisabled}
      aria-busy={pending}
      className={[
        "flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5",
        "text-sm font-semibold text-theme-white",
        "bg-theme-maroon hover:bg-theme-maroon-hover",
        "transition-colors duration-150",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-theme-maroon",
        "disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-theme-maroon",
        className ?? "",
      ].join(" ")}
      {...props}
    >
      {pending ? (
        <span
          aria-hidden
          className="h-4 w-4 animate-spin rounded-full border-2 border-theme-white/40 border-t-theme-white"
        />
      ) : null}
      {children}
    </button>
  );
}
