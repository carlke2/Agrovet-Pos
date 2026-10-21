import { Minus, Plus } from "lucide-react";

type QuantityStepperProps = {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  label?: string;
};

export default function QuantityStepper({ value, onChange, min = 1, max = 9999, label = "Quantity" }: QuantityStepperProps) {
  const set = (next: number) => {
    if (!Number.isFinite(next)) return;
    onChange(Math.min(max, Math.max(min, Math.round(next))));
  };

  return (
    <div className="inline-flex items-center rounded-control border border-sand bg-surface">
      <button
        type="button"
        aria-label={`Decrease ${label}`}
        className="flex h-12 w-12 items-center justify-center text-primary-800"
        onClick={() => set(value - 1)}
      >
        <Minus size={16} />
      </button>
      <input
        aria-label={label}
        inputMode="numeric"
        className="tabular h-12 w-14 border-x border-sand bg-transparent text-center text-sm font-semibold text-ink outline-none"
        value={value}
        onChange={(event) => {
          const parsed = Number(event.target.value);
          if (event.target.value === "") return;
          set(parsed);
        }}
      />
      <button
        type="button"
        aria-label={`Increase ${label}`}
        className="flex h-12 w-12 items-center justify-center text-primary-800"
        onClick={() => set(value + 1)}
      >
        <Plus size={16} />
      </button>
    </div>
  );
}
