import { formatNear, formatNs, type Membership } from "../api";
import { Pill } from "../components/primitives";
import { CheckIcon, ExternalIcon, XIcon } from "../icons";
import { explorerAccount } from "../lib/explorer";

/** The verified on-chain facts about one membership, with the 13 checks behind them. */
export function MembershipDetail({ m, network, title = "Membership account" }: { m: Membership; network: string; title?: string }) {
  const passed = m.checks.filter((c) => c.ok).length;
  return (
    <div className="card detail">
      <div className="detail-head">
        <span className="eyebrow no-rule">{title}</span>
        <div className="pills">
          <Pill tone={m.verified ? "ok" : "bad"}>{m.verified ? "Record verified" : "Not verified"}</Pill>
          <Pill tone={m.active ? "ok" : "bad"}>{m.active ? "Active" : "Inactive"}</Pill>
        </div>
      </div>
      <div className="detail-name mono">{m.name}</div>
      <dl className="facts">
        <div><dt>Current owner</dt><dd className="mono">{m.owner ?? "—"}</dd></div>
        <div>
          <dt>Balance</dt>
          <dd className="tnum">{formatNear(m.balanceYocto)}{network !== "mainnet" && <span className="muted"> · test tokens</span>}</dd>
        </div>
        <div><dt>Lease until</dt><dd className="tnum">{formatNs(m.leaseUntilNs)}</dd></div>
        <div><dt>Registry</dt><dd className="mono">{m.registry}</dd></div>
      </dl>
      <details className="checks">
        <summary>
          <span>{passed}/{m.checks.length} on-chain checks passed</span>
          <span className="muted tnum">block {m.block.height.toLocaleString()}</span>
        </summary>
        <ul>
          {m.checks.map((c) => (
            <li key={c.id} className={c.ok ? "ok" : "fail"}>
              <span className="ck">{c.ok ? <CheckIcon width={14} height={14} /> : <XIcon width={14} height={14} />}</span>
              <span><code>{c.id}</code> {c.detail}</span>
            </li>
          ))}
        </ul>
      </details>
      <p className="detail-links small">
        <a className="text-link" href={explorerAccount(network, m.name)} target="_blank" rel="noreferrer">
          Account history on NearBlocks <ExternalIcon />
        </a>
        {m.owner && (
          <a className="text-link" href={explorerAccount(network, m.owner)} target="_blank" rel="noreferrer">
            Owner's account <ExternalIcon />
          </a>
        )}
      </p>
    </div>
  );
}
