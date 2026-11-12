import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from "motion/react";
import type { PointerEvent } from "react";
import type { Membership } from "../api";
import { formatNs } from "../api";
import { KitMark } from "../icons";

/**
 * A membership rendered as a physical pass. It tilts toward the cursor and
 * catches light. When `m` is given it shows that account's real on-chain
 * state; otherwise it shows a labelled placeholder (never invented data).
 */
export function MembershipPass({ m, loading, label = "Live from testnet", interactive = true }: { m: Membership | null; loading?: boolean; label?: string; interactive?: boolean }) {
  const reduce = useReducedMotion();
  const px = useMotionValue(0.5);
  const py = useMotionValue(0.5);
  const rx = useSpring(useTransform(py, [0, 1], [9, -9]), { stiffness: 150, damping: 18 });
  const ry = useSpring(useTransform(px, [0, 1], [-12, 12]), { stiffness: 150, damping: 18 });
  const sheenX = useTransform(px, (v) => `${v * 100}%`);
  const sheenY = useTransform(py, (v) => `${v * 100}%`);

  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!interactive || reduce) return;
    const r = e.currentTarget.getBoundingClientRect();
    px.set((e.clientX - r.left) / r.width);
    py.set((e.clientY - r.top) / r.height);
  };
  const reset = () => {
    px.set(0.5);
    py.set(0.5);
  };

  const passed = m ? m.checks.filter((c) => c.ok).length : 0;

  return (
    <div className="pass-stage" onPointerMove={onMove} onPointerLeave={reset}>
      <motion.div className="pass" style={reduce ? undefined : { rotateX: rx, rotateY: ry }} aria-label={m ? `Membership ${m.name}, owned by ${m.owner}` : "Membership pass"}>
        <motion.div className="pass-sheen" style={{ "--px": sheenX, "--py": sheenY } as any} aria-hidden="true" />
        <div className="pass-grain" aria-hidden="true" />
        <div className="pass-top">
          <span className="pass-brand">
            <KitMark size={22} /> Clubhouse
          </span>
          <span className={`pass-live ${m ? "on" : ""}`}>
            <span className="dot" />
            {loading ? "Reading chain…" : m ? label : "Waiting for data"}
          </span>
        </div>

        <div className="pass-name-label">Membership account</div>
        <div className="pass-name">{m ? m.name : loading ? "loading…" : "—"}</div>

        <dl className="pass-facts">
          <div>
            <dt>Owner</dt>
            <dd>{m?.owner ?? "—"}</dd>
          </div>
          <div>
            <dt>Lease until</dt>
            <dd className="tnum">{m ? formatNs(m.leaseUntilNs) : "—"}</dd>
          </div>
          <div>
            <dt>On-chain checks</dt>
            <dd className="tnum">{m ? `${passed}/${m.checks.length} passed` : "—"}</dd>
          </div>
          <div>
            <dt>Access keys</dt>
            <dd>{m ? (m.checks.find((c) => c.id === "no-access-keys")?.ok ? "None" : "Present") : "—"}</dd>
          </div>
        </dl>

        <div className="pass-bottom">
          <span className="pass-chip">NFT · {m?.registry ?? "registry"}</span>
          <svg className="pass-qr" viewBox="0 0 40 40" aria-hidden="true">
            {Array.from({ length: 36 }, (_, i) => {
              const x = (i % 6) * 6 + 2;
              const y = Math.floor(i / 6) * 6 + 2;
              const on = (m?.name ?? "clubhouse").charCodeAt(i % (m?.name.length ?? 9)) % 3 !== 0;
              // biome-ignore lint/suspicious/noArrayIndexKey: a fixed decorative grid
              return on ? <rect key={i} x={x} y={y} width="5" height="5" rx="1" /> : null;
            })}
          </svg>
        </div>
      </motion.div>
    </div>
  );
}
