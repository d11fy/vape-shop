import { deflateRawSync } from 'node:zlib';

/**
 * Minimal XLSX writer.
 *
 * A real `.xlsx` is a ZIP of XML parts. Writing the handful we need directly —
 * rather than pulling in a spreadsheet library — keeps the dependency surface
 * small and gives exact control over the two things that matter here: Arabic
 * text (UTF-8 inline strings, right-to-left sheet) and numbers that stay
 * numbers, so the shopkeeper can sum a column in Excel.
 */

export type CellValue = string | number | Date | null | undefined;

export interface SheetColumn<T> {
  header: string;
  value: (row: T) => CellValue;
  /** Column width in characters. */
  width?: number;
  /** `money` and `number` are written as numeric cells, not text. */
  type?: 'text' | 'number' | 'money' | 'date';
}

export interface SheetDefinition<T> {
  name: string;
  columns: SheetColumn<T>[];
  rows: T[];
  /** Optional summary row appended at the bottom, already formatted. */
  totals?: Array<CellValue>;
}

// Style indices declared in `styles.xml` below.
const STYLE_HEADER = 1;
const STYLE_MONEY = 2;
const STYLE_DATE = 3;
const STYLE_TOTAL = 4;

export function buildWorkbook<T>(sheets: Array<SheetDefinition<T>>, options: {
  /** ISO 4217 code, used in the money number format. */
  currency?: string;
} = {}): Buffer {
  const files: ZipEntry[] = [];

  files.push(entry('[Content_Types].xml', contentTypes(sheets.length)));
  files.push(entry('_rels/.rels', rootRels()));
  files.push(entry('xl/workbook.xml', workbookXml(sheets)));
  files.push(entry('xl/_rels/workbook.xml.rels', workbookRels(sheets.length)));
  files.push(entry('xl/styles.xml', stylesXml(options.currency ?? '')));

  sheets.forEach((sheet, index) => {
    files.push(entry(`xl/worksheets/sheet${index + 1}.xml`, sheetXml(sheet)));
  });

  return zip(files);
}

// ── XML parts ────────────────────────────────────────────────────────────────

function contentTypes(sheetCount: number): string {
  const sheets = Array.from(
    { length: sheetCount },
    (_, index) =>
      `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
  ).join('');

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
${sheets}
</Types>`;
}

function rootRels(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;
}

function workbookXml<T>(sheets: Array<SheetDefinition<T>>): string {
  const entries = sheets
    .map(
      (sheet, index) =>
        `<sheet name="${escapeXml(sheet.name.slice(0, 31))}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`,
    )
    .join('');

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>${entries}</sheets>
</workbook>`;
}

function workbookRels(sheetCount: number): string {
  const sheets = Array.from(
    { length: sheetCount },
    (_, index) =>
      `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`,
  ).join('');

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${sheets}
<Relationship Id="rId${sheetCount + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;
}

function stylesXml(currency: string): string {
  // numFmtId 164 = money with the store's currency, 165 = date.
  const moneyFormat = currency
    ? `#,##0.00\\ &quot;${escapeXml(currency)}&quot;`
    : '#,##0.00';

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="2">
<numFmt numFmtId="164" formatCode="${moneyFormat}"/>
<numFmt numFmtId="165" formatCode="yyyy\\-mm\\-dd\\ hh:mm"/>
</numFmts>
<fonts count="3">
<font><sz val="11"/><name val="Calibri"/></font>
<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
<font><b/><sz val="11"/><name val="Calibri"/></font>
</fonts>
<fills count="3">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF161B22"/><bgColor indexed="64"/></patternFill></fill>
</fills>
<borders count="2">
<border><left/><right/><top/><bottom/><diagonal/></border>
<border><left/><right/><top style="thin"><color rgb="FF999999"/></top><bottom/><diagonal/></border>
</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="5">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="0" fontId="2" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1"/>
</cellXfs>
</styleSheet>`;
}

function sheetXml<T>(sheet: SheetDefinition<T>): string {
  const cols = sheet.columns
    .map(
      (column, index) =>
        `<col min="${index + 1}" max="${index + 1}" width="${column.width ?? 18}" customWidth="1"/>`,
    )
    .join('');

  const headerCells = sheet.columns
    .map((column, index) => textCell(cellRef(index, 1), column.header, STYLE_HEADER))
    .join('');

  const bodyRows = sheet.rows
    .map((row, rowIndex) => {
      const cells = sheet.columns
        .map((column, columnIndex) =>
          renderCell(cellRef(columnIndex, rowIndex + 2), column.value(row), column.type),
        )
        .join('');
      return `<row r="${rowIndex + 2}">${cells}</row>`;
    })
    .join('');

  const totalsRow = sheet.totals
    ? `<row r="${sheet.rows.length + 2}">${sheet.totals
        .map((value, index) =>
          renderCell(
            cellRef(index, sheet.rows.length + 2),
            value,
            typeof value === 'number' ? 'money' : 'text',
            STYLE_TOTAL,
          ),
        )
        .join('')}</row>`
    : '';

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetViews><sheetView rightToLeft="1" workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<sheetFormatPr defaultRowHeight="15"/>
<cols>${cols}</cols>
<sheetData>
<row r="1" ht="22" customHeight="1">${headerCells}</row>
${bodyRows}
${totalsRow}
</sheetData>
<autoFilter ref="A1:${cellRef(sheet.columns.length - 1, Math.max(1, sheet.rows.length + 1))}"/>
</worksheet>`;
}

function renderCell(
  ref: string,
  value: CellValue,
  type: SheetColumn<unknown>['type'] = 'text',
  styleOverride?: number,
): string {
  if (value === null || value === undefined || value === '') {
    return `<c r="${ref}"${styleOverride ? ` s="${styleOverride}"` : ''}/>`;
  }

  if (value instanceof Date) {
    // Excel serial date: days since 1899-12-30, fractional part = time.
    const serial = value.getTime() / 86_400_000 + 25_569;
    return `<c r="${ref}" s="${styleOverride ?? STYLE_DATE}"><v>${serial.toFixed(8)}</v></c>`;
  }

  if (typeof value === 'number') {
    const style = styleOverride ?? (type === 'money' ? STYLE_MONEY : 0);
    return `<c r="${ref}"${style ? ` s="${style}"` : ''}><v>${value}</v></c>`;
  }

  return textCell(ref, String(value), styleOverride);
}

/** Inline strings avoid a shared-string table and keep Arabic simple. */
function textCell(ref: string, text: string, style?: number): string {
  return `<c r="${ref}" t="inlineStr"${style ? ` s="${style}"` : ''}><is><t xml:space="preserve">${escapeXml(text)}</t></is></c>`;
}

function cellRef(columnIndex: number, rowNumber: number): string {
  let column = '';
  let index = columnIndex;
  do {
    column = String.fromCharCode(65 + (index % 26)) + column;
    index = Math.floor(index / 26) - 1;
  } while (index >= 0);
  return `${column}${rowNumber}`;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    // Control characters are illegal in XML 1.0 and crash Excel.
    .replace(/[ --]/g, '');
}

// ── ZIP container ────────────────────────────────────────────────────────────

interface ZipEntry {
  name: string;
  data: Buffer;
  crc: number;
  compressed: Buffer;
}

function entry(name: string, content: string): ZipEntry {
  const data = Buffer.from(content, 'utf8');
  return { name, data, crc: crc32(data), compressed: deflateRawSync(data, { level: 9 }) };
}

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer: Buffer): number {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function zip(entries: ZipEntry[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const file of entries) {
    const nameBytes = Buffer.from(file.name, 'utf8');

    const local = Buffer.alloc(30 + nameBytes.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt16LE(0, 10); // time
    local.writeUInt16LE(0, 12); // date
    local.writeUInt32LE(file.crc, 14);
    local.writeUInt32LE(file.compressed.length, 18);
    local.writeUInt32LE(file.data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    local.writeUInt16LE(0, 28);
    nameBytes.copy(local, 30);

    locals.push(local, file.compressed);

    const central = Buffer.alloc(46 + nameBytes.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0, 14);
    central.writeUInt32LE(file.crc, 16);
    central.writeUInt32LE(file.compressed.length, 20);
    central.writeUInt32LE(file.data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    nameBytes.copy(central, 46);

    centrals.push(central);
    offset += local.length + file.compressed.length;
  }

  const centralBuffer = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuffer.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...locals, centralBuffer, end]);
}

export const XLSX_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
