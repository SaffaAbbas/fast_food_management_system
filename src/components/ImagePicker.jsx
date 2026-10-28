import React, { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { ImagePlus, X, ZoomIn } from 'lucide-react'

function isDirectImageSrc(value) {
  if (!value || typeof value !== 'string') return false
  return (
    value.startsWith('data:image/') ||
    value.startsWith('http://') ||
    value.startsWith('https://') ||
    value.startsWith('/')
  )
}

export default function ImagePicker({ label = 'Photo', value, onChange }) {
  const [preview, setPreview] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      if (!value) {
        setPreview(null)
        return
      }
      if (isDirectImageSrc(value)) {
        setPreview(value)
        return
      }
      if (window.api?.media?.getDataUrl) {
        try {
          const dataUrl = await window.api.media.getDataUrl(value)
          if (!cancelled) setPreview(dataUrl)
        } catch {
          if (!cancelled) setPreview(null)
        }
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [value])

  const handleFile = async (file) => {
    if (!file) return
    setError(null)
    const reader = new FileReader()
    reader.onload = async () => {
      try {
        if (!window.api?.media?.save) {
          onChange(reader.result)
          return
        }
        const saved = await window.api.media.save({ dataUrl: reader.result, filename: file.name })
        onChange(saved.id)
      } catch (err) {
        setError(err.message || 'Could not save image.')
      }
    }
    reader.readAsDataURL(file)
  }

  return (
    <div className="space-y-1.5">
      {label && <label className="block text-xs font-semibold text-slate-600">{label}</label>}
      <div className="flex items-center gap-3">
        <label className="relative w-20 h-20 rounded-xl border border-dashed border-slate-300 bg-slate-50 overflow-hidden cursor-pointer hover:border-orange-400 hover:bg-orange-50 transition-colors flex items-center justify-center">
          {preview ? (
            <img src={preview} alt="" className="w-full h-full object-contain p-0.5" />
          ) : (
            <ImagePlus className="w-6 h-6 text-slate-400" />
          )}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="absolute inset-0 opacity-0 cursor-pointer"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
        </label>
        <div className="text-[11px] text-slate-500 space-y-1">
          <p>PNG, JPG, WEBP or GIF. Max 4 MB.</p>
          {value && (
            <button
              type="button"
              onClick={() => onChange(null)}
              className="inline-flex items-center gap-1 text-rose-600 font-semibold"
            >
              <X className="w-3 h-3" /> Remove
            </button>
          )}
          {error && <p className="text-rose-600">{error}</p>}
        </div>
      </div>
    </div>
  )
}

export function EntityImage({
  id,
  alt = '',
  className = 'w-10 h-10 rounded-lg bg-white',
  preview = true,
}) {
  const [src, setSrc] = useState(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      if (!id) {
        setSrc(null)
        return
      }
      if (isDirectImageSrc(id)) {
        setSrc(id)
        return
      }
      if (window.api?.media?.getDataUrl) {
        const dataUrl = await window.api.media.getDataUrl(id)
        if (!cancelled) setSrc(dataUrl)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [id])

  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const openPreview = (e) => {
    if (!preview || !src) return
    e.preventDefault()
    e.stopPropagation()
    setOpen(true)
  }

  if (!src) return <div className={className} />

  return (
    <>
      <div className={`relative overflow-hidden ${className}`}>
        <img src={src} alt={alt} className="block h-full w-full object-contain object-center" />
        {preview && (
          <button
            type="button"
            title="View full photo"
            onClick={openPreview}
            className="entity-zoom-btn absolute bottom-1.5 right-1.5 flex h-8 w-8 items-center justify-center rounded-full shadow-md"
          >
            <ZoomIn className="h-4 w-4" />
          </button>
        )}
      </div>
      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-[400] flex items-center justify-center p-6"
            onClick={() => setOpen(false)}
          >
            <div className="absolute inset-0 bg-slate-900/60" />
            <div
              className="relative w-full max-w-3xl overflow-hidden rounded-2xl bg-white p-4 shadow-2xl ring-1 ring-black/10"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200"
              >
                <X className="h-4 w-4" />
              </button>
              <img src={src} alt={alt} className="max-h-[78vh] w-full object-contain object-center" />
            </div>
          </div>,
          document.body
        )}
    </>
  )
}
