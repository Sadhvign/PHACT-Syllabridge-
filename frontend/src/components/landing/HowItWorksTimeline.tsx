import { ArrowLeft, ArrowRight } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const STEPS = [
  {
    id: "01",
    label: "Upload",
    title: "Upload your syllabus",
    what: "Drop in a syllabus PDF or paste the text. PHACT shows exactly what the AI read.",
    why: "Ideas built on your real weeks and assignments fit your course, instead of generic AI suggestions.",
  },
  {
    id: "02",
    label: "Recommend",
    title: "Get grounded recommendations",
    what: "Receive cited AI-integration recommendations matched to grade level, focus, and term.",
    why: "Faculty stay in control: every suggestion is grounded in ASPPH sources you can check.",
  },
  {
    id: "03",
    label: "Map",
    title: "Map competencies",
    what: "Map learning objectives to CEPH competencies and workforce expectations.",
    why: "See coverage strengths and gaps before you change a single assignment.",
  },
  {
    id: "04",
    label: "Approve",
    title: "Review and approve",
    what: "Edit, reject with feedback, or approve. Nothing exports until you say so.",
    why: "A clear refine-until-accept loop keeps quality high and ownership with faculty.",
  },
];

const FILL_MS = 4800;

function BottleFill({ progress }: { progress: number }) {
  const clamped = Math.max(0, Math.min(100, progress));
  return (
    <div className="bottle" aria-hidden="true">
      <div className="bottle-neck" />
      <div className="bottle-body">
        <div className="bottle-liquid" style={{ height: `${clamped}%` }} />
        <div className="bottle-shine" />
        <span className="bottle-percent">{Math.round(clamped)}%</span>
      </div>
      <div className="bottle-base" />
    </div>
  );
}

export default function HowItWorksTimeline() {
  const [stepIndex, setStepIndex] = useState(0);
  const [fill, setFill] = useState(0);
  const step = STEPS[stepIndex];

  useEffect(() => {
    setFill(0);
    const started = performance.now();
    let frame = 0;
    let advanceTimer = 0;
    let cancelled = false;
    const tick = (now: number) => {
      if (cancelled) return;
      const t = Math.min(1, (now - started) / FILL_MS);
      // Ease like liquid filling a bottle.
      const eased = 1 - Math.pow(1 - t, 2.4);
      setFill(eased * 100);
      if (t < 1) {
        frame = requestAnimationFrame(tick);
      } else {
        advanceTimer = window.setTimeout(() => {
          setStepIndex((i) => (i + 1) % STEPS.length);
        }, 420);
      }
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      window.clearTimeout(advanceTimer);
    };
  }, [stepIndex]);

  function go(next: number) {
    setStepIndex((next + STEPS.length) % STEPS.length);
  }

  return (
    <section id="how-it-works" className="bg-white py-16">
      <div className="mx-auto max-w-6xl px-4">
        <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-bold tracking-[0.18em] text-[var(--phact-orange)]">HOW IT WORKS</p>
            <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-[var(--phact-navy)] md:text-4xl">
              Four Steps From Syllabus to AI-Ready Course
            </h2>
            <p className="mt-2 max-w-2xl text-[var(--phact-muted)]">
              Watch each step fill completely—like a bottle—then the timeline advances cleanly to the
              next point.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="icon" aria-label="Previous step" onClick={() => go(stepIndex - 1)}>
              <ArrowLeft />
            </Button>
            <Button variant="outline" size="icon" aria-label="Next step" onClick={() => go(stepIndex + 1)}>
              <ArrowRight />
            </Button>
          </div>
        </div>

        <div className="grid gap-10 lg:grid-cols-[220px_1fr]">
          <div className="flex flex-col items-center gap-4">
            <BottleFill progress={fill} />
            <p className="text-center text-sm font-semibold text-[var(--phact-navy)]">
              Filling step {step.id}: {step.label}
            </p>
          </div>

          <div className="relative">
            <div className="absolute bottom-3 left-[15px] top-3 w-px bg-[var(--phact-border)]" aria-hidden="true" />
            <ol className="space-y-5">
              {STEPS.map((s, i) => {
                const active = i === stepIndex;
                const done = i < stepIndex || (active && fill >= 99.5);
                return (
                  <li key={s.id} className="relative pl-12">
                    <button
                      type="button"
                      onClick={() => go(i)}
                      className={cn(
                        "absolute left-0 top-1 grid h-8 w-8 place-items-center rounded-full border-2 text-xs font-black transition-all",
                        active
                          ? "border-[var(--phact-orange)] bg-[var(--phact-orange)] text-white scale-110"
                          : done
                            ? "border-[var(--phact-teal)] bg-[var(--phact-teal)] text-white"
                            : "border-[var(--phact-border)] bg-white text-[var(--phact-muted)]",
                      )}
                      aria-current={active ? "step" : undefined}
                    >
                      {s.id}
                    </button>

                    <div
                      className={cn(
                        "rounded-2xl border transition-all duration-500",
                        active
                          ? "border-[var(--phact-navy)] bg-white shadow-md opacity-100 translate-y-0"
                          : "border-transparent bg-[#f7fafb] opacity-55",
                      )}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--phact-border)] px-5 py-3">
                        <div>
                          <p className="text-xs font-bold tracking-wider text-[var(--phact-muted)]">
                            STEP {s.id}
                          </p>
                          <h3 className="text-lg font-extrabold text-[var(--phact-navy)]">{s.title}</h3>
                        </div>
                        {active && (
                          <div className="h-2 w-36 overflow-hidden rounded-full bg-[var(--phact-sky)]">
                            <div
                              className="h-full rounded-full bg-[var(--phact-teal)] transition-[width] duration-75"
                              style={{ width: `${fill}%` }}
                            />
                          </div>
                        )}
                      </div>

                      {active && (
                        <div className="grid gap-3 p-5 md:grid-cols-2 animate-fade-up">
                          <Card className="border-t-4 border-t-[#4f7cac] shadow-none">
                            <CardHeader className="p-4">
                              <CardDescription className="font-bold tracking-wider">WHAT IT DOES</CardDescription>
                              <CardTitle className="text-base font-semibold leading-relaxed">
                                {s.what}
                              </CardTitle>
                            </CardHeader>
                          </Card>
                          <Card className="border-t-4 border-t-[var(--phact-orange)] bg-[#fff7ef] shadow-none">
                            <CardHeader className="p-4">
                              <CardDescription className="font-bold tracking-wider">WHY IT MATTERS</CardDescription>
                              <CardTitle className="text-base font-semibold leading-relaxed">
                                {s.why}
                              </CardTitle>
                            </CardHeader>
                          </Card>
                        </div>
                      )}

                      {!active && (
                        <p className="px-5 py-3 text-sm text-[var(--phact-muted)]">{s.what}</p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        </div>
      </div>
    </section>
  );
}
