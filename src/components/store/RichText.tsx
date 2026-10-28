/** Renders the simple text format used for policies: "## " headings, "- " bullets, blank-line paragraphs. */
export function RichText({ text }: { text: string }) {
  const blocks = text.replace(/\r\n/g, "\n").split(/\n{2,}/);
  return (
    <div className="prose-store">
      {blocks.map((block, i) => {
        const lines = block.split("\n").filter((l) => l.trim());
        if (!lines.length) return null;
        if (lines[0].startsWith("## ")) {
          const rest = lines.slice(1);
          return (
            <section key={i}>
              <h2>{lines[0].slice(3)}</h2>
              {rest.length > 0 && <Lines lines={rest} />}
            </section>
          );
        }
        return <Lines key={i} lines={lines} />;
      })}
    </div>
  );
}

function Lines({ lines }: { lines: string[] }) {
  if (lines.every((l) => l.startsWith("- "))) {
    return (
      <ul>
        {lines.map((l, i) => (
          <li key={i}>{l.slice(2)}</li>
        ))}
      </ul>
    );
  }
  const bullets = lines.filter((l) => l.startsWith("- "));
  const text = lines.filter((l) => !l.startsWith("- "));
  return (
    <>
      {text.length > 0 && <p>{text.join(" ")}</p>}
      {bullets.length > 0 && (
        <ul>
          {bullets.map((l, i) => (
            <li key={i}>{l.slice(2)}</li>
          ))}
        </ul>
      )}
    </>
  );
}
