import { AnimatePresence, motion, useMotionValueEvent, useReducedMotion, useScroll, useTransform } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { api, type Config, type Membership } from "../api";
import { CodeBlock } from "../components/CodeBlock";
import { MembershipPass } from "../components/MembershipPass";
import { Reveal, SplitWords, WaveEdge, WaveField, useSpotlight } from "../components/motion";
import { ButtonLink, Magnetic, Pill } from "../components/primitives";
import {
  ArrowRightIcon,
  BotIcon,
  CheckIcon,
  CodeIcon,
  DoorIcon,
  KeyIcon,
  LayersIcon,
  PlayIcon,
  SearchIcon,
  ShieldCheckIcon,
  SignatureIcon,
  SwapIcon,
  WalletIcon,
  XIcon,
} from "../icons";
import { Link } from "../lib/router";
import { SDK_SNIPPETS } from "../lib/snippets";

/* ---------------------------------------------------------------- hero */

function Hero({ live, loading }: { live: Membership | null; loading: boolean }) {
  const ref = useRef<HTMLElement>(null);
  const spot = useSpotlight<HTMLDivElement>();
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const scale = useTransform(scrollYProgress, [0, 1], [1, 0.93]);
  const fade = useTransform(scrollYProgress, [0, 0.9], [1, 0.25]);
  const lift = useTransform(scrollYProgress, [0, 1], [0, -60]);

  return (
    <section ref={ref} className="hero theme-ink" aria-labelledby="hero-title">
      <motion.div className="hero-inner" style={reduce ? undefined : { scale, opacity: fade }}>
        <div ref={spot} className="hero-spot" aria-hidden="true" />
        <div className="hero-grid-bg" aria-hidden="true" />
        <div className="container hero-layout">
          <div className="hero-copy">
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.1 }}>
              <span className="hero-kicker">
                <span className="kicker-dot" /> A developer toolkit for NEAR Top Level Accounts
              </span>
            </motion.div>
            <h1 id="hero-title">
              <SplitWords text="Accounts you can" delay={0.15} />
              <br />
              <span className="hero-accent">
                <SplitWords text="hand over." delay={0.35} />
              </span>
            </h1>
            <motion.p className="lede" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.55 }}>
              On NEAR, House of Stake membership names are NFTs that are also real accounts: they hold tokens, have no keys, and move to whoever holds the NFT.
              AccountKit lets an app read them, verify them, sign people in with them and pass them on, in a few calls.
            </motion.p>
            <motion.div className="hero-ctas" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.7 }}>
              <Magnetic>
                <ButtonLink to="/demo#live" size="lg" icon={<PlayIcon width={18} height={18} />}>
                  Watch it run on testnet
                </ButtonLink>
              </Magnetic>
              <ButtonLink to="/developers" size="lg" variant="secondary" trailing={<ArrowRightIcon width={18} height={18} className="arrow" />}>
                Explore the SDK
              </ButtonLink>
            </motion.div>
            <motion.ul className="hero-proof" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8, delay: 0.9 }}>
              <li><ShieldCheckIcon width={16} height={16} /> Built on House of Stake's audited contracts</li>
              <li><SignatureIcon width={16} height={16} /> Sign in without a transaction</li>
              <li><CodeIcon width={16} height={16} /> TypeScript · MIT</li>
            </motion.ul>
          </div>

          <motion.div className="hero-visual" style={reduce ? undefined : { y: lift }} initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 1, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}>
            <OrbitLines />
            <span className="orbit-node n-owner"><WalletIcon width={16} height={16} /> Owner's wallet</span>
            <span className="orbit-node n-nft"><LayersIcon width={16} height={16} /> NFT in the registry</span>
            <span className="orbit-node n-acct"><KeyIcon width={16} height={16} /> A real NEAR account</span>
            <MembershipPass m={live} loading={loading} />
            <p className="hero-visual-note">
              {live ? "Live: read from NEAR testnet just now. Move your cursor over the pass." : "Reading a demo membership from NEAR testnet…"}
            </p>
          </motion.div>
        </div>
        <WaveField className="hero-waves" lines={11} height={240} />
      </motion.div>
    </section>
  );
}

function OrbitLines() {
  return (
    <svg className="orbit-lines" viewBox="0 0 560 520" aria-hidden="true" focusable="false">
      <ellipse cx="280" cy="260" rx="250" ry="210" />
      <ellipse cx="280" cy="260" rx="190" ry="250" className="o2" />
      <path d="M95 92 C 200 140, 230 200, 270 250" className="flow" />
      <path d="M505 250 C 420 250, 360 255, 300 258" className="flow f2" />
      <path d="M150 455 C 210 380, 240 320, 275 275" className="flow f3" />
    </svg>
  );
}

/* ---------------------------------------------------------------- marquee */

const FACTS = [
  "No seed phrase ever changes hands",
  "Sign in by signing a message, not a transaction",
  "Ownership re-checked on every request",
  "Selling a membership clears the old owner's agents",
  "Agent budgets enforced by the account's own contract",
  "Transfers to accounts that don't exist are stopped before signing",
  "13 checks that the NFT and the account agree",
];

function Marquee() {
  return (
    <div className="marquee theme-ink" aria-label="What AccountKit checks">
      <div className="marquee-track">
        {[0, 1].map((k) => (
          <ul key={k} aria-hidden={k === 1}>
            {FACTS.map((f) => (
              <li key={f}>
                <span className="mq-dot" aria-hidden="true" />
                {f}
              </li>
            ))}
          </ul>
        ))}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- problem */

function Problem() {
  const surfaces = [
    ["Registrar", "config() on the TLA account finds the registry"],
    ["Registry", "NEP-171 nft_token and get_sub_account"],
    ["Wallet views", "nft_item_info, hos_lease, w_extensions"],
    ["NEP-641", "w_resolve_auth + NEP-413 signatures for sign-in"],
    ["Lease states", "Active, parked, frozen, expired"],
    ["Spend grants", "hos_grant_spend budgets, receivers, expiry"],
  ];
  return (
    <section id="product" className="slab theme-paper slab-over" aria-labelledby="problem-title">
      <WaveEdge color="var(--paper)" />
      <div className="container problem-grid">
        <div className="problem-copy">
          <Reveal>
            <span className="eyebrow">The problem</span>
          </Reveal>
          <Reveal delay={0.05}>
            <h2 id="problem-title">A powerful NEAR primitive, with no developer layer.</h2>
          </Reveal>
          <Reveal delay={0.1}>
            <p className="lede">
              House of Stake's Top Level Accounts are live and audited on mainnet. But to use one, an app has to learn six different contract surfaces and get
              every ownership check right by itself.
            </p>
          </Reveal>
          <Reveal delay={0.15}>
            <blockquote className="pull">
              <span className="pull-mark" aria-hidden="true">“</span>
              There's no SDK yet — you build on the contracts directly.
              <cite>NEAR HACKATHON, NFT track prompt</cite>
            </blockquote>
          </Reveal>
        </div>
        <div className="problem-compare">
          <Reveal className="surfaces card">
            <div className="compare-head">
              <span className="eyebrow no-rule">Without AccountKit</span>
              <Pill tone="bad">6 surfaces to learn</Pill>
            </div>
            <ul>
              {surfaces.map(([k, v], i) => (
                <motion.li key={k} initial={{ opacity: 0, x: -10 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: 0.08 * i, duration: 0.5 }}>
                  <span className="sf-k">{k}</span>
                  <span className="sf-v">{v}</span>
                </motion.li>
              ))}
            </ul>
          </Reveal>
          <Reveal delay={0.15} className="after card">
            <div className="compare-head">
              <span className="eyebrow no-rule">With AccountKit</span>
              <Pill tone="ok">One call</Pill>
            </div>
            <pre className="after-code">
              <span className="k">const</span> {"{ result }"} = <span className="k">await</span> kit.<span className="f">verify</span>(<span className="s">"alice-member.akclub.testnet"</span>);
              {"\n"}result.owner  <span className="c">// "ak-alice.testnet", after 13 checks</span>
            </pre>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- how (pinned story) */

const STEPS = [
  {
    icon: <LayersIcon />,
    title: "One name, two things",
    text: "Each membership is an NFT in House of Stake's registry and a real NEAR account with the same name. AccountKit reads both and checks they agree.",
  },
  {
    icon: <SignatureIcon />,
    title: "Prove it without a transaction",
    text: "The owner's wallet signs a one-time message. The membership account itself confirms who its owner is (NEP-641). No gas, nothing sent.",
  },
  {
    icon: <SwapIcon />,
    title: "Access follows the owner",
    text: "Transfer the NFT and the account and its access move together. The old owner's next request is refused, and their agents are removed.",
  },
  {
    icon: <BotIcon />,
    title: "Agents get limits the account enforces",
    text: "An owner can let an agent spend from the account, up to a budget, to approved recipients, until a deadline. The contract blocks the rest.",
  },
];

function StepVisual({ i }: { i: number }) {
  if (i === 0)
    return (
      <div className="viz viz-split">
        <div className="viz-card">
          <span className="viz-tag"><LayersIcon width={14} height={14} /> NFT record</span>
          <span className="mono">registry.akclub.testnet</span>
          <span className="viz-sub">token alice-member.akclub.testnet</span>
          <span className="viz-sub">owner ak-alice.testnet</span>
        </div>
        <div className="viz-link"><span>same name</span></div>
        <div className="viz-card">
          <span className="viz-tag"><KeyIcon width={14} height={14} /> NEAR account</span>
          <span className="mono">alice-member.akclub.testnet</span>
          <span className="viz-sub">holds tokens · no keys</span>
          <span className="viz-sub">owner ak-alice.testnet</span>
        </div>
        <div className="viz-verdict ok"><CheckIcon width={16} height={16} /> They agree. Verified.</div>
      </div>
    );
  if (i === 1)
    return (
      <div className="viz viz-flow">
        {[
          [<WalletIcon width={16} height={16} />, "Owner's wallet", "signs a message"],
          [<KeyIcon width={16} height={16} />, "Membership account", "w_resolve_auth → \"ask my owner\""],
          [<ShieldCheckIcon width={16} height={16} />, "AccountKit", "checks the owner's signature and key"],
          [<DoorIcon width={16} height={16} />, "Clubhouse", "lets the owner in"],
        ].map(([icon, a, b], k) => (
          <motion.div key={k} className="flow-row" initial={{ opacity: 0, x: 14 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.12 * k }}>
            <span className="flow-icon">{icon}</span>
            <span><b>{a as string}</b><span className="viz-sub">{b as string}</span></span>
          </motion.div>
        ))}
        <div className="viz-verdict ok"><CheckIcon width={16} height={16} /> Signed in. Zero transactions.</div>
      </div>
    );
  if (i === 2)
    return (
      <div className="viz viz-swap">
        <div className="swap-row">
          <div className="who out"><span className="mono">ak-alice.testnet</span><span className="viz-sub">old owner</span></div>
          <motion.span className="swap-arrow" animate={{ x: [0, 8, 0] }} transition={{ repeat: Infinity, duration: 1.8 }}><SwapIcon /></motion.span>
          <div className="who in"><span className="mono">ak-bob.testnet</span><span className="viz-sub">new owner</span></div>
        </div>
        <div className="viz-verdict ok"><CheckIcon width={16} height={16} /> ak-bob.testnet signs in</div>
        <div className="viz-verdict bad"><XIcon width={16} height={16} /> ak-alice.testnet's old session is refused</div>
      </div>
    );
  return (
    <div className="viz viz-agent">
      <div className="meter-row"><span>Budget</span><span className="tnum">0.2 of 0.5 NEAR</span></div>
      <div className="meter"><motion.span initial={{ width: 0 }} animate={{ width: "40%" }} transition={{ duration: 0.9 }} /></div>
      <div className="viz-verdict ok"><CheckIcon width={16} height={16} /> 0.2 NEAR to the approved shop · allowed</div>
      <div className="viz-verdict bad"><XIcon width={16} height={16} /> 0.4 NEAR more · "spend exceeds the granted cap"</div>
      <div className="viz-verdict bad"><XIcon width={16} height={16} /> 0.1 NEAR elsewhere · "receiver is not in the spend grant"</div>
    </div>
  );
}

function HowItWorks() {
  const ref = useRef<HTMLElement>(null);
  const [active, setActive] = useState(0);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  useMotionValueEvent(scrollYProgress, "change", (v) => setActive(Math.min(STEPS.length - 1, Math.floor(v * STEPS.length * 0.999))));
  const progress = useTransform(scrollYProgress, [0, 1], ["0%", "100%"]);

  return (
    <section id="how" ref={ref} className="how theme-ink" aria-labelledby="how-title" style={{ ["--steps" as any]: STEPS.length }}>
      <WaveEdge color="var(--ink-900)" />
      <div className="how-sticky">
        <div className="container how-layout">
          <div className="how-left">
            <span className="eyebrow">How it works</span>
            <h2 id="how-title">From NFT to front door, in four moves.</h2>
            <ol className="how-steps">
              {STEPS.map((s, i) => (
                <li key={s.title} className={i === active ? "active" : i < active ? "done" : ""} aria-current={i === active ? "step" : undefined}>
                  <span className="how-num">{String(i + 1).padStart(2, "0")}</span>
                  <div>
                    <h3>{s.title}</h3>
                    <p>{s.text}</p>
                  </div>
                </li>
              ))}
            </ol>
            <div className="how-progress" aria-hidden="true"><motion.span style={{ width: progress }} /></div>
            <div className="how-cta">
              <ButtonLink to="/demo#live" variant="secondary" icon={<PlayIcon width={16} height={16} />}>Watch these four moves on testnet</ButtonLink>
              <span className="muted small">Real transactions, about 30 seconds, no wallet needed.</span>
            </div>
          </div>
          <div className="how-right" aria-live="polite">
            <div className="viz-frame">
              <div className="viz-frame-head">
                <span className="viz-step">Step {active + 1} of {STEPS.length}</span>
                <span className="tag-sample">Illustration · run it live in the demo</span>
              </div>
              <AnimatePresence mode="wait">
                <motion.div key={active} initial={{ opacity: 0, y: 16, filter: "blur(4px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} exit={{ opacity: 0, y: -12, filter: "blur(4px)" }} transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}>
                  <StepVisual i={active} />
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>
      {/* mobile: no pinning, each step with its own visual */}
      <div className="container how-mobile">
        <span className="eyebrow">How it works</span>
        <h2>From NFT to front door, in four moves.</h2>
        {STEPS.map((s, i) => (
          <Reveal key={s.title} className="how-m-step">
            <span className="how-num">{String(i + 1).padStart(2, "0")}</span>
            <h3>{s.title}</h3>
            <p>{s.text}</p>
            <div className="viz-frame"><StepVisual i={i} /></div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- demo paths */

function DemoPaths({ liveAvailable }: { liveAvailable: boolean | null }) {
  const paths = [
    {
      to: "/demo#live",
      icon: <PlayIcon />,
      title: "Watch the live run",
      text: "The demo server walks two test accounts through the whole journey: sign in, turn away a stranger, transfer, lock the old owner out. Every step is a real testnet transaction, signature or read, with a link to check it.",
      tag: liveAvailable === false ? "Not available on this server" : "No wallet needed · about 30 seconds",
      primary: true,
    },
    {
      to: "/demo#wallet",
      icon: <WalletIcon />,
      title: "Use your own wallet",
      text: "Connect a testnet wallet, rent a membership with test NEAR, sign in, and hand it to a friend. Your wallet signs everything.",
      tag: "Testnet wallet · test NEAR",
    },
    {
      to: "/demo#lookup",
      icon: <SearchIcon />,
      title: "Look up any name",
      text: "Type a membership name and see its owner, lease and the 13 checks, read straight from the chain. Read-only.",
      tag: "No wallet · read-only",
    },
  ];
  return (
    <section className="slab theme-paper slab-over" aria-labelledby="paths-title">
      <WaveEdge color="var(--paper)" />
      <div className="container">
        <div className="section-head">
          <Reveal><span className="eyebrow">Clubhouse, the demo</span></Reveal>
          <Reveal delay={0.05}><h2 id="paths-title">A private club where membership is an account.</h2></Reveal>
          <Reveal delay={0.1}>
            <p className="lede">Clubhouse is a small app built only with AccountKit. Pick how you want to try it; each path ends somewhere real.</p>
          </Reveal>
        </div>
        <div className="paths">
          {paths.map((p, i) => (
            <Reveal key={p.title} delay={0.08 * i}>
              <Link to={p.to} className={`path-card ${p.primary ? "primary" : ""}`}>
                <span className="path-icon">{p.icon}</span>
                <h3>{p.title}</h3>
                <p>{p.text}</p>
                <span className="path-foot">
                  <span className="path-tag">{p.tag}</span>
                  <ArrowRightIcon width={18} height={18} className="path-arrow" />
                </span>
              </Link>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- developers band */

function DevBand() {
  const fns = [
    ["kit.resolve(name)", "Everything about a name, read at one block"],
    ["verifyItem(info)", "13 checks that the NFT and the account agree"],
    ["createSignInRequest / verifySignIn", "Sign in with a TLA via NEP-641"],
    ["kit.prepareTransfer(name, from, to)", "A safe transfer for the owner's wallet"],
    ["grantSpendTx / revokeSpendTx", "On-chain limits for an agent"],
    ["kit.rentQuote(tla, label)", "Price and rent transaction for a new name"],
  ];
  return (
    <section className="slab theme-ink slab-over dev-band" aria-labelledby="dev-title">
      <WaveEdge color="var(--ink-900)" />
      <div className="container dev-grid">
        <div>
          <Reveal><span className="eyebrow">For developers</span></Reveal>
          <Reveal delay={0.05}><h2 id="dev-title">Small API. Every call maps to a contract method you can read.</h2></Reveal>
          <Reveal delay={0.1}>
            <p className="lede">AccountKit never holds keys. Reads are free RPC view calls; anything that changes state comes back as a transaction for the user's own wallet to sign.</p>
          </Reveal>
          <ul className="fn-list">
            {fns.map(([f, d], i) => (
              <Reveal as="li" key={f} delay={0.05 * i}>
                <code>{f}</code>
                <span>{d}</span>
              </Reveal>
            ))}
          </ul>
          <Reveal delay={0.2}>
            <ButtonLink to="/developers" variant="secondary" trailing={<ArrowRightIcon width={16} height={16} className="arrow" />}>
              Read the SDK reference
            </ButtonLink>
          </Reveal>
        </div>
        <Reveal delay={0.1}>
          <CodeBlock tabs={SDK_SNIPPETS.slice(0, 3)} title="clubhouse.ts" />
        </Reveal>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- truth */

function Truth() {
  const rows: { what: string; status: "live" | "read" | "scripted" | "not"; note: string }[] = [
    { what: "Verify a membership (13 checks)", status: "live", note: "Testnet and mainnet. View calls only." },
    { what: "Sign in with a membership (NEP-641)", status: "live", note: "Testnet. One-time message, no transaction." },
    { what: "Transfer a membership", status: "live", note: "Testnet. Standard nft_transfer on the registry." },
    { what: "Rent a membership name", status: "live", note: "Testnet. Paid with test NEAR." },
    { what: "Agent spending limits", status: "live", note: "Testnet. Enforced by the account's own contract." },
    { what: "Read real mainnet names", status: "read", note: "House of Stake's live registry.hos, read-only." },
    { what: "The demo agent's decisions", status: "scripted", note: "Fixed tasks, not an AI model. The limits it hits are real." },
    { what: "Activity history, npm package, mainnet transactions", status: "not", note: "Not built for this demo." },
  ];
  const label = { live: "Live on testnet", read: "Read-only", scripted: "Scripted", not: "Not built" } as const;
  const tone = { live: "ok", read: undefined, scripted: "warn", not: "bad" } as const;
  return (
    <section id="truth" className="slab theme-paper slab-over" aria-labelledby="truth-title">
      <WaveEdge color="var(--paper)" />
      <div className="container truth-grid">
        <div>
          <Reveal><span className="eyebrow">What's real</span></Reveal>
          <Reveal delay={0.05}><h2 id="truth-title">What runs for real, and what doesn't.</h2></Reveal>
          <Reveal delay={0.1}>
            <p className="lede">
              The contracts are House of Stake's, unmodified, deployed by us on NEAR testnet with their own scripts. Here's exactly what works, and what doesn't.
            </p>
          </Reveal>
          <Reveal delay={0.15}>
            <dl className="contract-list">
              <div><dt>Network</dt><dd>NEAR testnet</dd></div>
              <div><dt>Club namespace</dt><dd className="mono">akclub.testnet</dd></div>
              <div><dt>Registry</dt><dd className="mono">registry.akclub.testnet</dd></div>
              <div><dt>Contract source</dt><dd className="mono">houseofstake/tla-contracts @ d85860a</dd></div>
            </dl>
          </Reveal>
        </div>
        <Reveal delay={0.1} className="truth-table card">
          <table>
            <thead>
              <tr><th scope="col">Capability</th><th scope="col">Status</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.what}>
                  <td><b>{r.what}</b><span className="muted small">{r.note}</span></td>
                  <td><Pill tone={tone[r.status]}>{label[r.status]}</Pill></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Reveal>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- final */

function Final() {
  return (
    <section className="final theme-ink slab-over" aria-labelledby="final-title">
      <WaveEdge color="var(--ink-900)" />
      <WaveField className="final-waves" lines={13} height={320} />
      <div className="container final-inner">
        <Reveal><h2 id="final-title">See an account change hands.</h2></Reveal>
        <Reveal delay={0.08}>
          <p className="lede">Thirty seconds, two test accounts, every step on NEAR testnet with a link you can check.</p>
        </Reveal>
        <Reveal delay={0.15} className="final-ctas">
          <Magnetic>
            <ButtonLink to="/demo#live" size="lg" icon={<PlayIcon width={18} height={18} />}>Start the live run</ButtonLink>
          </Magnetic>
          <ButtonLink to="/demo#wallet" size="lg" variant="secondary">Bring your own wallet</ButtonLink>
        </Reveal>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- page */

export function Landing({ config }: { config: Config }) {
  const [live, setLive] = useState<Membership | null>(null);
  const [loading, setLoading] = useState(true);
  const [liveAvailable, setLiveAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await api.demoStatus();
        if (!cancelled) setLiveAvailable(s.ownership);
        const m = await api.lookup(s.name);
        if (!cancelled) setLive(m);
      } catch {
        /* the pass shows its own waiting state */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <Hero live={live} loading={loading} />
      <Marquee />
      <div className="stack">
        <Problem />
        <HowItWorks />
        <DemoPaths liveAvailable={liveAvailable} />
        <DevBand />
        <Truth />
        <Final />
      </div>
      <span hidden>{config.network}</span>
    </>
  );
}
