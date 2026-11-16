function csvEscape(value) {
  const s = value == null ? '' : String(value)
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

export function rowsToCsv(columns, rows) {
  const header = columns.map((c) => csvEscape(c.label)).join(',')
  const body = (rows || []).map((row) =>
    columns.map((c) => {
      const raw = c.export ? c.export(row) : (c.render ? stripHtml(c.render(row)) : row[c.key])
      return csvEscape(raw)
    }).join(',')
  )
  return [header, ...body].join('\n')
}

function stripHtml(value) {
  if (value == null) return ''
  if (typeof value === 'string') return value.replace(/<[^>]+>/g, '')
  return String(value)
}

export function downloadText(filename, text, mime = 'text/csv;charset=utf-8') {
  const blob = new Blob(['\uFEFF' + text], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function exportCsv(title, columns, rows) {
  const stamp = new Date().toISOString().slice(0, 10)
  downloadText(`${slug(title)}-${stamp}.csv`, rowsToCsv(columns, rows))
}

export function exportExcel(title, columns, rows) {
  const stamp = new Date().toISOString().slice(0, 10)
  const html = `<html><head><meta charset="utf-8" /></head><body><table border="1"><thead><tr>${
    columns.map((c) => `<th>${escapeHtml(c.label)}</th>`).join('')
  }</tr></thead><tbody>${
    (rows || []).map((row) => `<tr>${columns.map((c) => {
      const raw = c.export ? c.export(row) : (c.render ? stripHtml(c.render(row)) : row[c.key])
      return `<td>${escapeHtml(raw)}</td>`
    }).join('')}</tr>`).join('')
  }</tbody></table></body></html>`
  downloadText(`${slug(title)}-${stamp}.xls`, html, 'application/vnd.ms-excel')
}

export function printReport(title, columns, rows, filters = '') {
  const win = window.open('', '_blank', 'width=900,height=700')
  if (!win) return
  const table = `<table><thead><tr>${columns.map((c) => `<th>${escapeHtml(c.label)}</th>`).join('')}</tr></thead><tbody>${
    (rows || []).map((row) => `<tr>${columns.map((c) => {
      const raw = c.export ? c.export(row) : (c.render ? stripHtml(c.render(row)) : row[c.key])
      return `<td>${escapeHtml(raw)}</td>`
    }).join('')}</tr>`).join('') || `<tr><td colspan="${columns.length}">No rows</td></tr>`
  }</tbody></table>`
  win.document.write(`<!doctype html><html><head><title>${escapeHtml(title)}</title>
    <style>
      body { font-family: Segoe UI, sans-serif; color: #111; padding: 24px; }
      h1 { font-size: 18px; margin: 0 0 4px; }
      p { color: #555; font-size: 12px; margin: 0 0 16px; }
      table { width: 100%; border-collapse: collapse; font-size: 12px; }
      th, td { border: 1px solid #ddd; padding: 6px 8px; text-align: left; }
      th { background: #f3f4f6; }
      @media print { button { display: none; } }
    </style></head><body>
    <h1>${escapeHtml(title)}</h1>
    <p>${escapeHtml(filters)} · Printed ${new Date().toLocaleString()}</p>
    ${table}
    <p><button onclick="window.print()">Print / Save PDF</button></p>
    </body></html>`)
  win.document.close()
  setTimeout(() => {
    try { win.print() } catch (e) {}
  }, 250)
}

function slug(s) {
  return String(s || 'report').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
