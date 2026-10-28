"use client";

export function QtySelect({ value, max, disabled }: { value: number; max: number; disabled?: boolean }) {
  const options = Array.from({ length: Math.max(max, value) }, (_, i) => i + 1);
  return (
    <select
        name="quantity"
        aria-label="Quantity"
        defaultValue={value}
        disabled={disabled}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="field !w-auto !rounded-full !py-2 pr-8 text-sm"
      >
        {options.map((n) => (
          <option key={n} value={n} disabled={n > max}>
            {n}
          </option>
        ))}
    </select>
  );
}
