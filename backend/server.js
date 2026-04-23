require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const { buildGraphOverview, getNodeNeighbors, getStats, getDb } = require('./graph');
const { SYSTEM_PROMPT } = require('./prompt');

const app = express();

app.use(cors({
  origin: [
    "http://localhost:3000",
    "https://o2c-graph-query-engine.vercel.app"
  ],
  credentials: true
}));

app.use(express.json());

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const GEMINI_MODELS = [
  "gemini-2.5-flash",
  "gemini-1.5-flash",
  "gemini-1.5-pro"
];

async function retry(fn, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i === retries - 1) throw e;
      await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
  }
}

async function callGemini(userQuery, conversationHistory = []) {
  const messages = [
    { role: "user", parts: [{ text: SYSTEM_PROMPT }] },
    ...conversationHistory.slice(-6).map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    })),
    { role: "user", parts: [{ text: userQuery }] }
  ];

  const body = {
    contents: messages,
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 1000
    }
  };

  for (const model of GEMINI_MODELS) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${GEMINI_API_KEY}`;

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        timeout: 10000
      });

      if (!res.ok) {
        const errText = await res.text();
        if (res.status === 503) continue;
        throw new Error(`Gemini API error (${res.status}): ${errText}`);
      }

      const data = await res.json();
      return data?.candidates?.[0]?.content?.parts?.[0]?.text || '';

    } catch (err) {
      if (model === GEMINI_MODELS[GEMINI_MODELS.length - 1]) throw err;
    }
  }
}

function isBillingFlowQuery(query) {
  const q = query.toLowerCase();
  return q.includes("billing") && (q.includes("flow") || q.includes("trace"));
}

function extractBillingId(query) {
  const match = query.match(/\b\d{6,}\b/);
  return match ? match[0] : null;
}

function buildBillingFlowSQL(billingId) {
  return `
SELECT
  b.billingDocument,
  b.billingDocumentType,
  b.creationDate AS billingDate,
  b.totalNetAmount,
  b.transactionCurrency,
  b.accountingDocument,
  j.glAccount,
  j.amountInTransactionCurrency AS journalAmount,
  j.postingDate,
  p.amountInTransactionCurrency AS paymentAmount,
  p.clearingDate
FROM billing_documents b
LEFT JOIN journal_entries j
  ON b.accountingDocument = j.accountingDocument
LEFT JOIN payments p
  ON j.accountingDocument = p.accountingDocument
WHERE b.billingDocument = '${billingId}'
LIMIT 50;
`;
}

const OFF_TOPIC_PATTERNS = [
  /\b(poem|story|joke|recipe|weather|capital of|president of|who is|wikipedia|football|cricket|movie|song|lyrics|code|python|javascript|html|css|sql injection|drop table|delete from|truncate)\b/i,
  /\b(what is [a-z]+ [a-z]+|how do i|tell me about [^o])\b/i,
];

function isOffTopic(query) {
  const lower = query.toLowerCase();
  if (
    lower.includes('order') || lower.includes('billing') || lower.includes('delivery') ||
    lower.includes('payment') || lower.includes('customer') || lower.includes('product') ||
    lower.includes('invoice') || lower.includes('sales') || lower.includes('journal') ||
    lower.includes('plant') || lower.includes('material') || lower.includes('flow') ||
    lower.includes('amount') || lower.includes('status') || lower.includes('document')
  ) {
    return false;
  }
  return OFF_TOPIC_PATTERNS.some(p => p.test(query));
}

function queryAll(db, sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

async function executeQuery(sql) {
  const forbidden = /^\s*(drop|delete|insert|update|alter|create|truncate)/i;
  if (forbidden.test(sql)) throw new Error('Only SELECT queries are allowed');
  const db = await getDb();
  return queryAll(db, sql);
}

function formatResults(rows) {
  if (!rows || rows.length === 0) return 'No results found.';
  if (rows.length === 1) {
    return Object.entries(rows[0]).map(([k, v]) => `**${k}:** ${v}`).join('\n');
  }
  const cols = Object.keys(rows[0]);
  const header = '| ' + cols.join(' | ') + ' |';
  const sep = '| ' + cols.map(() => '---').join(' | ') + ' |';
  const body = rows.slice(0, 25)
    .map(r => '| ' + cols.map(c => String(r[c] ?? '')).join(' | ') + ' |')
    .join('\n');
  const extra = rows.length > 25 ? `\n_...and ${rows.length - 25} more rows_` : '';
  return `${header}\n${sep}\n${body}${extra}\n\n_${rows.length} record(s)_`;
}

app.get('/api/graph', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 30;
    res.json(await buildGraphOverview(limit));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/graph/expand/:nodeId', async (req, res) => {
  try {
    res.json(await getNodeNeighbors(req.params.nodeId));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/stats', async (req, res) => {
  try {
    res.json(await getStats());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/chat', async (req, res) => {
  const { query, history = [] } = req.body;

  if (!query?.trim()) {
    return res.status(400).json({ error: 'Query required' });
  }

  if (isOffTopic(query)) {
    return res.json({
      answer: 'This system only supports SAP O2C queries.',
      sql: null,
      rows: null,
      outOfScope: true
    });
  }

  if (isBillingFlowQuery(query)) {
    const billingId = extractBillingId(query);

    if (!billingId) {
      return res.json({
        answer: "Please provide a valid billing document number.",
        sql: null,
        rows: null
      });
    }

    try {
      const sql = buildBillingFlowSQL(billingId);
      const rows = await executeQuery(sql);

      const answer = `Billing Flow for Document ${billingId}:\n\n- Billing → Accounting (journal entries)\n- Accounting → Payments\n\nUpstream sales order / delivery data is not available in this dataset.\n\n${formatResults(rows)}`;

      return res.json({
        answer,
        sql,
        rows: rows.slice(0, 50)
      });

    } catch (err) {
      return res.json({
        answer: `Failed to fetch billing flow: ${err.message}`,
        sql: null,
        rows: null
      });
    }
  }

  try {
    const raw = await retry(() => callGemini(query, history));

    let parsed;
    try {
      const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      parsed = JSON.parse(cleaned);
    } catch {
      return res.json({ answer: raw, sql: null, rows: null });
    }

    if (!parsed.sql) {
      return res.json({
        answer: parsed.explanation || raw || 'No SQL generated.',
        sql: null,
        rows: null
      });
    }

    let rows = [];
    let answer = parsed.explanation || '';

    try {
      rows = await executeQuery(parsed.sql);

      const summaryPrompt = `
User question: "${query}"
Data:
${JSON.stringify(rows.slice(0, 10), null, 2)}

Give a short insight (max 100 words).
`;

      const summary = await retry(() => callGemini(summaryPrompt));
      answer = summary + '\n\n' + formatResults(rows);

    } catch (err) {
      answer = `SQL failed: ${err.message}\n\n${parsed.sql}`;
    }

    res.json({ answer, sql: parsed.sql, rows: rows.slice(0, 50) });

  } catch (e) {
    res.status(500).json({
      error: "AI service temporarily unavailable. Please retry."
    });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
