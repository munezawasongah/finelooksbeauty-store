/** Lightweight server-rendered bar chart (no client JS). */
export function BarChart({ data, format }: { data: { label: string; value: number }[]; format: (v: number) => string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const w = 720;
  const h = 200;
  const pad = 24;
  const bw = (w - pad * 2) / data.length;
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <figure>
      <svg viewBox={`0 0 ${w} ${h + 28}`} className="h-auto w-full" role="img" aria-label={`Sales by day, total ${format(total)}`}>
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <line key={f} x1={pad} x2={w - pad} y1={h - h * f * 0.9} y2={h - h * f * 0.9} stroke="#ece6f8" strokeWidth="1" />
        ))}
        {data.map((d, i) => {
          const bh = (d.value / max) * h * 0.9;
          const x = pad + i * bw + bw * 0.18;
          return (
            <g key={i}>
              <rect x={x} y={h - bh} width={bw * 0.64} height={Math.max(bh, d.value ? 2 : 0)} rx="3" fill={i === data.length - 1 ? "#b84af6" : "#5238de"}>
                <title>{`${d.label}: ${format(d.value)}`}</title>
              </rect>
              {((i % Math.ceil(data.length / 8) === 0 && data.length - 1 - i >= Math.ceil(data.length / 8) / 2) || i === data.length - 1) && (
                <text x={x + bw * 0.32} y={h + 18} textAnchor="middle" fontSize="11" fill="#6b6280">
                  {d.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <figcaption className="sr-only">
        {data.map((d) => `${d.label} ${format(d.value)}`).join(", ")}
      </figcaption>
    </figure>
  );
}
