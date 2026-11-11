import { motion, useInView, useReducedMotion } from "motion/react";
import { useEffect, useRef, type ReactNode } from "react";

/** Fades and lifts content into place the first time it scrolls into view. */
export function Reveal({ children, delay = 0, y = 18, className, as = "div" }: { children: ReactNode; delay?: number; y?: number; className?: string; as?: "div" | "li" | "section" }) {
  const reduce = useReducedMotion();
  const Comp = motion[as];
  return (
    <Comp
      className={className}
      initial={reduce ? false : { opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "0px 0px -12% 0px" }}
      transition={{ duration: 0.7, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </Comp>
  );
}

/** Splits a heading into words that rise in sequence. Screen readers get the plain text. */
export function SplitWords({ text, className, delay = 0 }: { text: string; className?: string; delay?: number }) {
  const reduce = useReducedMotion();
  const words = text.split(" ");
  return (
    <span className={className} aria-label={text}>
      {words.map((w, i) => (
        <span key={i} aria-hidden="true" style={{ display: "inline-block", overflow: "hidden", verticalAlign: "top", paddingBottom: "0.08em" }}>
          <motion.span
            style={{ display: "inline-block" }}
            initial={reduce ? false : { y: "105%" }}
            animate={{ y: 0 }}
            transition={{ duration: 0.85, delay: delay + i * 0.06, ease: [0.22, 1, 0.36, 1] }}
          >
            {w}
            {i < words.length - 1 ? " " : ""}
          </motion.span>
        </span>
      ))}
    </span>
  );
}

/**
 * A field of slow, overlapping sine waves drawn as SVG paths. It pauses when
 * offscreen and stays still for reduced motion. Each line stands for an
 * account signal passing through, a quiet nod to ownership moving.
 */
export function WaveField({ lines = 9, height = 260, className, tone = "ink" }: { lines?: number; height?: number; className?: string; tone?: "ink" | "paper" }) {
  const ref = useRef<SVGSVGElement>(null);
  const inView = useInView(ref, { margin: "100px" });
  const reduce = useReducedMotion();

  useEffect(() => {
    const svg = ref.current;
    if (!svg) return;
    const paths = Array.from(svg.querySelectorAll("path"));
    const W = 1200;
    const step = 24;
    let raf = 0;
    let t = 0;
    const draw = () => {
      paths.forEach((p, i) => {
        const amp = 14 + i * 3.2;
        const freq = 0.0042 + i * 0.00035;
        const phase = t * (0.35 + i * 0.045) + i * 0.9;
        const base = height * 0.28 + i * (height * 0.55 / lines);
        let d = `M 0 ${base}`;
        for (let x = 0; x <= W; x += step) {
          const y = base + Math.sin(x * freq + phase) * amp + Math.sin(x * freq * 2.3 - phase * 0.7) * amp * 0.35;
          d += ` L ${x} ${y.toFixed(1)}`;
        }
        p.setAttribute("d", d);
      });
    };
    draw();
    if (reduce || !inView) return;
    let last = performance.now();
    const loop = (now: number) => {
      t += Math.min(0.05, (now - last) / 1000);
      last = now;
      draw();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [inView, reduce, lines, height]);

  return (
    <svg ref={ref} className={`wave-field wave-${tone} ${className ?? ""}`} viewBox={`0 0 1200 ${height}`} preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={`wf-${tone}`} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="currentColor" stopOpacity="0" />
          <stop offset="0.25" stopColor="currentColor" stopOpacity="1" />
          <stop offset="0.75" stopColor="currentColor" stopOpacity="1" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      {Array.from({ length: lines }, (_, i) => (
        <path key={i} fill="none" stroke={`url(#wf-${tone})`} strokeWidth={i === Math.floor(lines / 2) ? 1.6 : 1} opacity={i === Math.floor(lines / 2) ? 0.9 : 0.22 + (i / lines) * 0.25} className={i === Math.floor(lines / 2) ? "wave-hero-line" : undefined} />
      ))}
    </svg>
  );
}

/** A soft wave edge for the top of a section that slides over the previous one. */
export function WaveEdge({ color }: { color: string }) {
  return (
    <svg className="wave-edge" viewBox="0 0 1440 60" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <path d="M0 60V28C180 6 360 0 540 14s360 40 540 30 270-34 360-36v60z" fill={color} />
    </svg>
  );
}

/** Spotlight that follows the cursor inside a container (writes --sx/--sy). */
export function useSpotlight<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      el.style.setProperty("--sx", `${e.clientX - r.left}px`);
      el.style.setProperty("--sy", `${e.clientY - r.top}px`);
    };
    el.addEventListener("pointermove", move);
    return () => el.removeEventListener("pointermove", move);
  }, []);
  return ref;
}
