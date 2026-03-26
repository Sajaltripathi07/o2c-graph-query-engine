const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'o2c.db');

function readJsonl(dir) {
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.jsonl'));
  const rows = [];
  for (const f of files) {
    const lines = fs.readFileSync(path.join(dir, f), 'utf8').trim().split('\n');
    for (const line of lines) {
      if (line.trim()) rows.push(JSON.parse(line));
    }
  }
  return rows;
}

function safe(val) {
  if (val === null || val === undefined) return null;
  if (typeof val === 'object') return JSON.stringify(val);
  return String(val);
}

async function main() {
  const SQL = await initSqlJs();
  const db = new SQL.Database();

  db.run(`PRAGMA journal_mode = WAL;`);
  db.run(`PRAGMA foreign_keys = ON;`);

  db.run(`
CREATE TABLE IF NOT EXISTS business_partners (
  businessPartner TEXT PRIMARY KEY,
  customer TEXT,
  businessPartnerFullName TEXT,
  businessPartnerName TEXT,
  businessPartnerCategory TEXT,
  businessPartnerGrouping TEXT,
  industry TEXT,
  creationDate TEXT,
  lastChangeDate TEXT,
  businessPartnerIsBlocked INTEGER,
  isMarkedForArchiving INTEGER
);

CREATE TABLE IF NOT EXISTS plants (
  plant TEXT PRIMARY KEY,
  plantName TEXT,
  salesOrganization TEXT,
  distributionChannel TEXT,
  division TEXT,
  addressId TEXT,
  factoryCalendar TEXT,
  isMarkedForArchiving INTEGER
);

CREATE TABLE IF NOT EXISTS product_descriptions (
  product TEXT PRIMARY KEY,
  language TEXT,
  productDescription TEXT
);

CREATE TABLE IF NOT EXISTS sales_order_headers (
  salesOrder TEXT PRIMARY KEY,
  salesOrderType TEXT,
  salesOrganization TEXT,
  distributionChannel TEXT,
  soldToParty TEXT,
  creationDate TEXT,
  createdByUser TEXT,
  lastChangeDateTime TEXT,
  totalNetAmount REAL,
  overallDeliveryStatus TEXT,
  overallOrdReltdBillgStatus TEXT,
  transactionCurrency TEXT,
  requestedDeliveryDate TEXT,
  headerBillingBlockReason TEXT,
  deliveryBlockReason TEXT,
  incotermsClassification TEXT,
  incotermsLocation1 TEXT,
  customerPaymentTerms TEXT
);

CREATE TABLE IF NOT EXISTS sales_order_items (
  salesOrder TEXT,
  salesOrderItem TEXT,
  salesOrderItemCategory TEXT,
  material TEXT,
  requestedQuantity REAL,
  requestedQuantityUnit TEXT,
  netAmount REAL,
  materialGroup TEXT,
  productionPlant TEXT,
  storageLocation TEXT,
  salesDocumentRjcnReason TEXT,
  itemBillingBlockReason TEXT,
  PRIMARY KEY (salesOrder, salesOrderItem)
);

CREATE TABLE IF NOT EXISTS outbound_delivery_headers (
  deliveryDocument TEXT PRIMARY KEY,
  creationDate TEXT,
  deliveryBlockReason TEXT,
  overallGoodsMovementStatus TEXT,
  overallPickingStatus TEXT,
  hdrGeneralIncompletionStatus TEXT,
  headerBillingBlockReason TEXT,
  actualGoodsMovementDate TEXT,
  shippingPoint TEXT
);

CREATE TABLE IF NOT EXISTS billing_documents (
  billingDocument TEXT PRIMARY KEY,
  billingDocumentType TEXT,
  creationDate TEXT,
  billingDocumentDate TEXT,
  billingDocumentIsCancelled INTEGER,
  cancelledBillingDocument TEXT,
  totalNetAmount REAL,
  transactionCurrency TEXT,
  companyCode TEXT,
  fiscalYear TEXT,
  accountingDocument TEXT,
  soldToParty TEXT
);

CREATE TABLE IF NOT EXISTS journal_entries (
  accountingDocument TEXT,
  accountingDocumentItem TEXT,
  companyCode TEXT,
  fiscalYear TEXT,
  glAccount TEXT,
  referenceDocument TEXT,
  profitCenter TEXT,
  transactionCurrency TEXT,
  amountInTransactionCurrency REAL,
  postingDate TEXT,
  documentDate TEXT,
  accountingDocumentType TEXT,
  customer TEXT,
  financialAccountType TEXT,
  clearingDate TEXT,
  clearingAccountingDocument TEXT,
  PRIMARY KEY (accountingDocument, accountingDocumentItem)
);

CREATE TABLE IF NOT EXISTS payments (
  accountingDocument TEXT,
  accountingDocumentItem TEXT,
  companyCode TEXT,
  fiscalYear TEXT,
  clearingDate TEXT,
  clearingAccountingDocument TEXT,
  amountInTransactionCurrency REAL,
  transactionCurrency TEXT,
  customer TEXT,
  postingDate TEXT,
  glAccount TEXT,
  profitCenter TEXT,
  PRIMARY KEY (accountingDocument, accountingDocumentItem)
);

CREATE TABLE IF NOT EXISTS customer_sales_areas (
  customer TEXT,
  salesOrganization TEXT,
  distributionChannel TEXT,
  division TEXT,
  currency TEXT,
  customerPaymentTerms TEXT,
  shippingCondition TEXT,
  incotermsClassification TEXT,
  incotermsLocation1 TEXT,
  PRIMARY KEY (customer, salesOrganization, distributionChannel, division)
);

CREATE TABLE IF NOT EXISTS product_storage_locations (
  product TEXT,
  plant TEXT,
  storageLocation TEXT,
  PRIMARY KEY (product, plant, storageLocation)
);

CREATE INDEX IF NOT EXISTS idx_soi_material ON sales_order_items(material);
CREATE INDEX IF NOT EXISTS idx_soi_salesorder ON sales_order_items(salesOrder);
CREATE INDEX IF NOT EXISTS idx_soh_soldto ON sales_order_headers(soldToParty);
CREATE INDEX IF NOT EXISTS idx_billing_soldto ON billing_documents(soldToParty);
CREATE INDEX IF NOT EXISTS idx_billing_accounting ON billing_documents(accountingDocument);
CREATE INDEX IF NOT EXISTS idx_je_reference ON journal_entries(referenceDocument);
CREATE INDEX IF NOT EXISTS idx_je_customer ON journal_entries(customer);
CREATE INDEX IF NOT EXISTS idx_payments_customer ON payments(customer);
  `);

  function seedTable(tableName, rows, sql, paramsFn) {
    const stmt = db.prepare(sql);
    for (const row of rows) {
      stmt.run(paramsFn(row));
    }
    stmt.free();
    console.log(`Seeded ${rows.length} rows into ${tableName}`);
  }

  const DATA = path.join(__dirname, 'data');

  const bpRows = readJsonl(path.join(DATA, 'business_partners'));
  seedTable('business_partners', bpRows,
    `INSERT OR REPLACE INTO business_partners VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    r => [
      safe(r.businessPartner), safe(r.customer), safe(r.businessPartnerFullName),
      safe(r.businessPartnerName), safe(r.businessPartnerCategory), safe(r.businessPartnerGrouping),
      safe(r.industry), safe(r.creationDate), safe(r.lastChangeDate),
      r.businessPartnerIsBlocked ? 1 : 0, r.isMarkedForArchiving ? 1 : 0
    ]
  );

  const plantRows = readJsonl(path.join(DATA, 'plants'));
  seedTable('plants', plantRows,
    `INSERT OR REPLACE INTO plants VALUES (?,?,?,?,?,?,?,?)`,
    r => [
      safe(r.plant), safe(r.plantName), safe(r.salesOrganization), safe(r.distributionChannel),
      safe(r.division), safe(r.addressId), safe(r.factoryCalendar), r.isMarkedForArchiving ? 1 : 0
    ]
  );

  const prodRows = readJsonl(path.join(DATA, 'product_descriptions'));
  seedTable('product_descriptions', prodRows,
    `INSERT OR REPLACE INTO product_descriptions VALUES (?,?,?)`,
    r => [safe(r.product), safe(r.language), safe(r.productDescription)]
  );

  const sohRows = readJsonl(path.join(DATA, 'sales_order_headers'));
  seedTable('sales_order_headers', sohRows,
    `INSERT OR REPLACE INTO sales_order_headers VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    r => [
      safe(r.salesOrder), safe(r.salesOrderType), safe(r.salesOrganization), safe(r.distributionChannel),
      safe(r.soldToParty), safe(r.creationDate), safe(r.createdByUser), safe(r.lastChangeDateTime),
      parseFloat(r.totalNetAmount) || 0, safe(r.overallDeliveryStatus), safe(r.overallOrdReltdBillgStatus),
      safe(r.transactionCurrency), safe(r.requestedDeliveryDate), safe(r.headerBillingBlockReason),
      safe(r.deliveryBlockReason), safe(r.incotermsClassification), safe(r.incotermsLocation1),
      safe(r.customerPaymentTerms)
    ]
  );

  const soiRows = readJsonl(path.join(DATA, 'sales_order_items'));
  seedTable('sales_order_items', soiRows,
    `INSERT OR REPLACE INTO sales_order_items VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    r => [
      safe(r.salesOrder), safe(r.salesOrderItem), safe(r.salesOrderItemCategory),
      safe(r.material), parseFloat(r.requestedQuantity) || 0, safe(r.requestedQuantityUnit),
      parseFloat(r.netAmount) || 0, safe(r.materialGroup), safe(r.productionPlant),
      safe(r.storageLocation), safe(r.salesDocumentRjcnReason), safe(r.itemBillingBlockReason)
    ]
  );

  const odRows = readJsonl(path.join(DATA, 'outbound_delivery_headers'));
  seedTable('outbound_delivery_headers', odRows,
    `INSERT OR REPLACE INTO outbound_delivery_headers VALUES (?,?,?,?,?,?,?,?,?)`,
    r => [
      safe(r.deliveryDocument), safe(r.creationDate), safe(r.deliveryBlockReason),
      safe(r.overallGoodsMovementStatus), safe(r.overallPickingStatus), safe(r.hdrGeneralIncompletionStatus),
      safe(r.headerBillingBlockReason), safe(r.actualGoodsMovementDate), safe(r.shippingPoint)
    ]
  );

  const bdRows = readJsonl(path.join(DATA, 'billing_document_cancellations'));
  seedTable('billing_documents', bdRows,
    `INSERT OR REPLACE INTO billing_documents VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    r => [
      safe(r.billingDocument), safe(r.billingDocumentType), safe(r.creationDate),
      safe(r.billingDocumentDate), r.billingDocumentIsCancelled ? 1 : 0,
      safe(r.cancelledBillingDocument), parseFloat(r.totalNetAmount) || 0,
      safe(r.transactionCurrency), safe(r.companyCode), safe(r.fiscalYear),
      safe(r.accountingDocument), safe(r.soldToParty)
    ]
  );

  const jeRows = readJsonl(path.join(DATA, 'journal_entry_items_accounts_receivable'));
  seedTable('journal_entries', jeRows,
    `INSERT OR REPLACE INTO journal_entries VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    r => [
      safe(r.accountingDocument), safe(r.accountingDocumentItem), safe(r.companyCode),
      safe(r.fiscalYear), safe(r.glAccount), safe(r.referenceDocument), safe(r.profitCenter),
      safe(r.transactionCurrency), parseFloat(r.amountInTransactionCurrency) || 0,
      safe(r.postingDate), safe(r.documentDate), safe(r.accountingDocumentType),
      safe(r.customer), safe(r.financialAccountType), safe(r.clearingDate),
      safe(r.clearingAccountingDocument)
    ]
  );

  const payRows = readJsonl(path.join(DATA, 'payments_accounts_receivable'));
  seedTable('payments', payRows,
    `INSERT OR REPLACE INTO payments VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    r => [
      safe(r.accountingDocument), safe(r.accountingDocumentItem), safe(r.companyCode),
      safe(r.fiscalYear), safe(r.clearingDate), safe(r.clearingAccountingDocument),
      parseFloat(r.amountInTransactionCurrency) || 0, safe(r.transactionCurrency),
      safe(r.customer), safe(r.postingDate), safe(r.glAccount), safe(r.profitCenter)
    ]
  );

  const csaRows = readJsonl(path.join(DATA, 'customer_sales_area_assignments'));
  seedTable('customer_sales_areas', csaRows,
    `INSERT OR REPLACE INTO customer_sales_areas VALUES (?,?,?,?,?,?,?,?,?)`,
    r => [
      safe(r.customer), safe(r.salesOrganization), safe(r.distributionChannel), safe(r.division),
      safe(r.currency), safe(r.customerPaymentTerms), safe(r.shippingCondition),
      safe(r.incotermsClassification), safe(r.incotermsLocation1)
    ]
  );

  const pslRows = readJsonl(path.join(DATA, 'product_storage_locations'));
  seedTable('product_storage_locations', pslRows,
    `INSERT OR REPLACE INTO product_storage_locations VALUES (?,?,?)`,
    r => [safe(r.product), safe(r.plant), safe(r.storageLocation)]
  );

  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
  db.close();

  console.log('\nDatabase seeded successfully at', DB_PATH);
}

main().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
