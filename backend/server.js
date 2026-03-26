require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const { buildGraphOverview, getNodeNeighbors, getStats, getDb } = require('./graph');
const { SYSTEM_PROMPT } = require('./prompt');

const app = express();
app.use(cors());
app.use(express.json());

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

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

// ✅ FIXED GEMINI CALL
async function callGemini(userQuery, conversationHistory = []) {
  const messages = [
    {
      role: "user",
      parts: [{ text: SYSTEM_PROMPT }]
    },
    ...conversationHistory.slice(-6).map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    })),
    {
      role: "user",
      parts: [{ text: userQuery }]
    }
  ];

  const body = {
    contents: messages,
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 1000
    }
  };

  const res = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini API error: ${err}`);
  }

  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
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
  const d = await getDb();
  return queryAll(d, sql);
}

function formatResults(rows) {
  if (!rows || rows.length === 0) return 'No results found for this query.';
  if (rows.length === 1) {
    const entries = Object.entries(rows[0]);
    if (entries.length === 1) return `**${entries[0][0]}:** ${entries[0][1]}`;
    return entries.map(([k, v]) => `**${k}:** ${v}`).join('\n');
  }
  const cols = Object.keys(rows[0]);
  const header = '| ' + cols.join(' | ') + ' |';
  const sep = '| ' + cols.map(() => '---').join(' | ') + ' |';
  const rowsStr = rows.slice(0, 25)
    .map(r => '| ' + cols.map(c => String(r[c] ?? '')).join(' | ') + ' |')
    .join('\n');
  const extra = rows.length > 25 ? `\n_...and ${rows.length - 25} more rows_` : '';
  return `${header}\n${sep}\n${rowsStr}${extra}\n\n_${rows.length} record(s) found_`;
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
      answer: 'This system is designed to answer SAP Order-to-Cash questions only.',
      sql: null,
      rows: null,
      outOfScope: true
    });
  }

  try {
    const raw = await callGemini(query, history);

    let parsed;
    try {
      const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      parsed = JSON.parse(cleaned);
    } catch {
      return res.json({ answer: raw, sql: null, rows: null });
    }

    if (!parsed.sql) {
      return res.json({
        answer: 'Could not generate SQL for this query.',
        sql: null,
        rows: null
      });
    }

    let rows = [];
    let answer = parsed.explanation || '';

    try {
      rows = await executeQuery(parsed.sql);
      const resultStr = formatResults(rows);

      const summaryPrompt = `
User question: "${query}"
Data:
${JSON.stringify(rows.slice(0, 10), null, 2)}

Give a short insight (max 100 words).
`;

      const summary = await callGemini(summaryPrompt);

      answer = summary + '\n\n' + resultStr;

    } catch (err) {
      answer = `SQL execution failed: ${err.message}\n\n${parsed.sql}`;
    }

    res.json({ answer, sql: parsed.sql, rows: rows.slice(0, 50) });

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});