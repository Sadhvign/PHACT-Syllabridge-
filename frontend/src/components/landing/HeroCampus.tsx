/** Decorative campus panel matching the PHACTcheck hero illustration style. */
export default function HeroCampus() {
  return (
    <div className="hero-campus relative overflow-hidden rounded-2xl border border-white/10 shadow-2xl">
      <svg viewBox="0 0 640 480" className="h-full w-full" role="img" aria-label="Campus illustration">
        <defs>
          <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#7ec8e3" />
            <stop offset="100%" stopColor="#d9eef7" />
          </linearGradient>
          <linearGradient id="water" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#3a8fb7" />
            <stop offset="100%" stopColor="#5eb3d1" />
          </linearGradient>
        </defs>
        <rect width="640" height="480" fill="url(#sky)" />
        <circle cx="520" cy="78" r="42" fill="#f6d56a" />
        <circle cx="120" cy="70" r="10" fill="#fff" opacity="0.85" />
        <circle cx="145" cy="62" r="14" fill="#fff" opacity="0.75" />
        <circle cx="170" cy="72" r="11" fill="#fff" opacity="0.8" />
        <path d="M40 320 C120 280, 220 340, 320 300 C400 270, 480 320, 600 290 L600 480 L40 480 Z" fill="#8fbf7a" />
        <path d="M0 360 C80 340, 160 380, 260 350 C360 320, 460 370, 640 340 L640 480 L0 480 Z" fill="#6fa86a" />
        <ellipse cx="320" cy="390" rx="220" ry="36" fill="url(#water)" opacity="0.9" />
        <rect x="210" y="330" width="220" height="18" rx="4" fill="#c4a574" />
        <rect x="210" y="348" width="220" height="8" fill="#a88855" />
        {/* Left building */}
        <rect x="70" y="190" width="150" height="150" fill="#f2e6d0" stroke="#d9c4a0" />
        <polygon points="70,190 145,140 220,190" fill="#d98b63" />
        <rect x="95" y="220" width="28" height="40" fill="#5aa0c4" />
        <rect x="140" y="220" width="28" height="40" fill="#5aa0c4" />
        <rect x="185" y="220" width="20" height="40" fill="#5aa0c4" />
        <rect x="125" y="280" width="40" height="60" fill="#8b5a3c" />
        {/* Domed building */}
        <rect x="400" y="200" width="160" height="140" fill="#efe2cc" stroke="#d9c4a0" />
        <path d="M420 200 Q480 120 540 200" fill="#d98b63" />
        <rect x="460" y="150" width="40" height="50" fill="#c97a55" />
        <circle cx="480" cy="145" r="28" fill="#e8b089" />
        <rect x="430" y="230" width="28" height="36" fill="#5aa0c4" />
        <rect x="475" y="230" width="28" height="36" fill="#5aa0c4" />
        <rect x="520" y="230" width="20" height="36" fill="#5aa0c4" />
        <rect x="465" y="290" width="36" height="50" fill="#8b5a3c" />
        {/* Graduate */}
        <circle cx="320" cy="300" r="14" fill="#f0c7a0" />
        <rect x="308" y="312" width="24" height="34" rx="4" fill="#1f3a56" />
        <rect x="300" y="292" width="40" height="10" fill="#1f3a56" />
        <rect x="332" y="286" width="18" height="4" fill="#f15a24" />
        <line x1="344" y1="288" x2="358" y2="270" stroke="#f15a24" strokeWidth="3" strokeLinecap="round" />
        <circle cx="360" cy="268" r="4" fill="#f15a24" />
      </svg>
    </div>
  );
}
