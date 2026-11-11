import { useState, type ReactNode } from "react";
import { CheckIcon, CopyIcon } from "../icons";
import { copyText } from "../lib/copy";
import { useToast } from "./toast";

/** Tiny highlighter for the TypeScript snippets we show (keywords, strings, comments, calls). */
function highlight(src: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\/\/[^\n]*)|("(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`)|\b(import|from|const|await|new|if|return|export|async|throw)\b|\b(\d[\d_n]*)\b|([A-Za-z_]\w*)(?=\()/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(src))) {
    if (m.index > last) out.push(src.slice(last, m.index));
    const cls = m[1] ? "c" : m[2] ? "s" : m[3] ? "k" : m[4] ? "n" : "f";
    out.push(
      <span key={k++} className={cls}>
        {m[0]}
      </span>,
    );
    last = m.index + m[0].length;
  }
  out.push(src.slice(last));
  return out;
}

export function CodeBlock({ code, title, tabs }: { code?: string; title?: string; tabs?: { id: string; label: string; code: string; note?: string }[] }) {
  const [active, setActive] = useState(tabs?.[0]?.id);
  const [copied, setCopied] = useState(false);
  const toast = useToast();
  const current = tabs ? tabs.find((t) => t.id === active)! : { code: code!, note: undefined, label: title };

  const copy = async () => {
    try {
      await copyText(current.code);
      setCopied(true);
      toast("ok", "Copied to clipboard");
      setTimeout(() => setCopied(false), 1600);
    } catch {
      toast("bad", "Couldn't copy. Select the code and copy it manually.");
    }
  };

  return (
    <div className="code">
      {tabs && (
        <div className="code-tabs" role="tablist" aria-label="Code examples">
          {tabs.map((t) => (
            <button key={t.id} role="tab" className="code-tab" aria-selected={t.id === active} onClick={() => setActive(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
      )}
      <div className="code-head">
        <div className="code-dots" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <span className="code-title">{title ?? "example.ts"}</span>
        <button className={`code-copy ${copied ? "copied" : ""}`} onClick={copy} aria-label="Copy code">
          {copied ? <CheckIcon width={14} height={14} /> : <CopyIcon />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre>
        <code>{highlight(current.code)}</code>
      </pre>
      {current.note && <p className="code-note">{current.note}</p>}
    </div>
  );
}
