# O2C Graph Explorer

A **context graph system with an LLM-powered query interface** for the SAP Order-to-Cash dataset.

![Architecture](https://img.shields.io/badge/Backend-Node.js%20%2B%20Express-green) ![DB](https://img.shields.io/badge/DB-SQLite-blue) ![Frontend](https://img.shields.io/badge/Frontend-React%20%2B%20Cytoscape.js-cyan) ![LLM](https://img.shields.io/badge/LLM-Gemini%201.5%20Flash-yellow)

---

## Quick Start

### 1. Backend

```bash
cd backend
npm install
cp .env.example .env
# Add your Gemini API key to .env
# Get free key at: https://aistudio.google.com/app/apikey

node seed.js       # Loads all JSONL data into SQLite
node server.js     # Starts API on port 3001
```

### 2. Frontend

```bash
cd frontend
npm install
npm run dev        # Starts on http://localhost:3000
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Browser                              │
│  ┌──────────────────────┐  ┌──────────────────────────────┐ │
│  │  Cytoscape.js Graph  │  │      Chat Interface          │ │
│  │  - Node expand       │  │  - Natural language input    │ │
│  │  - Click inspect     │  │  - Markdown results          │ │
│  │  - Highlight nodes   │  │  - SQL disclosure            │ │
│  └──────────┬───────────┘  └──────────────┬───────────────┘ │
└─────────────┼────────────────────────────-┼─────────────────┘
              │ REST API                    │ REST API
┌─────────────▼─────────────────────────────▼─────────────────┐
│                    Express Backend                           │
│  GET /api/graph           - graph overview (sampled)        │
│  GET /api/graph/expand/:id - neighbor expansion             │
│  GET /api/stats           - entity counts                   │
│  POST /api/chat           - NL → SQL → answer pipeline      │
└───────────┬──────────────────────────┬───────────────────────┘
            │                          │
┌───────────▼──────────┐  ┌───────────▼───────────────────────┐
│     SQLite (o2c.db)  │  │     Gemini 2.5 Flash API          │
│  11 normalized tables│  │  - Schema-aware system prompt     │
│  indexed FK columns  │  │  - Returns {sql, explanation}     │
│  ~17k total rows     │  │  - Second call: result summary    │
└──────────────────────┘  └───────────────────────────────────┘
```

---

## Graph Model

### Nodes

| Type | Source Table | Color |
|------|-------------|-------|
| Customer | business_partners | Blue |
| SalesOrder | sales_order_headers | Green |
| SalesOrderItem | sales_order_items | Cyan |
| BillingDocument | billing_documents | Amber |
| JournalEntry | journal_entries | Purple |
| Payment | payments | Rose |
| Product | product_descriptions | Pink |
| Plant | plants | Lime |
| Delivery | outbound_delivery_headers | Orange |

### Edges (Relationships)

| Edge | Meaning |
|------|---------|
| Customer → SalesOrder | PLACED |
| SalesOrder → SalesOrderItem | HAS_ITEM |
| SalesOrderItem → Product | FOR_PRODUCT |
| SalesOrderItem → Plant | PRODUCED_AT |
| Customer → BillingDocument | BILLED_TO |
| BillingDocument → JournalEntry | POSTED_AS |
| JournalEntry → Payment | CLEARED_BY |

---

## LLM Prompting Strategy

1. **System prompt** contains the full SQLite schema with column names, types, key relationships, and domain notes (e.g., status code meanings like `overallDeliveryStatus: C=Complete`)
2. LLM is instructed to respond **only** with `{"sql": "...", "explanation": "..."}` — no prose, no markdown
3. The generated SQL is executed against SQLite
4. A **second LLM call** summarizes the result rows in plain English (max 150 words)
5. Both the summary and raw data table are returned to the frontend

---

## Guardrails

Two-layer approach:

**Layer 1 — Keyword pre-filter (server.js)**
Before calling Gemini, a regex check flags obviously off-topic queries (poems, jokes, code, capital cities, etc.) and returns a fixed refusal without spending an API call.

**Layer 2 — LLM system prompt**
The system prompt explicitly instructs Gemini to return `"OUT_OF_SCOPE"` in the explanation field for non-domain queries. The backend checks for this prefix and returns the standard refusal message.

**SQL safety**
- Only `SELECT` statements are permitted — DML/DDL is regex-blocked before execution
- Query results are limited to 50 rows maximum

---

## Database Choice: SQLite

| Decision | Rationale |
|----------|-----------|
| SQLite over Neo4j | Zero setup, embedded, no server — dataset fits in one 2MB file |
| SQLite over PostgreSQL | Same as above — no provisioning needed, ships with the repo |
| Why not graph DB? | LLMs generate SQL naturally; Cypher adds complexity with no real benefit for this dataset size. The graph *visualization* is on the frontend with Cytoscape.js |
| Indexes on FK columns | soldToParty, material, accountingDocument — covers all join patterns the LLM generates |

---

## Features

- **Graph visualization** with Cytoscape.js — cola physics layout, zoom/pan, node inspection
- **Click to inspect** — node metadata panel with formatted field display
- **Double-click to expand** — dynamically loads neighbor nodes from the API
- **Node highlighting** — when the chat returns results with recognizable IDs, those nodes glow in the graph
- **Conversation memory** — last 6 message pairs sent as context to Gemini
- **SQL transparency** — every answer includes a collapsible "View generated SQL" block
- **Suggested queries** — pre-built example questions shown on first load

---

## Example Queries

- *Which products are associated with the highest number of billing documents?*
- *Trace the full flow of billing document 90504274*
- *Which sales orders have been delivered but not billed?*
- *Show me the top 5 customers by total order value*
- *What is the total payment amount by customer?*
- *Which billing documents are cancelled?*

---


