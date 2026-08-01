interface Props {
  currentStep: number;
  totalSteps: number;
  labels: string[];
}

export function StepProgress({ currentStep, totalSteps, labels }: Props) {
  return (
    <div className="w-full">
      {/* Mobile: "Step X of N — Label" */}
      <div className="flex items-center justify-between mb-2 md:hidden">
        <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: "#1D4BA6" }}>
          Step {currentStep} of {totalSteps}
        </span>
        <span className="text-xs font-medium" style={{ color: "#3C3C3B" }}>
          {labels[currentStep - 1]}
        </span>
      </div>

      {/* Track */}
      <div className="flex items-center gap-0 w-full">
        {labels.map((label, i) => {
          const step = i + 1;
          const done    = step < currentStep;
          const active  = step === currentStep;
          const pending = step > currentStep;

          return (
            <div key={step} className="flex items-center flex-1">
              {/* Connector before */}
              {i > 0 && (
                <div
                  className="flex-1 h-0.5 transition-all duration-400"
                  style={{ background: done || active ? "#1D4BA6" : "#d8d5c5" }}
                />
              )}

              {/* Dot + label */}
              <div className="flex flex-col items-center gap-1.5 shrink-0">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300"
                  style={{
                    background: done ? "#1D4BA6" : active ? "#1D4BA6" : "#EBEBD3",
                    color:      done ? "#fff"    : active ? "#fff"    : "#9b9b97",
                    border:     pending ? "2px solid #d8d5c5" : "none",
                    boxShadow:  active ? "0 0 0 4px rgba(29,75,166,0.15)" : "none",
                  }}
                >
                  {done ? (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : step}
                </div>
                <span
                  className="hidden md:block text-xs font-medium whitespace-nowrap"
                  style={{ color: active ? "#1D4BA6" : done ? "#3C3C3B" : "#9b9b97" }}
                >
                  {label}
                </span>
              </div>

              {/* Connector after (last item) */}
              {i < labels.length - 1 && (
                <div
                  className="flex-1 h-0.5 transition-all duration-400"
                  style={{ background: done ? "#1D4BA6" : "#d8d5c5" }}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
