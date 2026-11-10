/** Customers: list and Customer 360 (Detect part). Reuses the Detect case assembly. */
import { db } from '../../db/client.js';
import * as detectRepo from '../detect/detect.repository.js';
import type { CaseFilters } from '../detect/detect.repository.js';
import { assembleCases, getCase, type Paging } from '../detect/detect.service.js';
import { toMetricsView } from '../detect/view.js';

export async function listCustomers(filters: CaseFilters, paging: Paging) {
  const { rows, total } = await detectRepo.findCaseRows(db, filters, {
    orderBy: 'customer',
    limit: paging.pageSize,
    offset: (paging.page - 1) * paging.pageSize,
  });
  const assembled = await assembleCases(db, rows);
  return {
    total,
    rows: assembled.map(({ row }) => ({
      caseId: row.caseId,
      customer: row.customer,
      priority: { total: row.priority.total, band: row.priority.band },
      status: row.status,
      reasonLabel: row.reasonLabel,
    })),
  };
}

export async function getCustomer(customerId: string) {
  const { row, metrics } = await getCase(customerId);
  return {
    ...row,
    metrics: {
      baseline: toMetricsView(metrics.baseline),
      current: toMetricsView(metrics.current),
    },
  };
}
