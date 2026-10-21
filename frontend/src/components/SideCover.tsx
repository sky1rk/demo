import BrandMastHead from "../components/BrandMastHead.tsx";
import StatCard from "../components/StatCard.tsx";

export default function SideHero() {
  return (
    <div className="flex-1 bg-theme-maroon text-theme-white">
      <div className="flex relative flex-col justify-between h-full px-10 pt-8 pb-16 overflow-clip">
        <div
          className="bg-transparent absolute h-400 w-400 bottom--2 right--2"
          style={{
            background:
              "radial-gradient(circle,rgba(251, 79, 79, 0.4) 0%, rgba(0, 0, 0, 0) 50%)",
          }}
        />
        <img
          className="absolute bottom-80 right-[-8em] h-100 z-20 rotate-[-18deg]"
          src="/images/rob1.png"
        />
        <BrandMastHead compact={false} />
        <div className="flex flex-col bg-theme-white/5 px-12 pt-12 pb-8 rounded-xl gap-6 z-10">
          <h1 className="text-6xl font-bold">
            Early-Onset Neonatal Sepsis Prediction
          </h1>
          <p className="text-theme-light-gray">
            Clinical Decision Support System powered by machine learning to
            identify high-risk neonates and recommended timely interventions.
          </p>
          <div className="flex gap-4 justify-between mt-4">
            <StatCard label="24hrs" content="Monitor first hours of life" />
            <StatCard label="15+" content="Clinical variables for accuracy" />
            <StatCard label="Unlimited" content="Assessments" />
          </div>
        </div>
      </div>
    </div>
  );
}
