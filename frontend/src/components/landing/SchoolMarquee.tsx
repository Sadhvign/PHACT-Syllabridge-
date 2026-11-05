import { Building2 } from "lucide-react";

const ROW_A = [
  "UC Berkeley Public Health",
  "Boston University SPH",
  "Yale School of Public Health",
  "Johns Hopkins — Bloomberg",
  "NYU School of Global Public Health",
  "Brown School of Public Health",
  "Tulane SPHTM",
  "UTHealth Houston",
];

const ROW_B = [
  "Columbia Mailman",
  "Emory Rollins",
  "UNC Gillings",
  "George Mason University",
  "Harvard Chan",
  "Michigan SPH",
  "UW School of Public Health",
  "Drexel Dornsife",
];

function MarqueeRow({
  items,
  reverse = false,
  duration = "38s",
}: {
  items: string[];
  reverse?: boolean;
  duration?: string;
}) {
  const loop = [...items, ...items];
  return (
    <div className="schools-fade overflow-hidden">
      <div
        className={reverse ? "animate-marquee-reverse flex w-max gap-3" : "animate-marquee flex w-max gap-3"}
        style={{ animationDuration: duration }}
      >
        {loop.map((name, i) => (
          <span
            key={`${name}-${i}`}
            className="inline-flex items-center gap-2 rounded-xl border border-[var(--phact-border)] bg-white px-4 py-3 text-sm font-semibold text-[var(--phact-navy)] shadow-sm"
          >
            <Building2 className="h-4 w-4 shrink-0 text-[var(--phact-teal)]" />
            {name}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function SchoolMarquee() {
  return (
    <section className="overflow-hidden bg-[#f7fafb] py-12">
      <p className="mb-6 text-center text-[11px] font-bold tracking-[0.16em] text-[var(--phact-navy)]">
        DESIGNED FOR ASPPH MEMBER SCHOOLS AND PROGRAMS, INCLUDING
      </p>
      <div className="space-y-3">
        <MarqueeRow items={ROW_A} duration="42s" />
        <MarqueeRow items={ROW_B} reverse duration="48s" />
      </div>
    </section>
  );
}
