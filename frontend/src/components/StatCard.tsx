interface StatCardProps {
  label: string;
  content: string;
}

export default function StatCard({ label, content }: StatCardProps) {
  return (
    <div className="flex-1 bg-theme-white/10 px-6 py-4 rounded-b-xl border-t-theme-light-gray border-t-4 border-solid">
      <h1 className="text-xl font-bold">{label}</h1>
      <p className="text-sm text-theme-light-gray">{content}</p>
    </div>
  );
}
