export default function BrandMasthead({
  compact = false,
}: {
  compact?: boolean;
}) {
  return (
    <div className="flex items-center gap-4 z-10">
      <img
        src="/images/logo.png"
        alt="PAL.SE logo"
        className={compact ? "h-10 w-10" : "h-12 w-12"}
      />
      <img
        src="/images/name.png"
        alt="PAL.SE"
        className={compact ? "h-16 w-auto" : "h-24 w-auto"}
      />
    </div>
  );
}
