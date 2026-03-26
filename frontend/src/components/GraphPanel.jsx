import { useEffect, useRef, useCallback } from 'react'
import cytoscape from 'cytoscape'
import './GraphPanel.css'

const NODE_COLORS = {
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

const NODE_SIZES = {
  Customer: 52,
  SalesOrder: 42,
  SalesOrderItem: 30,
  BillingDocument: 40,
  JournalEntry: 32,
  Payment: 34,
  Product: 30,
  Plant: 36,
  Delivery: 38,
}

const NODE_SHAPES = {
  Customer: 'ellipse',
  SalesOrder: 'rectangle',
  SalesOrderItem: 'round-rectangle',
  BillingDocument: 'diamond',
  JournalEntry: 'hexagon',
  Payment: 'star',
  Product: 'ellipse',
  Plant: 'triangle',
  Delivery: 'barrel',
}

function buildCytoscapeElements(data) {
  const elements = []
  for (const n of data.nodes) {
    elements.push({
      group: 'nodes',
      data: {
        id: n.id,
        label: n.label,
        type: n.type,
        raw: n.data,
        color: NODE_COLORS[n.type] || '#6b7280',
        size: NODE_SIZES[n.type] || 34,
        shape: NODE_SHAPES[n.type] || 'ellipse',
      }
    })
  }
  for (const e of data.edges) {
    elements.push({
      group: 'edges',
      data: {
        id: `${e.source}-${e.target}-${e.label}`,
        source: e.source,
        target: e.target,
        label: e.label,
      }
    })
  }
  return elements
}

function getCytoscapeStyle() {
  return [
    {
      selector: 'node',
      style: {
        'background-color': 'data(color)',
        'label': 'data(label)',
        'width': 'data(size)',
        'height': 'data(size)',
        'shape': 'data(shape)',
        'font-size': '9px',
        'font-family': 'Inter, sans-serif',
        'font-weight': '500',
        'color': '#e2e8f0',
        'text-valign': 'bottom',
        'text-halign': 'center',
        'text-margin-y': '4px',
        'text-wrap': 'ellipsis',
        'text-max-width': '80px',
        'border-width': '2px',
        'border-color': 'data(color)',
        'border-opacity': 0.4,
        'background-opacity': 0.9,
        'overlay-opacity': 0,
        'transition-property': 'border-width, border-opacity, background-opacity',
        'transition-duration': '0.15s',
      }
    },
    {
      selector: 'node:selected',
      style: {
        'border-width': '3px',
        'border-opacity': 1,
        'background-opacity': 1,
        'overlay-opacity': 0,
      }
    },
    {
      selector: 'node.highlighted',
      style: {
        'border-width': '4px',
        'border-color': '#fbbf24',
        'border-opacity': 1,
        'background-opacity': 1,
      }
    },
    {
      selector: 'node.dimmed',
      style: {
        'background-opacity': 0.2,
        'border-opacity': 0.1,
        'color': '#475569',
      }
    },
    {
      selector: 'edge',
      style: {
        'width': 1.5,
        'line-color': '#1e3a5f',
        'target-arrow-color': '#1e3a5f',
        'target-arrow-shape': 'triangle',
        'curve-style': 'bezier',
        'label': 'data(label)',
        'font-size': '8px',
        'font-family': 'Inter, sans-serif',
        'color': '#475569',
        'text-background-color': '#0a0e1a',
        'text-background-opacity': 0.8,
        'text-background-padding': '2px',
        'edge-text-rotation': 'autorotate',
        'overlay-opacity': 0,
        'opacity': 0.7,
      }
    },
    {
      selector: 'edge:selected',
      style: {
        'line-color': '#3b82f6',
        'target-arrow-color': '#3b82f6',
        'opacity': 1,
        'width': 2.5,
      }
    },
    {
      selector: 'edge.dimmed',
      style: { 'opacity': 0.05 }
    },
  ]
}

const COSE_LAYOUT = {
  name: 'cose',
  animate: true,
  animationDuration: 1000,
  randomize: true,
  nodeRepulsion: () => 8000,
  nodeOverlap: 20,
  idealEdgeLength: () => 100,
  edgeElasticity: () => 100,
  nestingFactor: 5,
  gravity: 80,
  numIter: 1000,
  initialTemp: 200,
  coolingFactor: 0.95,
  minTemp: 1.0,
  fit: true,
  padding: 40,
}

export default function GraphPanel({ data, onNodeSelect, onNodeExpand, highlightedNodes }) {
  const containerRef = useRef(null)
  const cyRef = useRef(null)

  useEffect(() => {
    if (!containerRef.current) return

    const cy = cytoscape({
      container: containerRef.current,
      elements: buildCytoscapeElements(data),
      style: getCytoscapeStyle(),
      layout: COSE_LAYOUT,
      wheelSensitivity: 0.3,
      minZoom: 0.1,
      maxZoom: 4,
    })

    cy.on('tap', 'node', function(evt) {
      const node = evt.target
      const nodeData = node.data()
      onNodeSelect({ id: nodeData.id, label: nodeData.label, type: nodeData.type, data: nodeData.raw })
      cy.elements().removeClass('dimmed')
      const neighborhood = node.closedNeighborhood()
      cy.elements().not(neighborhood).addClass('dimmed')
    })

    cy.on('tap', function(evt) {
      if (evt.target === cy) {
        cy.elements().removeClass('dimmed')
        onNodeSelect(null)
      }
    })

    cy.on('dblclick', 'node', function(evt) {
      const nodeId = evt.target.id()
      onNodeExpand(nodeId)
    })

    cyRef.current = cy
    return () => { cy.destroy(); cyRef.current = null }
  }, [])

  useEffect(() => {
    const cy = cyRef.current
    if (!cy) return

    const existingIds = new Set(cy.nodes().map(n => n.id()))
    const newElements = []

    for (const n of data.nodes) {
      if (!existingIds.has(n.id)) {
        newElements.push({
          group: 'nodes',
          data: {
            id: n.id, label: n.label, type: n.type, raw: n.data,
            color: NODE_COLORS[n.type] || '#6b7280',
            size: NODE_SIZES[n.type] || 34,
            shape: NODE_SHAPES[n.type] || 'ellipse',
          }
        })
      }
    }

    const existingEdgeKeys = new Set(cy.edges().map(e => e.id()))
    for (const e of data.edges) {
      const eid = `${e.source}-${e.target}-${e.label}`
      if (!existingEdgeKeys.has(eid)) {
        const srcExists = cy.getElementById(e.source).length > 0
        const tgtExists = cy.getElementById(e.target).length > 0
        if (srcExists && tgtExists) {
          newElements.push({
            group: 'edges',
            data: { id: eid, source: e.source, target: e.target, label: e.label }
          })
        }
      }
    }

    if (newElements.length > 0) {
      cy.add(newElements)
      cy.layout({ ...COSE_LAYOUT, randomize: false, fit: false }).run()
    }
  }, [data])

  useEffect(() => {
    const cy = cyRef.current
    if (!cy) return
    cy.nodes().removeClass('highlighted')
    if (highlightedNodes && highlightedNodes.length > 0) {
      for (const id of highlightedNodes) {
        cy.getElementById(id).addClass('highlighted')
      }
    }
  }, [highlightedNodes])

  const fitGraph = useCallback(() => {
    cyRef.current?.fit(undefined, 40)
  }, [])

  const resetLayout = useCallback(() => {
    cyRef.current?.layout({ ...COSE_LAYOUT, randomize: true }).run()
  }, [])

  return (
    <div className="graph-panel">
      <div className="graph-controls">
        <button onClick={fitGraph} title="Fit all nodes">⊡ Fit</button>
        <button onClick={resetLayout} title="Randomize layout">↺ Re-layout</button>
        <span className="graph-hint">Click node to inspect · Double-click to expand · Scroll to zoom</span>
      </div>
      <div ref={containerRef} className="cytoscape-container" />
    </div>
  )
}
