export default function SimpleMarkdown({ children }) {
  if (!children) return null

  const lines = String(children).split('\n')
  const elements = []
  let tableBuffer = []
  let inTable = false
  let key = 0

  function flushTable() {
    if (tableBuffer.length < 2) {
      tableBuffer.forEach(l => elements.push(<p key={key++} style={{ margin: '4px 0' }}>{l}</p>))
      tableBuffer = []
      inTable = false
      return
    }
    const headers = tableBuffer[0].split('|').map(c => c.trim()).filter(Boolean)
    const rows = tableBuffer.slice(2).map(row =>
      row.split('|').map(c => c.trim()).filter(Boolean)
    )
    elements.push(
      <div key={key++} style={{ overflowX: 'auto', margin: '8px 0' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, fontFamily: 'monospace' }}>
          <thead>
            <tr>
              {headers.map((h, i) => (
                <th key={i} style={{ background: '#0f1628', padding: '4px 8px', textAlign: 'left', color: '#94a3b8', borderBottom: '1px solid #1e2d4a', whiteSpace: 'nowrap', fontWeight: 600 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr key={ri} style={{ background: ri % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
                {row.map((cell, ci) => (
                  <td key={ci} style={{ padding: '3px 8px', borderBottom: '1px solid rgba(255,255,255,0.04)', color: '#e2e8f0', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
    tableBuffer = []
    inTable = false
  }

  function renderInline(text) {
    const parts = []
    let remaining = text
    let k = 0

    while (remaining.length > 0) {
      const boldMatch = remaining.match(/\*\*(.+?)\*\*/)
      const codeMatch = remaining.match(/`(.+?)`/)
      const italicMatch = remaining.match(/_(.+?)_/)

      const matches = [
        boldMatch && { match: boldMatch, type: 'bold' },
        codeMatch && { match: codeMatch, type: 'code' },
        italicMatch && { match: italicMatch, type: 'italic' },
      ].filter(Boolean).sort((a, b) => a.match.index - b.match.index)

      if (matches.length === 0) {
        parts.push(<span key={k++}>{remaining}</span>)
        break
      }

      const first = matches[0]
      if (first.match.index > 0) {
        parts.push(<span key={k++}>{remaining.slice(0, first.match.index)}</span>)
      }

      if (first.type === 'bold') {
        parts.push(<strong key={k++} style={{ color: '#06b6d4', fontWeight: 600 }}>{first.match[1]}</strong>)
      } else if (first.type === 'code') {
        parts.push(<code key={k++} style={{ background: '#0f1628', color: '#7dd3fc', padding: '1px 4px', borderRadius: 3, fontSize: '0.9em', fontFamily: 'monospace' }}>{first.match[1]}</code>)
      } else if (first.type === 'italic') {
        parts.push(<em key={k++} style={{ color: '#94a3b8' }}>{first.match[1]}</em>)
      }

      remaining = remaining.slice(first.match.index + first.match[0].length)
    }
    return parts
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    if (line.startsWith('|')) {
      if (!inTable) inTable = true
      tableBuffer.push(line)
      continue
    }

    if (inTable) flushTable()

    if (line.startsWith('# ')) {
      elements.push(<h3 key={key++} style={{ color: '#e2e8f0', fontWeight: 700, fontSize: 14, margin: '8px 0 4px' }}>{line.slice(2)}</h3>)
    } else if (line.startsWith('## ')) {
      elements.push(<h4 key={key++} style={{ color: '#cbd5e1', fontWeight: 600, fontSize: 13, margin: '6px 0 3px' }}>{line.slice(3)}</h4>)
    } else if (line.startsWith('```')) {
      const codeLines = []
      i++
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i])
        i++
      }
      elements.push(
        <pre key={key++} style={{ background: '#080c18', border: '1px solid #1e2d4a', borderRadius: 6, padding: '8px 12px', overflowX: 'auto', margin: '6px 0' }}>
          <code style={{ fontFamily: 'monospace', fontSize: 11, color: '#7dd3fc', whiteSpace: 'pre' }}>{codeLines.join('\n')}</code>
        </pre>
      )
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      elements.push(
        <div key={key++} style={{ display: 'flex', gap: 6, margin: '2px 0' }}>
          <span style={{ color: '#3b82f6', flexShrink: 0 }}>•</span>
          <span>{renderInline(line.slice(2))}</span>
        </div>
      )
    } else if (line.match(/^\d+\. /)) {
      const num = line.match(/^(\d+)\. /)[1]
      elements.push(
        <div key={key++} style={{ display: 'flex', gap: 6, margin: '2px 0' }}>
          <span style={{ color: '#3b82f6', flexShrink: 0, minWidth: 16 }}>{num}.</span>
          <span>{renderInline(line.replace(/^\d+\. /, ''))}</span>
        </div>
      )
    } else if (line.startsWith('---')) {
      elements.push(<hr key={key++} style={{ border: 'none', borderTop: '1px solid #1e2d4a', margin: '8px 0' }} />)
    } else if (line.trim() === '') {
      elements.push(<div key={key++} style={{ height: 4 }} />)
    } else {
      elements.push(<p key={key++} style={{ margin: '3px 0', lineHeight: 1.6 }}>{renderInline(line)}</p>)
    }
  }

  if (inTable) flushTable()

  return <div style={{ fontSize: 13 }}>{elements}</div>
}
