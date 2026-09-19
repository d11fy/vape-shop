import { NextResponse } from 'next/server';

import { getApiStoreContext } from '@/core/auth/context';
import { readPeriod, resolvePeriod, type DateRange } from '@/core/datetime';
import { auditOutsideTransaction } from '@/core/audit';
import { toCsv, downloadHeaders, type CsvColumn } from '@/core/export/csv';
import { buildWorkbook, XLSX_CONTENT_TYPE, type SheetColumn } from '@/core/export/xlsx';
import { buildFormatter } from '@/lib/formatter';
import { toMajor } from '@/core/money';
import {
  getCashFlowReport,
  getCustomersReport,
  getExpensesReport,
  getInventoryReport,
  getProductsReport,
  getProfitReport,
  getSalesReport,
} from '@/modules/reports/queries';
import { CASH_TYPE_LABEL } from '@/modules/cashbox/queries';
import type { CashboxTxnType } from '@/generated/prisma/enums';

/**
 * Report export.
 *
 * One endpoint, every report, two formats. Money is exported as a NUMBER in
 * major units (48.50, not 4850) so the shopkeeper can sum a column in Excel —
 * the whole point of exporting rather than printing.
 *
 * Each export is written to the audit log: knowing who pulled the customer list
 * matters.
 */

export const dynamic = 'force-dynamic';

interface ExportTable {
  sheetName: string;
  fileBase: string;
  columns: Array<{
    header: string;
    value: (row: never) => string | number | Date | null;
    type?: SheetColumn<never>['type'];
    width?: number;
  }>;
  rows: unknown[];
  totals?: Array<string | number | null>;
}

export async function GET(request: Request) {
  const context = await getApiStoreContext();
  if (!context) {
    return NextResponse.json({ message: 'غير مصرح' }, { status: 401 });
  }

  const { store } = context;
  const can = (permission: string) => store.isOwner || store.permissions.has(permission);

  if (!can('reports.export')) {
    return NextResponse.json({ message: 'ليس لديك صلاحية التصدير' }, { status: 403 });
  }

  const url = new URL(request.url);
  const report = url.searchParams.get('report') ?? 'sales';
  const format = url.searchParams.get('format') === 'csv' ? 'csv' : 'xlsx';

  const period = readPeriod(Object.fromEntries(url.searchParams.entries()), 'this_month');
  const range = resolvePeriod(period.preset, store.settings.timezone, {
    from: period.from,
    to: period.to,
  });

  const fmt = buildFormatter({
    currency: store.settings.currency,
    decimals: store.settings.currencyDecimals,
    timezone: store.settings.timezone,
    locale: store.settings.locale,
  });

  const decimals = store.settings.currencyDecimals;
  const money = (value: number) => toMajor(value, decimals);

  const scope = {
    storeId: store.id,
    branchId: store.branch.id,
    range,
    timezone: store.settings.timezone,
  };

  let table: ExportTable;

  try {
    table = await buildTable(report, scope, { can, money, fmt, range });
  } catch (error) {
    if (error instanceof ExportForbidden) {
      return NextResponse.json({ message: error.message }, { status: 403 });
    }
    return NextResponse.json({ message: 'تعذر إنشاء التقرير' }, { status: 500 });
  }

  const stamp = new Date().toISOString().slice(0, 10);
  const fileName = `${table.fileBase}-${stamp}.${format}`;

  await auditOutsideTransaction({
    storeId: store.id,
    userId: context.user.id,
    action: 'report.export',
    entityType: 'report',
    entityId: report,
    summary: `تصدير ${table.sheetName} بصيغة ${format.toUpperCase()}`,
    after: { report, format, from: range.from, to: range.to, rows: table.rows.length },
  });

  if (format === 'csv') {
    const csv = toCsv(
      table.rows as never[],
      table.columns as unknown as CsvColumn<never>[],
    );
    return new NextResponse(csv, {
      headers: downloadHeaders(fileName, 'text/csv; charset=utf-8'),
    });
  }

  const workbook = buildWorkbook(
    [
      {
        name: table.sheetName,
        columns: table.columns as unknown as SheetColumn<never>[],
        rows: table.rows as never[],
        totals: table.totals,
      },
    ],
    { currency: store.settings.currency },
  );

  return new NextResponse(new Uint8Array(workbook), {
    headers: downloadHeaders(fileName, XLSX_CONTENT_TYPE),
  });
}

class ExportForbidden extends Error {}

interface BuildContext {
  can: (permission: string) => boolean;
  money: (value: number) => number;
  fmt: ReturnType<typeof buildFormatter>;
  range: DateRange;
}

async function buildTable(
  report: string,
  scope: Parameters<typeof getSalesReport>[0],
  ctx: BuildContext,
): Promise<ExportTable> {
  const { can, money, fmt } = ctx;

  switch (report) {
    case 'sales': {
      const data = await getSalesReport(scope);
      const rows = data.daily.filter((day) => day.invoices > 0);
      const showProfit = can('reports.profit');

      return {
        sheetName: 'تقرير المبيعات',
        fileBase: 'تقرير-المبيعات',
        rows,
        columns: [
          { header: 'التاريخ', value: (r: (typeof rows)[number]) => r.date, width: 14 },
          { header: 'عدد الفواتير', value: (r: (typeof rows)[number]) => r.invoices, type: 'number' },
          { header: 'المبيعات', value: (r: (typeof rows)[number]) => money(r.sales), type: 'money' },
          {
            header: 'متوسط الفاتورة',
            value: (r: (typeof rows)[number]) =>
              money(r.invoices > 0 ? Math.round(r.sales / r.invoices) : 0),
            type: 'money',
          },
          ...(showProfit
            ? [
                {
                  header: 'مجمل الربح',
                  value: (r: (typeof rows)[number]) => money(r.profit),
                  type: 'money' as const,
                },
              ]
            : []),
        ] as ExportTable['columns'],
        totals: [
          'الإجمالي',
          data.totals.invoiceCount,
          money(data.totals.grossSales),
          money(data.totals.averageInvoice),
          ...(showProfit ? [money(rows.reduce((sum, row) => sum + row.profit, 0))] : []),
        ],
      };
    }

    case 'profit': {
      if (!can('reports.profit')) throw new ExportForbidden('ليس لديك صلاحية تقارير الأرباح');
      const data = await getProfitReport(scope);

      const rows = [
        { label: 'إجمالي المبيعات', amount: data.revenue },
        { label: 'الضريبة المحصّلة', amount: -data.tax },
        { label: 'أثر المرتجعات', amount: -data.returnsImpact },
        { label: 'صافي الإيرادات', amount: data.netRevenue },
        { label: 'تكلفة البضاعة المباعة', amount: -data.cogs },
        { label: 'مجمل الربح', amount: data.grossProfit },
        ...data.expenseBreakdown.map((category) => ({
          label: `مصاريف — ${category.name}`,
          amount: -category.amount,
        })),
        { label: 'إجمالي المصاريف', amount: -data.expenses },
        { label: 'صافي الربح', amount: data.netProfit },
      ];

      return {
        sheetName: 'الأرباح والخسائر',
        fileBase: 'تقرير-الأرباح',
        rows,
        columns: [
          { header: 'البند', value: (r: (typeof rows)[number]) => r.label, width: 32 },
          {
            header: 'المبلغ',
            value: (r: (typeof rows)[number]) => money(r.amount),
            type: 'money',
            width: 18,
          },
        ] as ExportTable['columns'],
      };
    }

    case 'products': {
      const data = await getProductsReport(scope, { limit: 500 });
      const showProfit = can('reports.profit');
      const rows = data.rows;

      return {
        sheetName: 'تقرير المنتجات',
        fileBase: 'تقرير-المنتجات',
        rows,
        columns: [
          { header: 'المنتج', value: (r: (typeof rows)[number]) => r.name, width: 32 },
          { header: 'الصنف', value: (r: (typeof rows)[number]) => r.variantName, width: 18 },
          { header: 'الكود', value: (r: (typeof rows)[number]) => r.sku, width: 14 },
          { header: 'التصنيف', value: (r: (typeof rows)[number]) => r.categoryName ?? '', width: 16 },
          {
            header: 'الكمية المباعة',
            value: (r: (typeof rows)[number]) => Math.round(r.quantitySold * 1000) / 1000,
            type: 'number',
          },
          { header: 'وحدة البيع', value: (r: (typeof rows)[number]) => r.unitLabel, width: 12 },
          { header: 'الإيراد', value: (r: (typeof rows)[number]) => money(r.revenue), type: 'money' },
          ...(showProfit
            ? [
                {
                  header: 'التكلفة',
                  value: (r: (typeof rows)[number]) => money(r.cogs),
                  type: 'money' as const,
                },
                {
                  header: 'الربح',
                  value: (r: (typeof rows)[number]) => money(r.profit),
                  type: 'money' as const,
                },
                {
                  header: 'الهامش %',
                  value: (r: (typeof rows)[number]) => r.margin,
                  type: 'number' as const,
                },
              ]
            : []),
          {
            header: 'المتوفر حالياً',
            value: (r: (typeof rows)[number]) => Math.round(r.currentStock * 1000) / 1000,
            type: 'number',
          },
        ] as ExportTable['columns'],
      };
    }

    case 'customers': {
      if (!can('customers.view')) throw new ExportForbidden('ليس لديك صلاحية عرض العملاء');
      const data = await getCustomersReport(scope);
      const rows = data.top;

      return {
        sheetName: 'تقرير العملاء',
        fileBase: 'تقرير-العملاء',
        rows,
        columns: [
          { header: 'العميل', value: (r: (typeof rows)[number]) => r.name, width: 28 },
          { header: 'الهاتف', value: (r: (typeof rows)[number]) => r.phone ?? '', width: 16 },
          {
            header: 'عدد الفواتير',
            value: (r: (typeof rows)[number]) => r.invoiceCount,
            type: 'number',
          },
          {
            header: 'إجمالي المشتريات',
            value: (r: (typeof rows)[number]) => money(r.total),
            type: 'money',
          },
          {
            header: 'متوسط الفاتورة',
            value: (r: (typeof rows)[number]) => money(r.averageInvoice),
            type: 'money',
          },
          {
            header: 'الرصيد المستحق',
            value: (r: (typeof rows)[number]) => money(r.balance),
            type: 'money',
          },
          {
            header: 'آخر شراء',
            value: (r: (typeof rows)[number]) => r.lastPurchaseAt,
            type: 'date',
            width: 18,
          },
        ] as ExportTable['columns'],
      };
    }

    case 'expenses': {
      if (!can('expenses.view')) throw new ExportForbidden('ليس لديك صلاحية عرض المصاريف');
      const data = await getExpensesReport(scope);
      const rows = data.byCategory;

      return {
        sheetName: 'تقرير المصاريف',
        fileBase: 'تقرير-المصاريف',
        rows,
        columns: [
          { header: 'الفئة', value: (r: (typeof rows)[number]) => r.name, width: 28 },
          {
            header: 'عدد العمليات',
            value: (r: (typeof rows)[number]) => r.count,
            type: 'number',
          },
          { header: 'الإجمالي', value: (r: (typeof rows)[number]) => money(r.amount), type: 'money' },
          {
            header: 'النسبة %',
            value: (r: (typeof rows)[number]) =>
              data.total > 0 ? Math.round((r.amount / data.total) * 1000) / 10 : 0,
            type: 'number',
          },
        ] as ExportTable['columns'],
        totals: ['الإجمالي', data.count, money(data.total), 100],
      };
    }

    case 'inventory': {
      if (!can('inventory.view_value')) {
        throw new ExportForbidden('ليس لديك صلاحية عرض قيمة المخزون');
      }
      const data = await getInventoryReport(scope.storeId, scope.branchId);
      const rows = data.byCategory;

      return {
        sheetName: 'قيمة المخزون',
        fileBase: 'قيمة-المخزون',
        rows,
        columns: [
          { header: 'التصنيف', value: (r: (typeof rows)[number]) => r.name, width: 28 },
          {
            header: 'عدد الأصناف',
            value: (r: (typeof rows)[number]) => r.variantCount,
            type: 'number',
          },
          {
            header: 'القيمة بالتكلفة',
            value: (r: (typeof rows)[number]) => money(r.cost),
            type: 'money',
          },
          {
            header: 'القيمة بالبيع',
            value: (r: (typeof rows)[number]) => money(r.retail),
            type: 'money',
          },
          {
            header: 'الربح المتوقع',
            value: (r: (typeof rows)[number]) => money(r.retail - r.cost),
            type: 'money',
          },
        ] as ExportTable['columns'],
        totals: [
          'الإجمالي',
          data.variantCount,
          money(data.totalCost),
          money(data.totalRetail),
          money(data.potentialProfit),
        ],
      };
    }

    case 'cashflow': {
      if (!can('cashbox.view')) throw new ExportForbidden('ليس لديك صلاحية عرض الصندوق');
      const data = await getCashFlowReport(scope);
      const rows = data.daily.filter((day) => day.inflow !== 0 || day.outflow !== 0);

      return {
        sheetName: 'التدفق النقدي',
        fileBase: 'التدفق-النقدي',
        rows,
        columns: [
          { header: 'التاريخ', value: (r: (typeof rows)[number]) => r.date, width: 14 },
          { header: 'الوارد', value: (r: (typeof rows)[number]) => money(r.inflow), type: 'money' },
          { header: 'الصادر', value: (r: (typeof rows)[number]) => money(r.outflow), type: 'money' },
          { header: 'الصافي', value: (r: (typeof rows)[number]) => money(r.net), type: 'money' },
        ] as ExportTable['columns'],
        totals: [
          'الإجمالي',
          money(data.inflow),
          money(data.outflow),
          money(data.inflow - data.outflow),
        ],
      };
    }

    default:
      throw new ExportForbidden('تقرير غير معروف');
  }
}
