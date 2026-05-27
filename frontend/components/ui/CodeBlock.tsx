import type { CSSProperties } from "react";

// Tiny tokenizer covering the languages the prototype uses (python, ts/js, sql).
// Not trying to be Monaco — just enough to give the faux editor a "syntax-y" feel.
const KW: Record<string, string[]> = {
  python: ["def","return","if","else","elif","for","while","in","not","and","or","import","from","as","class","self","True","False","None","pass","break","continue","with","try","except","finally","raise","yield","lambda","is","print"],
  typescript: ["const","let","var","function","class","return","if","else","for","while","switch","case","default","break","continue","import","from","export","new","this","async","await","try","catch","finally","throw","typeof","instanceof","interface","type","enum","extends","implements","public","private","protected","readonly","static","void","null","undefined","true","false"],
  javascript: ["const","let","var","function","class","return","if","else","for","while","switch","case","default","break","continue","import","from","export","new","this","async","await","try","catch","finally","throw","typeof","instanceof","null","undefined","true","false"],
  sql: ["SELECT","FROM","WHERE","JOIN","LEFT","RIGHT","INNER","OUTER","ON","GROUP","BY","ORDER","HAVING","LIMIT","OFFSET","AS","AND","OR","NOT","IN","IS","NULL","INSERT","INTO","VALUES","UPDATE","SET","DELETE","CREATE","TABLE","ALTER","DROP","WITH","UNION","DISTINCT","COUNT","SUM","AVG","MIN","MAX"],
  go: ["package","import","func","return","if","else","for","range","map","struct","interface","var","const","type","chan","go","defer","select","switch","case","default","break","continue","fallthrough","nil","true","false"],
  java: ["public","private","protected","class","interface","extends","implements","static","final","void","int","long","double","float","boolean","String","return","if","else","for","while","switch","case","default","break","continue","new","this","super","null","true","false","try","catch","finally","throw","throws","import","package"],
  cpp: ["int","long","double","float","char","void","bool","class","struct","public","private","protected","return","if","else","for","while","switch","case","default","break","continue","new","delete","this","nullptr","true","false","try","catch","throw","using","namespace","include","auto","const","static"],
};

function highlightLine(line: string, lang: string): React.ReactNode {
  const kws = new Set(KW[lang] ?? []);
  // Tokenize on word boundaries / strings / comments.
  const parts: React.ReactNode[] = [];
  let rest = line;
  let key = 0;
  while (rest.length) {
    // line comment
    const lc = lang === "sql" ? "--" : ["python"].includes(lang) ? "#" : "//";
    if (rest.startsWith(lc)) {
      parts.push(<span key={key++} style={{ color: "var(--fg-3)" }}>{rest}</span>);
      break;
    }
    // string
    const sm = rest.match(/^(["'`])((?:\\.|(?!\1).)*)\1/);
    if (sm) {
      parts.push(<span key={key++} style={{ color: "var(--live)" }}>{sm[0]}</span>);
      rest = rest.slice(sm[0].length);
      continue;
    }
    // number
    const nm = rest.match(/^-?\b\d+(?:\.\d+)?\b/);
    if (nm) {
      parts.push(<span key={key++} style={{ color: "var(--warn)" }}>{nm[0]}</span>);
      rest = rest.slice(nm[0].length);
      continue;
    }
    // identifier
    const im = rest.match(/^[A-Za-z_][A-Za-z0-9_]*/);
    if (im) {
      const tok = im[0];
      if (kws.has(tok)) {
        parts.push(<span key={key++} style={{ color: "var(--signal)" }}>{tok}</span>);
      } else {
        parts.push(<span key={key++}>{tok}</span>);
      }
      rest = rest.slice(tok.length);
      continue;
    }
    // other (whitespace, punctuation)
    parts.push(<span key={key++}>{rest[0]}</span>);
    rest = rest.slice(1);
  }
  return parts;
}

export interface CodeBlockLineHighlight {
  line: number;
  color?: string; // CSS color, e.g. "var(--live)" — defaults to live
  label?: string; // right-side mono label, e.g. "candidate cursor"
}

export function CodeBlock({
  code,
  language = "python",
  activeLine,
  highlightLines,
  className,
  style,
  maxHeight,
}: {
  code: string;
  language?: string;
  activeLine?: number;
  highlightLines?: CodeBlockLineHighlight[];
  className?: string;
  style?: CSSProperties;
  maxHeight?: number;
}) {
  const lines = code.replace(/\n$/, "").split("\n");
  const highlightByNum = new Map<number, CodeBlockLineHighlight>();
  for (const h of highlightLines ?? []) highlightByNum.set(h.line, h);
  if (activeLine != null && !highlightByNum.has(activeLine)) {
    highlightByNum.set(activeLine, { line: activeLine });
  }

  return (
    <pre
      className={`mono ${className ?? ""}`}
      style={{
        background: "var(--bg-0)",
        border: "1px solid var(--line-1)",
        borderRadius: "var(--radius)",
        padding: 0,
        margin: 0,
        fontSize: 12.5,
        lineHeight: "1.55em",
        overflow: "auto",
        maxHeight,
        ...style,
      }}
    >
      {lines.map((raw, i) => {
        const lineNum = i + 1;
        const hl = highlightByNum.get(lineNum);
        const color = hl?.color ?? "var(--live)";
        return (
          <div
            key={i}
            style={{
              display: "grid",
              gridTemplateColumns: "44px 1fr auto",
              alignItems: "baseline",
              background: hl ? `color-mix(in oklch, ${color} 12%, transparent)` : "transparent",
              borderLeft: hl ? `2px solid ${color}` : "2px solid transparent",
              padding: "0 12px 0 0",
            }}
          >
            <span
              style={{
                color: "var(--fg-3)",
                textAlign: "right",
                paddingRight: 12,
                userSelect: "none",
                fontSize: 11,
              }}
            >
              {lineNum}
            </span>
            <span style={{ color: "var(--fg-0)", whiteSpace: "pre" }}>
              {raw.length ? highlightLine(raw, language) : " "}
            </span>
            {hl?.label && (
              <span
                className="mono"
                style={{
                  color,
                  fontSize: 10,
                  paddingLeft: 10,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                }}
              >
                {hl.label}
              </span>
            )}
          </div>
        );
      })}
    </pre>
  );
}

export default CodeBlock;
