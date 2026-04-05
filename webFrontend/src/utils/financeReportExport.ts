function csvEscape(cell: string): string {
  if (/[",\n\r]/.test(cell)) {
    return `"${cell.replace(/"/g, '""')}"`
  }
  return cell
}

export function downloadCsv(filename: string, headers: string[], rows: string[][]): void {
  const lines = [
    headers.map(csvEscape).join(','),
    ...rows.map((r) => r.map((c) => csvEscape(String(c ?? ''))).join(',')),
  ]
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * Built-in PDF fonts (Helvetica / WinAnsi) omit many Unicode code points. Those glyphs often render
 * with broken spacing (e.g. "N e w B u s i n e s s") or mojibake. Normalize to ASCII-ish literals.
 */
function sanitizePdfLiteralText(s: string): string {
  return String(s)
    .replace(/\u00a0/g, ' ')
    .replace(/\u2013|\u2014|\u2212/g, '-')
    .replace(/\u2192|\u2794/g, ' to ')
    .replace(/\u2190/g, ' from ')
    .replace(/\u00b7|\u2022|\u2027/g, ' | ')
    .replace(/\u2018|\u2019|\u02bc/g, "'")
    .replace(/\u201c|\u201d/g, '"')
    .replace(/\u2026/g, '...')
}

export type PdfColAlign = 'left' | 'right'

export type PdfTableSection = {
  heading?: string
  headers: string[]
  rows: string[][]
  /** Relative column widths; defaults to equal widths. */
  columnWeights?: number[]
  /** Per-column alignment; defaults to left. */
  columnAlign?: PdfColAlign[]
}

function computeColWidths(innerW: number, weights: number[] | undefined, colCount: number): number[] {
  const fallback = Array(colCount).fill(1)
  const w =
    weights?.length === colCount && weights.every((v) => v > 0) ? weights : fallback
  const sum = w.reduce((a, b) => a + b, 0)
  return w.map((x) => (x / sum) * innerW)
}

function padCells(row: string[], colCount: number): string[] {
  const r = row.slice(0, colCount)
  while (r.length < colCount) r.push('')
  return r
}

export async function downloadFinancePdf(opts: {
  title: string
  subtitle?: string
  sections: PdfTableSection[]
  filename: string
}): Promise<void> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const margin = 40
  const innerW = pageW - margin * 2
  const lineHeight = 9
  /** Space inside each table row above/below wrapped text (before the horizontal rule). */
  const rowPadTop = 5
  const rowPadBottom = 10
  let y = 48

  const ensureSpace = (need: number) => {
    if (y + need > pageH - margin) {
      doc.addPage()
      y = margin
    }
  }

  const titleSafe = sanitizePdfLiteralText(opts.title)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.text(titleSafe, margin, y)
  y += 26

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  if (opts.subtitle) {
    const subLines = doc.splitTextToSize(sanitizePdfLiteralText(opts.subtitle), innerW)
    for (const ln of subLines) {
      ensureSpace(lineHeight + 2)
      doc.text(ln, margin, y)
      y += lineHeight
    }
    y += 8
  }

  const drawRow = (
    cells: string[],
    colW: number[],
    align: PdfColAlign[],
    bold: boolean,
    fontSize: number,
  ): void => {
    const colCount = colW.length
    const padded = padCells(cells, colCount)
    doc.setFontSize(fontSize)
    doc.setFont('helvetica', bold ? 'bold' : 'normal')

    const cellLines = padded.map((c, i) =>
      doc.splitTextToSize(sanitizePdfLiteralText(String(c ?? '')), Math.max(10, colW[i] - 8)),
    )
    const maxLines = Math.max(1, ...cellLines.map((l) => l.length))
    const rowH = rowPadTop + maxLines * lineHeight + rowPadBottom
    ensureSpace(rowH)

    const y0 = y
    let x = margin
    for (let i = 0; i < colCount; i++) {
      const lines = cellLines[i]
      const a = align[i] ?? 'left'
      lines.forEach((line: string, j: number) => {
        const yy = y0 + rowPadTop + (j + 1) * lineHeight
        if (a === 'right') {
          doc.text(line, x + colW[i] - 4, yy, { align: 'right' })
        } else {
          doc.text(line, x + 4, yy)
        }
      })
      x += colW[i]
    }
    y = y0 + rowPadTop + maxLines * lineHeight + rowPadBottom
    doc.setDrawColor(210, 214, 223)
    doc.setLineWidth(0.4)
    doc.line(margin, y, margin + innerW, y)
    doc.setDrawColor(0, 0, 0)
    doc.setLineWidth(0.2)
  }

  for (const sec of opts.sections) {
    if (sec.heading) {
      ensureSpace(20)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(10)
      const hSafe = sanitizePdfLiteralText(sec.heading)
      const hLines = hSafe
        .split(/\r?\n/)
        .flatMap((para) => {
          const t = para.trim()
          return t ? doc.splitTextToSize(t, innerW) : []
        })
      for (const ln of hLines) {
        ensureSpace(lineHeight + 2)
        doc.text(ln, margin, y)
        y += lineHeight
      }
      y += 12
    }

    const colCount = Math.max(1, sec.headers.length)
    const colW = computeColWidths(innerW, sec.columnWeights, colCount)
    const align = sec.columnAlign ?? []

    drawRow(sec.headers, colW, align, true, 8)
    doc.setFont('helvetica', 'normal')
    for (const row of sec.rows) {
      drawRow(row, colW, align, false, 8)
    }
    y += 18
  }

  doc.save(opts.filename.endsWith('.pdf') ? opts.filename : `${opts.filename}.pdf`)
}
