import './NodeInspector.css'

const TYPE_ICONS = {
  Customer: '👤',
  SalesOrder: '📋',
  SalesOrderItem: '📌',
  BillingDocument: '🧾',
  JournalEntry: '📒',
  Payment: '💳',
  Product: '📦',
  Plant: '🏭',
  Delivery: '🚚',
}

const TYPE_COLORS = {
  Customer: '#3b82f6',
  SalesOrder: '#10b981',
  SalesOrderItem: '#06b6d4',
  BillingDocument: '#f59e0b',
  JournalEntry: '#8b5cf6',
  Payment: '#f43f5e',
  Product: '#ec4899',
  Plant: '#84cc16',
  Delivery: '#fb923c',
}

function formatKey(key) {
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase()).trim()
}

function formatValue(val) {
  if (val === null || val === undefined || val === '') return <span style={{ color: 'var(--text-muted)' }}>—</span>
  if (typeof val === 'object') return <span style={{ fontFamily: 'monospace', fontSize: '11px' }}>{JSON.stringify(val)}</span>
  if (String(val) === '0' || String(val) === '1') {
    const bool = val === 1 || val === '1' || val === true
    return <span style={{ color: bool ? '#f43f5e' : '#10b981' }}>{bool ? 'Yes' : 'No'}</span>
  }
  if (String(val).match(/^\d{4}-\d{2}-\d{2}T/)) {
    return new Date(val).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  }
  return String(val)
}

const SKIP_KEYS = ['id', 'label', 'type', 'color', 'size', 'shape', 'raw']

export default function NodeInspector({ node, onClose }) {
  if (!node) return null

  const color = TYPE_COLORS[node.type] || '#6b7280'
  const icon = TYPE_ICONS[node.type] || '●'
  const dataEntries = Object.entries(node.data || {}).filter(([k]) => !SKIP_KEYS.includes(k) && k !== 'businessPartnerIsBlocked' || true).filter(([k]) => !SKIP_KEYS.includes(k))

  return (
    <div className="node-inspector">
      <div className="inspector-header" style={{ borderLeftColor: color }}>
        <div className="inspector-type">
          <span className="inspector-icon">{icon}</span>
          <span className="inspector-type-label" style={{ color }}>{node.type}</span>
        </div>
        <button className="inspector-close" onClick={onClose}>✕</button>
      </div>
      <div className="inspector-title">{node.label}</div>
      <div className="inspector-id">ID: {node.id}</div>

      <div className="inspector-fields">
        {dataEntries.length === 0 && (
          <p className="no-fields">No additional properties</p>
        )}
        {dataEntries.map(([k, v]) => (
          <div key={k} className="inspector-field">
            <span className="field-key">{formatKey(k)}</span>
            <span className="field-val">{formatValue(v)}</span>
          </div>
        ))}
      </div>

      <div className="inspector-hint">
        Double-click node in graph to expand neighbors
      </div>
    </div>
  )
}
