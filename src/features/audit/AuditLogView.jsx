import React, { useEffect, useState } from 'react'
import { ShieldCheck, ArrowLeft, RefreshCw, AlertCircle } from 'lucide-react'
import { userCan } from '../../lib/access.js'

export default function AuditLogView({ currentUser, onBack }) {
  const allowed = userCan(currentUser, 'audit:view') || userCan(currentUser, 'settings:manage')
  const [rows, setRows] = useState([])
  const [action, setAction] = useState('')
  const [entityType, setEntityType] = useState('')
  const [startDate, setStartDate] = useState(new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10))
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10))
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  const load = async () => {
    if (!allowed) return
    setLoading(true)
    setError(null)
    try {
      const list = await window.api.reports.getAuditLogs({
        limit: 300,
        action: action || undefined,
        entityType: entityType || undefined,
        startDate,
        endDate,
      })
      setRows(list || [])
    } catch (err) {
      setError(err.message || 'Cannot load audit log.')
      setRows([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action, entityType, startDate, endDate])

  if (!allowed) {
    return (
      <div className="p-6 bg-white border border-slate-200 rounded-xl text-sm text-slate-600">
        You do not have permission to view the security audit log.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-orange-600" />
            Audit log & security
          </h1>
          <p className="text-xs text-slate-500">User, branch, time, action, and record reference. Secrets are never shown.</p>
        </div>
        {onBack && (
          <button onClick={onBack} className="text-xs font-semibold text-slate-600 flex items-center gap-1">
            <ArrowLeft className="w-3.5 h-3.5" /> Back
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-2 bg-white border border-slate-200 rounded-xl p-3">
        <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs" />
        <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs" />
        <input value={action} onChange={(e) => setAction(e.target.value.toUpperCase())} placeholder="Action (LOGIN, REFUND…)" className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs w-48" />
        <input value={entityType} onChange={(e) => setEntityType(e.target.value.toUpperCase())} placeholder="Entity (ORDER, USER…)" className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs w-40" />
        <button onClick={load} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-orange-600 text-white text-xs font-semibold">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-3">
          <AlertCircle className="w-4 h-4" /> {error}
        </div>
      )}

      <div className="overflow-auto border border-slate-200 rounded-xl bg-white">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 text-slate-500 uppercase tracking-wide">
            <tr>
              <th className="px-3 py-2">Time</th>
              <th className="px-3 py-2">User</th>
              <th className="px-3 py-2">Branch</th>
              <th className="px-3 py-2">Action</th>
              <th className="px-3 py-2">Record</th>
              <th className="px-3 py-2">Details</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-slate-500">No audit entries in this range.</td></tr>
            ) : rows.map((log) => (
              <tr key={log.id} className="border-t border-slate-100">
                <td className="px-3 py-2 font-mono text-slate-500 whitespace-nowrap">{log.created_at?.replace('T', ' ').slice(0, 19)}</td>
                <td className="px-3 py-2 font-semibold">{log.user_display_name || log.username || '—'}</td>
                <td className="px-3 py-2">{log.branch_name || '—'}</td>
                <td className="px-3 py-2 font-mono text-orange-700">{log.action}</td>
                <td className="px-3 py-2 font-mono">{log.entity_type}{log.entity_id ? ` · ${String(log.entity_id).slice(0, 8)}` : ''}</td>
                <td className="px-3 py-2 text-slate-500 max-w-xs truncate" title={log.details_json}>{log.details_json || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
