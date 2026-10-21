export default function PasswordEye({
  visible,
  onToggle,
}: {
  visible: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={visible ? "Hide password" : "Show password"}
      className="rounded-md px-1.5 py-1 text-xs font-semibold uppercase text-theme-gray transition-colors hover:text-theme-ink focus-visible:outline-2 focus-visible:outline-theme-maroon"
    >
      {visible ? "Hide" : "Show"}
    </button>
  );
}
