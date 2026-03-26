const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'o2c.db');

let db;

async function getDb() {
  if (!db) {
    const SQL = await initSqlJs();
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
  }
  return db;
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

function queryGet(db, sql, params = []) {
  const rows = queryAll(db, sql, params);
  return rows.length > 0 ? rows[0] : null;
}

async function buildGraphOverview(limit = 30) {
  const d = await getDb();
  const nodes = [];
  const edges = [];
  const seen = new Set();

  function addNode(id, label, type, data = {}) {
    if (!seen.has(id)) {
      seen.add(id);
      nodes.push({ id, label, type, data });
    }
  }

  const customers = queryAll(d, `SELECT businessPartner, businessPartnerName FROM business_partners LIMIT ?`, [limit]);
  for (const c of customers) {
    addNode(`bp_${c.businessPartner}`, c.businessPartnerName || c.businessPartner, 'Customer', c);
  }

  const orders = queryAll(d, `SELECT salesOrder, soldToParty, totalNetAmount, overallDeliveryStatus, creationDate FROM sales_order_headers LIMIT ?`, [limit]);
  for (const o of orders) {
    addNode(`so_${o.salesOrder}`, `SO ${o.salesOrder}`, 'SalesOrder', o);
    if (seen.has(`bp_${o.soldToParty}`)) {
      edges.push({ source: `bp_${o.soldToParty}`, target: `so_${o.salesOrder}`, label: 'PLACED' });
    }
  }

  const orderIds = orders.map(o => o.salesOrder);
  const placeholders = orderIds.map(() => '?').join(',');
  const items = orderIds.length > 0
    ? queryAll(d, `SELECT salesOrder, salesOrderItem, material, netAmount FROM sales_order_items WHERE salesOrder IN (${placeholders}) LIMIT ?`, [...orderIds, limit * 2])
    : [];

  for (const i of items) {
    const itemId = `soi_${i.salesOrder}_${i.salesOrderItem}`;
    addNode(itemId, `Item ${i.salesOrderItem}`, 'SalesOrderItem', i);
    if (seen.has(`so_${i.salesOrder}`)) {
      edges.push({ source: `so_${i.salesOrder}`, target: itemId, label: 'HAS_ITEM' });
    }
    if (i.material) {
      const prod = queryGet(d, `SELECT product, productDescription FROM product_descriptions WHERE product = ?`, [i.material]);
      if (prod) {
        addNode(`prod_${prod.product}`, prod.productDescription || prod.product, 'Product', prod);
        edges.push({ source: itemId, target: `prod_${prod.product}`, label: 'FOR_PRODUCT' });
      }
    }
  }

  const billings = queryAll(d, `SELECT billingDocument, soldToParty, totalNetAmount, billingDocumentIsCancelled, accountingDocument FROM billing_documents LIMIT ?`, [limit]);
  for (const b of billings) {
    addNode(`bd_${b.billingDocument}`, `BD ${b.billingDocument}`, 'BillingDocument', b);
    if (seen.has(`bp_${b.soldToParty}`)) {
      edges.push({ source: `bp_${b.soldToParty}`, target: `bd_${b.billingDocument}`, label: 'BILLED_TO' });
    }
  }

  const journals = queryAll(d, `SELECT accountingDocument, accountingDocumentItem, referenceDocument, amountInTransactionCurrency, customer FROM journal_entries LIMIT ?`, [limit]);
  for (const j of journals) {
    const jId = `je_${j.accountingDocument}_${j.accountingDocumentItem}`;
    addNode(jId, `JE ${j.accountingDocument}`, 'JournalEntry', j);
    const bd = billings.find(b => b.accountingDocument === j.accountingDocument);
    if (bd && seen.has(`bd_${bd.billingDocument}`)) {
      edges.push({ source: `bd_${bd.billingDocument}`, target: jId, label: 'POSTED_AS' });
    }
  }

  const paymentsData = queryAll(d, `SELECT accountingDocument, accountingDocumentItem, customer, amountInTransactionCurrency, clearingDate FROM payments LIMIT ?`, [limit]);
  for (const p of paymentsData) {
    const pId = `pay_${p.accountingDocument}_${p.accountingDocumentItem}`;
    addNode(pId, `PAY ${p.accountingDocument}`, 'Payment', p);
    const jeMatch = journals.find(j => j.accountingDocument === p.accountingDocument);
    if (jeMatch) {
      const jId = `je_${jeMatch.accountingDocument}_${jeMatch.accountingDocumentItem}`;
      if (seen.has(jId)) {
        edges.push({ source: jId, target: pId, label: 'CLEARED_BY' });
      }
    }
  }

  const deliveries = queryAll(d, `SELECT deliveryDocument, overallGoodsMovementStatus, overallPickingStatus, creationDate FROM outbound_delivery_headers LIMIT ?`, [limit]);
  for (const del of deliveries) {
    addNode(`del_${del.deliveryDocument}`, `DEL ${del.deliveryDocument}`, 'Delivery', del);
  }

  const plantsData = queryAll(d, `SELECT plant, plantName FROM plants LIMIT 10`);
  for (const pl of plantsData) {
    addNode(`plant_${pl.plant}`, pl.plantName || pl.plant, 'Plant', pl);
  }

  for (const i of items) {
    if (i.productionPlant && seen.has(`plant_${i.productionPlant}`)) {
      const itemId = `soi_${i.salesOrder}_${i.salesOrderItem}`;
      if (seen.has(itemId)) {
        edges.push({ source: itemId, target: `plant_${i.productionPlant}`, label: 'PRODUCED_AT' });
      }
    }
  }

  return { nodes, edges };
}

async function getNodeNeighbors(nodeId) {
  const d = await getDb();
  const nodes = [];
  const edges = [];
  const seen = new Set();

  function addNode(id, label, type, data = {}) {
    if (!seen.has(id)) { seen.add(id); nodes.push({ id, label, type, data }); }
  }
  function addEdge(source, target, label) {
    edges.push({ source, target, label });
  }

  const parts = nodeId.split('_');
  const prefix = parts[0];
  const id = parts.slice(1).join('_');

  if (prefix === 'bp') {
    const bp = queryGet(d, `SELECT * FROM business_partners WHERE businessPartner = ?`, [id]);
    if (bp) {
      addNode(nodeId, bp.businessPartnerName, 'Customer', bp);
      const orders = queryAll(d, `SELECT * FROM sales_order_headers WHERE soldToParty = ? LIMIT 20`, [id]);
      for (const o of orders) {
        addNode(`so_${o.salesOrder}`, `SO ${o.salesOrder}`, 'SalesOrder', o);
        addEdge(nodeId, `so_${o.salesOrder}`, 'PLACED');
      }
      const bds = queryAll(d, `SELECT * FROM billing_documents WHERE soldToParty = ? LIMIT 20`, [id]);
      for (const b of bds) {
        addNode(`bd_${b.billingDocument}`, `BD ${b.billingDocument}`, 'BillingDocument', b);
        addEdge(nodeId, `bd_${b.billingDocument}`, 'BILLED_TO');
      }
    }
  } else if (prefix === 'so') {
    const so = queryGet(d, `SELECT * FROM sales_order_headers WHERE salesOrder = ?`, [id]);
    if (so) {
      addNode(nodeId, `SO ${id}`, 'SalesOrder', so);
      const items = queryAll(d, `SELECT * FROM sales_order_items WHERE salesOrder = ?`, [id]);
      for (const i of items) {
        const iId = `soi_${i.salesOrder}_${i.salesOrderItem}`;
        addNode(iId, `Item ${i.salesOrderItem}`, 'SalesOrderItem', i);
        addEdge(nodeId, iId, 'HAS_ITEM');
        if (i.material) {
          const prod = queryGet(d, `SELECT * FROM product_descriptions WHERE product = ?`, [i.material]);
          if (prod) {
            addNode(`prod_${prod.product}`, prod.productDescription || prod.product, 'Product', prod);
            addEdge(iId, `prod_${prod.product}`, 'FOR_PRODUCT');
          }
        }
        if (i.productionPlant) {
          const pl = queryGet(d, `SELECT * FROM plants WHERE plant = ?`, [i.productionPlant]);
          if (pl) {
            addNode(`plant_${pl.plant}`, pl.plantName || pl.plant, 'Plant', pl);
            addEdge(iId, `plant_${pl.plant}`, 'PRODUCED_AT');
          }
        }
      }
      const bp = queryGet(d, `SELECT * FROM business_partners WHERE businessPartner = ?`, [so.soldToParty]);
      if (bp) {
        addNode(`bp_${bp.businessPartner}`, bp.businessPartnerName, 'Customer', bp);
        addEdge(`bp_${bp.businessPartner}`, nodeId, 'PLACED');
      }
    }
  } else if (prefix === 'bd') {
    const bd = queryGet(d, `SELECT * FROM billing_documents WHERE billingDocument = ?`, [id]);
    if (bd) {
      addNode(nodeId, `BD ${id}`, 'BillingDocument', bd);
      const jes = queryAll(d, `SELECT * FROM journal_entries WHERE accountingDocument = ?`, [bd.accountingDocument]);
      for (const j of jes) {
        const jId = `je_${j.accountingDocument}_${j.accountingDocumentItem}`;
        addNode(jId, `JE ${j.accountingDocument}`, 'JournalEntry', j);
        addEdge(nodeId, jId, 'POSTED_AS');
        const pays = queryAll(d, `SELECT * FROM payments WHERE accountingDocument = ?`, [j.accountingDocument]);
        for (const p of pays) {
          const pId = `pay_${p.accountingDocument}_${p.accountingDocumentItem}`;
          addNode(pId, `PAY ${p.accountingDocument}`, 'Payment', p);
          addEdge(jId, pId, 'CLEARED_BY');
        }
      }
      if (bd.soldToParty) {
        const bp = queryGet(d, `SELECT * FROM business_partners WHERE businessPartner = ?`, [bd.soldToParty]);
        if (bp) {
          addNode(`bp_${bp.businessPartner}`, bp.businessPartnerName, 'Customer', bp);
          addEdge(`bp_${bp.businessPartner}`, nodeId, 'BILLED_TO');
        }
      }
    }
  }

  return { nodes, edges };
}

async function getStats() {
  const d = await getDb();
  return {
    customers: queryGet(d, `SELECT COUNT(*) as c FROM business_partners`).c,
    salesOrders: queryGet(d, `SELECT COUNT(*) as c FROM sales_order_headers`).c,
    salesOrderItems: queryGet(d, `SELECT COUNT(*) as c FROM sales_order_items`).c,
    deliveries: queryGet(d, `SELECT COUNT(*) as c FROM outbound_delivery_headers`).c,
    billingDocuments: queryGet(d, `SELECT COUNT(*) as c FROM billing_documents`).c,
    journalEntries: queryGet(d, `SELECT COUNT(*) as c FROM journal_entries`).c,
    payments: queryGet(d, `SELECT COUNT(*) as c FROM payments`).c,
    products: queryGet(d, `SELECT COUNT(*) as c FROM product_descriptions`).c,
    plants: queryGet(d, `SELECT COUNT(*) as c FROM plants`).c,
  };
}

module.exports = { buildGraphOverview, getNodeNeighbors, getStats, getDb };
