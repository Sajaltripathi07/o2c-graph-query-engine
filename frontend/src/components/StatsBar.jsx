import './StatsBar.css'

const STAT_CONFIG = [
  { key: 'customers', label: 'Customers', icon: '👤', color: '#3b82f6' },
  { key: 'salesOrders', label: 'Orders', icon: '📋', color: '#10b981' },
  { key: 'deliveries', label: 'Deliveries', icon: '🚚', color: '#fb923c' },
  { key: 'billingDocuments', label: 'Billings', icon: '🧾', color: '#f59e0b' },
  { key: 'payments', label: 'Payments', icon: '💳', color: '#f43f5e' },
  { key: 'products', label: 'Products', icon: '📦', color: '#ec4899' },
]

export default function StatsBar({ stats }) {
  if (!stats) return <div className="stats-bar-loading">Loading stats…</div>

  return (
    <div className="stats-bar">
      {STAT_CONFIG.map(({ key, label, icon, color }) => (
        <div key={key} className="stat-item">
          <span className="stat-icon" style={{ color }}>{icon}</span>
          <div className="stat-content">
            <span className="stat-value" style={{ color }}>{stats[key] ?? '—'}</span>
            <span className="stat-label">{label}</span>
          </div>
        </div>
      ))}
    </div>
  )
}
