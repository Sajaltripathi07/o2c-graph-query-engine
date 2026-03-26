import { useState, useEffect, useCallback } from 'react'
import GraphPanel from './components/GraphPanel.jsx'
import ChatPanel from './components/ChatPanel.jsx'
import StatsBar from './components/StatsBar.jsx'
import NodeInspector from './components/NodeInspector.jsx'
import './App.css'

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'

export default function App() {
  const [graphData, setGraphData] = useState({ nodes: [], edges: [] })
  const [stats, setStats] = useState(null)
  const [selectedNode, setSelectedNode] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [highlightedNodes, setHighlightedNodes] = useState([])
  const [chatOpen, setChatOpen] = useState(true)

  useEffect(() => {
    Promise.all([
      fetch(`${API}/graph?limit=25`).then(r => {
        if (!r.ok) throw new Error(`Graph API error: ${r.status}`)
        return r.json()
      }),
      fetch(`${API}/stats`).then(r => {
        if (!r.ok) throw new Error(`Stats API error: ${r.status}`)
        return r.json()
      })
    ]).then(([graph, st]) => {
      setGraphData(graph)
      setStats(st)
      setLoading(false)
    }).catch(err => {
      console.error('API error:', err)
      setError(err.message)
      setLoading(false)
    })
  }, [])

  const expandNode = useCallback(async (nodeId) => {
    try {
      const res = await fetch(`${API}/graph/expand/${encodeURIComponent(nodeId)}`)
      const data = await res.json()
      setGraphData(prev => {
        const existingNodeIds = new Set(prev.nodes.map(n => n.id))
        const existingEdgeKeys = new Set(prev.edges.map(e => `${e.source}-${e.target}-${e.label}`))
        const newNodes = data.nodes.filter(n => !existingNodeIds.has(n.id))
        const newEdges = data.edges.filter(e => !existingEdgeKeys.has(`${e.source}-${e.target}-${e.label}`))
        return {
          nodes: [...prev.nodes, ...newNodes],
          edges: [...prev.edges, ...newEdges]
        }
      })
    } catch (e) {
      console.error('Expand failed', e)
    }
  }, [])

  if (error) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', flexDirection: 'column', gap: 16, color: '#e2e8f0', background: '#0a0e1a' }}>
        <div style={{ fontSize: 32 }}>⚠️</div>
        <div style={{ fontSize: 16, fontWeight: 600 }}>Cannot connect to backend</div>
        <div style={{ fontSize: 13, color: '#94a3b8', maxWidth: 400, textAlign: 'center' }}>{error}</div>
        <div style={{ fontSize: 12, color: '#64748b', background: '#141d35', padding: '12px 20px', borderRadius: 8, fontFamily: 'monospace' }}>
          Make sure backend is running:<br />
          cd backend && node server.js
        </div>
        <button onClick={() => window.location.reload()} style={{ background: '#3b82f6', border: 'none', color: 'white', padding: '8px 20px', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}>
          Retry
        </button>
      </div>
    )
  }

  return (
    <div className="app-layout">
      <header className="app-header">
        <div className="header-left">
          <div className="logo">
            <span className="logo-icon">⬡</span>
            <span className="logo-text">O2C <span className="logo-accent">Graph</span></span>
          </div>
          <span className="header-subtitle">SAP Order-to-Cash Intelligence</span>
        </div>
        <StatsBar stats={stats} />
        <div className="header-right">
          <button className="toggle-chat" onClick={() => setChatOpen(v => !v)}>
            {chatOpen ? '◀ Hide Chat' : '▶ Show Chat'}
          </button>
        </div>
      </header>

      <div className="main-area">
        <div className={`graph-area ${!chatOpen ? 'full-width' : ''}`}>
          {loading ? (
            <div className="loading-state">
              <div className="spinner" />
              <p>Loading graph data…</p>
            </div>
          ) : (
            <GraphPanel
              data={graphData}
              onNodeSelect={setSelectedNode}
              onNodeExpand={expandNode}
              highlightedNodes={highlightedNodes}
            />
          )}
          {selectedNode && (
            <NodeInspector node={selectedNode} onClose={() => setSelectedNode(null)} />
          )}
        </div>

        {chatOpen && (
          <div className="chat-area">
            <ChatPanel
              apiUrl={API}
              onHighlightNodes={setHighlightedNodes}
            />
          </div>
        )}
      </div>

      <div className="legend">
        {[
          ['Customer', '#3b82f6'],
          ['SalesOrder', '#10b981'],
          ['SalesOrderItem', '#06b6d4'],
          ['BillingDocument', '#f59e0b'],
          ['JournalEntry', '#8b5cf6'],
          ['Payment', '#f43f5e'],
          ['Product', '#ec4899'],
          ['Plant', '#84cc16'],
          ['Delivery', '#fb923c'],
        ].map(([label, color]) => (
          <div key={label} className="legend-item">
            <span className="legend-dot" style={{ background: color }} />
            <span>{label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
