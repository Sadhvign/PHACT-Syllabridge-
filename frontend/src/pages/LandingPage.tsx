import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CheckCircle2,
  Download,
  FileText,
  GraduationCap,
  Grid2x2,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import HeroCampus from "@/components/landing/HeroCampus";
import HowItWorksTimeline from "@/components/landing/HowItWorksTimeline";
import SchoolMarquee from "@/components/landing/SchoolMarquee";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const FEATURES = [
  {
    title: "Competency Intelligence",
    body: "Heatmaps and gap notes show where objectives align to CEPH and where coverage is thin.",
    icon: Grid2x2,
    tone: "bg-[var(--phact-navy)]",
  },
  {
    title: "Privacy Guardrails",
    body: "Names, emails, and phone numbers are redacted before the model ever sees the syllabus.",
    icon: ShieldCheck,
    tone: "bg-[var(--phact-orange)]",
  },
  {
    title: "Evidence, Clearly Labeled",
    body: "Citations and AI reasoning stay separate so faculty can trust what is grounded.",
    icon: FileText,
    tone: "bg-[var(--phact-navy)]",
  },
  {
    title: "Human Review, Always",
    body: "Edit, approve, or reject with your name and a timestamp on every decision.",
    icon: CheckCircle2,
    tone: "bg-[var(--phact-teal)]",
  },
  {
    title: "Export & Share",
    body: "Export to Word or PDF, or share into the ASPPH community with citations intact.",
    icon: Download,
    tone: "bg-[var(--phact-navy)]",
  },
  {
    title: "Always-On Assistant",
    body: "A short tour and in-product cues help faculty finish a first syllabus in about a minute.",
    icon: Sparkles,
    tone: "bg-gradient-to-br from-[var(--phact-navy)] to-[var(--phact-orange)]",
  },
];

const PARTNERS = [
  {
    id: "ASPPH",
    role: "Partner",
    title: "Association of Schools and Programs of Public Health",
    body: "Curates the knowledge base behind every recommendation and moderates what faculty share.",
  },
  {
    id: "AWS",
    role: "Cloud",
    title: "Amazon Web Services",
    body: "Powers secure infrastructure for analysis jobs, storage, and responsible AI services.",
  },
  {
    id: "CEPH",
    role: "Framework",
    title: "Council on Education for Public Health",
    body: "Competency language your programs already answer to—used for mapping and gap analysis.",
  },
  {
    id: "ARIE",
    role: "Framework",
    title: "AI Readiness in Education",
    body: "Helps shape responsible classroom AI practices for accredited public health programs.",
  },
  {
    id: "CPH",
    role: "Credential",
    title: "Certified in Public Health",
    body: "Signals workforce expectations that course recommendations can prepare graduates for.",
  },
  {
    id: "CHES",
    role: "Credential",
    title: "Certified Health Education Specialist",
    body: "Informs teaching and assessment suggestions for health education pathways.",
  },
  {
    id: "CHW",
    role: "Workforce",
    title: "Community Health Worker pathways",
    body: "Keeps practice-focused courses aligned with community-facing public health roles.",
  },
  {
    id: "Bedrock",
    role: "AI",
    title: "Amazon Bedrock",
    body: "Hosted foundation models used for grounded recommendations with guardrails applied.",
  },
];

const VOICES = [
  {
    quote:
      "PHACT gives faculty a practical way to integrate AI into the classroom without having to build from scratch.",
    name: "Melissa Perry, Sc.D., MHS, MBA",
    role: "Dean, George Mason University College of Public Health",
  },
  {
    quote:
      "Cited recommendations and competency maps help us keep accreditation conversations concrete and faculty-owned.",
    name: "Public Health Program Lead",
    role: "ASPPH member school (demo voice)",
  },
];

export default function LandingPage() {
  const [partnerId, setPartnerId] = useState("ASPPH");
  const [voiceIndex, setVoiceIndex] = useState(0);
  const partner = useMemo(
    () => PARTNERS.find((p) => p.id === partnerId) ?? PARTNERS[0],
    [partnerId],
  );
  const voice = VOICES[voiceIndex];

  useEffect(() => {
    const id = window.setInterval(() => setVoiceIndex((i) => (i + 1) % VOICES.length), 7000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      setPartnerId((current) => {
        const idx = PARTNERS.findIndex((p) => p.id === current);
        return PARTNERS[(idx + 1) % PARTNERS.length].id;
      });
    }, 4200);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="min-h-screen bg-[var(--phact-sky)] text-[var(--phact-ink)]">
      <div className="bg-[var(--phact-teal)] px-4 py-2 text-center text-sm font-medium text-[var(--phact-navy)]">
        AWS Breaking Barriers 2026: PHACT is being built for ASPPH member schools.{" "}
        <a href="#how-it-works" className="font-bold underline underline-offset-2">
          See how it works
        </a>
        .
      </div>

      <header className="sticky top-0 z-30 border-b border-white/10 bg-[var(--phact-navy)]/95 text-white backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
          <a href="#top" className="flex items-center gap-2 font-bold tracking-wide">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-[var(--phact-teal)] text-white">
              <GraduationCap className="h-5 w-5" />
            </span>
            PHACTcheck
          </a>
          <nav className="hidden items-center gap-6 text-sm font-semibold md:flex">
            <a href="#how-it-works" className="hover:text-[var(--phact-teal)]">
              How It Works
            </a>
            <a href="#features" className="hover:text-[var(--phact-teal)]">
              Features
            </a>
            <a href="#partners" className="hover:text-[var(--phact-teal)]">
              Partners
            </a>
            <a href="#resources" className="hover:text-[var(--phact-teal)]">
              Resources
            </a>
          </nav>
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm" className="border-white text-white hover:bg-white/10">
              <Link to="/login">Log in</Link>
            </Button>
            <Button asChild variant="teal" size="sm">
              <Link to="/login">Get started</Link>
            </Button>
          </div>
        </div>
      </header>

      <section id="top" className="bg-[var(--phact-navy)] text-white">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 md:grid-cols-2 md:py-20">
          <motion.div
            className="space-y-5"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          >
            <p className="text-xs font-bold tracking-[0.18em] text-[var(--phact-orange)]">
              FOR PUBLIC HEALTH FACULTY
            </p>
            <h1 className="text-4xl font-extrabold leading-[1.08] tracking-tight md:text-5xl">
              Where Public Health Teaching Meets Responsible AI
            </h1>
            <p className="max-w-xl text-base leading-relaxed text-white/80 md:text-lg">
              PHACTcheck reads your syllabus, suggests where AI fits with cited ASPPH sources, maps
              it to CEPH competencies, and waits for your approval.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button asChild variant="orange" size="lg">
                <Link to="/login">CHECK A SYLLABUS</Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="border-white text-white hover:bg-white/10">
                <a href="#how-it-works">SEE HOW IT WORKS</a>
              </Button>
            </div>
            <p className="text-sm text-white/70">
              Built for 150+ accredited schools and programs and ASPPH&apos;s community of 103,000+
              deans, faculty, staff and students.
            </p>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, delay: 0.12 }}
          >
            <HeroCampus />
          </motion.div>
        </div>
      </section>

      <section className="border-b border-[var(--phact-border)] bg-white py-8">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-4 px-4 text-sm font-semibold text-[var(--phact-muted)] md:gap-8">
          <span className="tracking-[0.16em]">IN PARTNERSHIP WITH</span>
          <div className="flex items-center gap-3 text-[var(--phact-navy)]">
            <span className="grid h-10 w-10 place-items-center rounded-lg bg-[var(--phact-teal)] text-lg font-black text-white">
              A
            </span>
            <span className="text-base font-extrabold tracking-wide">ASPPH</span>
          </div>
        </div>
      </section>

      <SchoolMarquee />

      <HowItWorksTimeline />

      <section id="features" className="bg-[#f7fafb] py-16">
        <div className="mx-auto max-w-6xl px-4">
          <p className="text-center text-xs font-bold tracking-[0.18em] text-[var(--phact-teal)]">FEATURES</p>
          <h2 className="mx-auto mt-2 max-w-3xl text-center text-3xl font-extrabold tracking-tight text-[var(--phact-navy)] md:text-4xl">
            Everything Faculty Need, in One Trusted Place
          </h2>

          <div className="mt-10 grid gap-4 md:grid-cols-3">
            <Card className="md:col-span-2 overflow-hidden border-0 bg-[var(--phact-navy)] text-white shadow-lg">
              <CardContent className="space-y-4 p-6 md:p-8">
                <Badge variant="orange">CORE</Badge>
                <h3 className="text-2xl font-extrabold">Curriculum Transformation Assistant</h3>
                <p className="max-w-2xl text-white/75">
                  Suggestions tied to the exact week, module, or assignment in your syllabus—with
                  assignment previews that show how student work should look.
                </p>
                <div className="rounded-xl bg-white p-4 text-[var(--phact-navy)]">
                  <p className="text-[11px] font-bold tracking-wider text-[var(--phact-muted)]">
                    WEEK 3 · MODULE
                  </p>
                  <p className="mt-1 font-bold">Critique an AI-generated data summary</p>
                  <div className="mt-3 flex items-center justify-between rounded-lg bg-[var(--phact-sky)] px-3 py-2 text-xs font-semibold">
                    <span>[1] ASPPH AI Framework</span>
                    <span>GROUNDED</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {FEATURES.map((feature) => {
              const Icon = feature.icon;
              return (
                <Card key={feature.title} className="transition hover:-translate-y-0.5 hover:shadow-md">
                  <CardHeader>
                    <span className={cn("mb-2 grid h-10 w-10 place-items-center rounded-full text-white", feature.tone)}>
                      <Icon className="h-5 w-5" />
                    </span>
                    <CardTitle>{feature.title}</CardTitle>
                    <CardDescription className="leading-relaxed">{feature.body}</CardDescription>
                  </CardHeader>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      <section id="partners" className="bg-white py-16">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 md:grid-cols-2">
          <div>
            <p className="text-xs font-bold tracking-[0.18em] text-[var(--phact-teal)]">
              PARTNERS &amp; FRAMEWORKS
            </p>
            <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-[var(--phact-navy)] md:text-4xl">
              Built on What Public Health Already Trusts
            </h2>
            <p className="mt-3 max-w-md text-[var(--phact-muted)]">
              PHACT connects ASPPH’s knowledge with the competency frameworks your programs answer
              to. Select any name to see its role.
            </p>
            <Card className="mt-6 shadow-md">
              <CardHeader>
                <CardDescription className="font-bold tracking-wider text-[var(--phact-teal)]">
                  {partner.role.toUpperCase()}
                </CardDescription>
                <CardTitle className="text-xl">{partner.title}</CardTitle>
                <CardDescription className="text-sm leading-relaxed text-[var(--phact-muted)]">
                  {partner.body}
                </CardDescription>
              </CardHeader>
            </Card>
          </div>

          <div className="relative mx-auto aspect-square w-full max-w-md">
            <div className="absolute inset-[18%] rounded-2xl bg-[var(--phact-navy)] shadow-xl" />
            <div className="absolute inset-[18%] grid place-items-center text-white">
              <Building2 className="h-14 w-14" />
            </div>
            <div className="partner-orbit absolute inset-0 rounded-full border border-dashed border-[var(--phact-border)]">
              {PARTNERS.map((p, i) => {
                const angle = (360 / PARTNERS.length) * i;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPartnerId(p.id)}
                    className={cn(
                      "partner-orbit-item absolute left-1/2 top-1/2 rounded-full border px-3 py-1.5 text-xs font-bold shadow-sm transition",
                      partnerId === p.id
                        ? "border-[var(--phact-navy)] bg-[var(--phact-navy)] text-white"
                        : "border-[var(--phact-border)] bg-white text-[var(--phact-navy)] hover:border-[var(--phact-teal)]",
                    )}
                    style={{ ["--orbit-angle" as string]: `${angle}deg` }}
                  >
                    {p.id}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <section className="bg-[var(--phact-teal-deep)] py-16 text-white">
        <div className="mx-auto max-w-6xl px-4">
          <p className="text-xs font-bold tracking-[0.18em] text-[var(--phact-orange)]">VOICES</p>
          <h2 className="mt-2 text-3xl font-extrabold md:text-4xl">What Public Health Leaders Are Saying</h2>
          <div className="mt-8 grid gap-8 lg:grid-cols-[1.4fr_1fr]">
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="icon"
                className="border-white/40 text-white hover:bg-white/10"
                onClick={() => setVoiceIndex((i) => (i - 1 + VOICES.length) % VOICES.length)}
              >
                <ArrowLeft />
              </Button>
              <Card className="flex-1">
                <CardContent className="space-y-4 p-6">
                  <p className="text-4xl font-black text-[var(--phact-orange)]">“</p>
                  <p className="text-lg font-semibold leading-relaxed text-[var(--phact-navy)]">
                    {voice.quote}
                  </p>
                  <div>
                    <p className="font-bold text-[var(--phact-navy)]">{voice.name}</p>
                    <p className="text-sm text-[var(--phact-muted)]">{voice.role}</p>
                  </div>
                </CardContent>
              </Card>
              <Button
                variant="outline"
                size="icon"
                className="border-white/40 text-white hover:bg-white/10"
                onClick={() => setVoiceIndex((i) => (i + 1) % VOICES.length)}
              >
                <ArrowRight />
              </Button>
            </div>
            <div className="space-y-5">
              {[
                { value: "250+", label: "students reached through AI-enhanced curricula", tone: "bg-[var(--phact-orange)]" },
                { value: "10–15", label: "courses adapted", tone: "bg-[var(--phact-teal)]" },
                { value: "5–10", label: "member institutions", tone: "border-2 border-[var(--phact-teal)] bg-white text-[var(--phact-navy)]" },
              ].map((stat) => (
                <div key={stat.label} className="flex items-center gap-4">
                  <div className={cn("grid h-20 w-20 shrink-0 place-items-center rounded-full text-lg font-black", stat.tone)}>
                    {stat.value}
                  </div>
                  <p className="text-sm leading-snug text-white/90">{stat.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="resources" className="bg-white py-16">
        <div className="mx-auto max-w-6xl px-4">
          <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-bold tracking-[0.18em] text-[var(--phact-teal)]">
                INSIGHTS &amp; RESOURCES
              </p>
              <h2 className="mt-2 text-3xl font-extrabold text-[var(--phact-navy)] md:text-4xl">
                The Sources Behind Every Suggestion
              </h2>
            </div>
            <Button asChild variant="outline">
              <Link to="/login">Browse all resources</Link>
            </Button>
          </div>
          <div className="grid gap-4 md:grid-cols-[1.3fr_1fr]">
            <Card className="border-0 bg-[var(--phact-teal)] text-white">
              <CardContent className="space-y-3 p-8">
                <Badge className="bg-white/20 text-white hover:bg-white/20">Featured framework</Badge>
                <h3 className="text-3xl font-extrabold">ASPPH AI Framework</h3>
                <p className="text-white/85">
                  The grounding source behind responsible AI teaching recommendations in PHACT.
                </p>
              </CardContent>
            </Card>
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardDescription className="font-bold tracking-wider text-[var(--phact-teal)]">
                    GUIDE
                  </CardDescription>
                  <CardTitle>CEPH Competency Guidelines →</CardTitle>
                  <CardDescription>Foundational competencies for MPH programs.</CardDescription>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader>
                  <CardDescription className="font-bold tracking-wider text-[var(--phact-teal)]">
                    REPORT
                  </CardDescription>
                  <CardTitle>Public Health Leadership Report →</CardTitle>
                  <CardDescription>ASPPH, 2025</CardDescription>
                </CardHeader>
              </Card>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-[var(--phact-sky)] py-14">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-6 px-4">
          <div>
            <h2 className="text-3xl font-extrabold text-[var(--phact-navy)]">See PHACT in Action</h2>
            <p className="mt-2 max-w-xl text-[var(--phact-muted)]">
              Sign in with the account your school or ASPPH provided and check your first syllabus in
              about a minute.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link to="/login">Get started</Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <a href="#how-it-works">Take the tour</a>
              </Button>
            </div>
          </div>
          <div className="grid h-28 w-28 place-items-center rounded-full bg-[var(--phact-navy)] text-white shadow-lg">
            <GraduationCap className="h-12 w-12" />
          </div>
        </div>
      </section>

      <footer className="bg-[var(--phact-navy)] py-12 text-white">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 md:grid-cols-4">
          <div className="md:col-span-1">
            <p className="text-lg font-extrabold">PHACTcheck</p>
            <p className="mt-2 text-sm text-white/70">
              Public Health AI Curriculum Transformation, built for ASPPH member schools and programs.
            </p>
          </div>
          <div>
            <p className="mb-2 text-xs font-bold tracking-wider text-white/50">PRODUCT</p>
            <div className="space-y-1 text-sm">
              <a href="#how-it-works" className="block hover:text-[var(--phact-teal)]">
                How It Works
              </a>
              <a href="#features" className="block hover:text-[var(--phact-teal)]">
                Features
              </a>
              <a href="#partners" className="block hover:text-[var(--phact-teal)]">
                Partners
              </a>
            </div>
          </div>
          <div>
            <p className="mb-2 text-xs font-bold tracking-wider text-white/50">RESOURCES</p>
            <div className="space-y-1 text-sm">
              <a href="#resources" className="block hover:text-[var(--phact-teal)]">
                ASPPH AI Framework
              </a>
              <a href="#resources" className="block hover:text-[var(--phact-teal)]">
                CEPH Competencies
              </a>
              <a href="#resources" className="block hover:text-[var(--phact-teal)]">
                Workforce Research
              </a>
            </div>
          </div>
          <div>
            <p className="mb-2 text-xs font-bold tracking-wider text-white/50">ACCOUNT</p>
            <div className="space-y-1 text-sm">
              <Link to="/login" className="block hover:text-[var(--phact-teal)]">
                Log In
              </Link>
              <Link to="/login" className="block hover:text-[var(--phact-teal)]">
                Get Started
              </Link>
            </div>
          </div>
        </div>
        <div className="mx-auto mt-10 flex max-w-6xl flex-wrap justify-between gap-2 border-t border-white/15 px-4 pt-4 text-xs text-white/55">
          <span>PHACTcheck — AWS Breaking Barriers 2026</span>
          <span>Demo build — synthetic data only — illustrations are original art</span>
        </div>
      </footer>
    </div>
  );
}
