import { Link } from "wouter";
import { Sparkles, PenTool, ArrowRight } from "lucide-react";

export function HeroSection() {
  return (
    <section className="relative min-h-[92vh] flex items-center overflow-hidden">
      {/* Background */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{
          backgroundImage: `url('https://images.unsplash.com/photo-1513475382585-d06e58bcb0e0?auto=format&fit=crop&w=1920&h=1080&q=80')`,
        }}
      />
      {/* Cobalt → Raspberry overlay */}
      <div
        className="absolute inset-0"
        style={{ background: "linear-gradient(135deg, rgba(29,75,166,0.88) 0%, rgba(216,83,101,0.72) 100%)" }}
      />

      <div className="relative w-full max-w-6xl mx-auto px-6 py-24 text-center">
        {/* Tagline pill */}
        <span
          className="inline-block text-xs font-semibold uppercase tracking-widest px-4 py-1.5 rounded-full mb-6"
          style={{ background: "rgba(235,235,211,0.18)", color: "#EBEBD3", border: "1px solid rgba(235,235,211,0.3)" }}
        >
          Beautiful quality, for beautiful moments.
        </span>

        {/* Headline */}
        <h1
          className="text-5xl md:text-7xl font-bold text-white leading-tight mb-5"
          style={{ fontFamily: "var(--font-display)" }}
          data-testid="text-hero-title"
        >
          Create Your Perfect
          <br />
          <span style={{ color: "#EBEBD3" }}>Photo Book</span>
        </h1>

        <p
          className="text-lg md:text-xl text-white/80 mb-14 max-w-xl mx-auto"
          data-testid="text-hero-subtitle"
        >
          Turn your favourite memories into a book you'll treasure forever.
        </p>

        {/* Mode selection cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 max-w-3xl mx-auto">

          {/* ── Auto Generate ── */}
          <Link href="/wizard?mode=auto" data-testid="button-auto-generate">
            <div
              className="group rounded-3xl p-8 text-left cursor-pointer transition-all duration-300 hover:-translate-y-1"
              style={{
                background: "rgba(255,255,255,0.12)",
                backdropFilter: "blur(14px)",
                border: "1.5px solid rgba(255,255,255,0.28)",
              }}
            >
              <div
                className="inline-flex items-center justify-center w-12 h-12 rounded-2xl mb-5"
                style={{ background: "#EBEBD3" }}
              >
                <Sparkles className="w-6 h-6" style={{ color: "#1D4BA6" }} />
              </div>
              <h3
                className="text-white text-xl font-bold mb-2"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Auto Generate
              </h3>
              <p className="text-white/70 text-sm mb-6 leading-relaxed">
                Answer a few questions — we design your entire book, layout and all.
                <span className="block text-white/45 text-xs mt-1">Perfect for first-timers.</span>
              </p>
              <div
                className="inline-flex items-center gap-2 text-sm font-semibold px-5 py-2.5 rounded-full transition-all duration-200 group-hover:gap-3"
                style={{ background: "#1D4BA6", color: "#fff" }}
              >
                Get Started <ArrowRight className="w-4 h-4" />
              </div>
            </div>
          </Link>

          {/* ── Design Your Own ── */}
          <Link href="/create" data-testid="button-create-photobook">
            <div
              className="group rounded-3xl p-8 text-left cursor-pointer transition-all duration-300 hover:-translate-y-1"
              style={{
                background: "rgba(255,255,255,0.07)",
                backdropFilter: "blur(14px)",
                border: "1.5px solid rgba(255,255,255,0.18)",
              }}
            >
              <div
                className="inline-flex items-center justify-center w-12 h-12 rounded-2xl mb-5"
                style={{ background: "rgba(235,235,211,0.18)" }}
              >
                <PenTool className="w-6 h-6 text-white" />
              </div>
              <h3
                className="text-white text-xl font-bold mb-2"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Design Your Own
              </h3>
              <p className="text-white/70 text-sm mb-6 leading-relaxed">
                Place every photo exactly where you want it with our canvas editor.
                <span className="block text-white/45 text-xs mt-1">For creative control seekers.</span>
              </p>
              <div
                className="inline-flex items-center gap-2 text-sm font-semibold px-5 py-2.5 rounded-full transition-all duration-200 group-hover:gap-3"
                style={{ border: "1.5px solid rgba(255,255,255,0.45)", color: "#fff" }}
              >
                Start Creating <ArrowRight className="w-4 h-4" />
              </div>
            </div>
          </Link>
        </div>

        <p className="text-white/35 text-xs mt-8">
          Not sure? Auto Generate is the easiest way — you can always customise later.
        </p>
      </div>
    </section>
  );
}
