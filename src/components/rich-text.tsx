/** Texto simples com parágrafos e listas por hífen; sem HTML do utilizador (sem risco de XSS). */
export function PlainRichText({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/)
  return (
    <div className="space-y-4 text-[17px] leading-relaxed">
      {blocks.map((block, index) => {
        const lines = block.split('\n').filter((line) => line.trim())
        const items = lines.filter((line) => /^\s*[-•]\s+/.test(line))
        const heading = lines.length > 1 && items.length === lines.length - 1 && !/^\s*[-•]/.test(lines[0]!) ? lines[0] : null
        if (items.length > 0 && (items.length === lines.length || heading)) {
          return (
            <div key={index}>
              {heading ? <h3 className="mb-2 text-[19px] font-semibold">{heading}</h3> : null}
              <ul className="ml-5 list-disc space-y-1">
                {items.map((item) => (
                  <li key={item}>{item.replace(/^\s*[-•]\s+/, '')}</li>
                ))}
              </ul>
            </div>
          )
        }
        if (lines.length > 1 && lines[0]!.length < 60 && !/[.!?:]$/.test(lines[0]!)) {
          return (
            <div key={index}>
              <h3 className="mb-1 text-[19px] font-semibold">{lines[0]}</h3>
              <p className="max-w-[65ch]">{lines.slice(1).join(' ')}</p>
            </div>
          )
        }
        return (
          <p key={index} className="max-w-[65ch]">
            {lines.join(' ')}
          </p>
        )
      })}
    </div>
  )
}
