import { useState, useEffect, useRef, useCallback } from 'react'
import { checkHealth, fetchPreview, downloadFile } from './api'
import './App.css'

const PER_PAGE = 8

export default function App() {
  const [serials, setSerials]         = useState([])
  const [input, setInput]             = useState('')
  const [editIdx, setEditIdx]         = useState(null)
  const [editVal, setEditVal]         = useState('')
  const [pages, setPages]             = useState([])       // base64 images
  const [pgIdx, setPgIdx]             = useState(0)
  const [status, setStatus]           = useState('waking') // waking|ready|error
  const [previewLoading, setPvLoad]   = useState(false)
  const [dlState, setDlState]         = useState('')       // ''|xlsx|pdf
  const [err, setErr]                 = useState('')
  const inputRef  = useRef(null)
  const debounce  = useRef(null)
  const wakeTimer = useRef(null)

  // ── Wake backend ─────────────────────────────────────────
  useEffect(() => {
    let tries = 0
    const ping = async () => {
      tries++
      const ok = await checkHealth()
      if (ok) { setStatus('ready'); return }
      if (tries < 20) { wakeTimer.current = setTimeout(ping, 4000) }
      else setStatus('error')
    }
    ping()
    return () => clearTimeout(wakeTimer.current)
  }, [])

  // ── Auto preview (debounced) ──────────────────────────────
  const doPreview = useCallback(async (list) => {
    if (!list.length) { setPages([]); return }
    if (status !== 'ready') return
    setPvLoad(true); setErr('')
    try {
      const d = await fetchPreview(list)
      setPages(d.pages || [])
      setPgIdx(i => Math.min(i, (d.total || 1) - 1))
    } catch (e) { setErr(e.message) }
    finally { setPvLoad(false) }
  }, [status])

  useEffect(() => {
    clearTimeout(debounce.current)
    debounce.current = setTimeout(() => doPreview(serials), 700)
  }, [serials, doPreview])

  // ── Handlers ─────────────────────────────────────────────
  const addSerial = () => {
    const v = input.trim()
    if (!v) return
    setSerials(p => [...p, v])
    setInput('')
    inputRef.current?.focus()
  }

  const saveEdit = () => {
    if (!editVal.trim()) return
    setSerials(p => p.map((s,i) => i === editIdx ? editVal.trim() : s))
    setEditIdx(null)
  }

  const handleDl = async (type) => {
    if (!serials.length || dlState) return
    setDlState(type); setErr('')
    try { await downloadFile(serials, type) }
    catch (e) { setErr(e.message) }
    finally { setDlState('') }
  }

  const totalPgGroups = Math.max(1, Math.ceil(serials.length / PER_PAGE))
  const previewTotal  = pages.length

  return (
    <div className="layout">
      {/* ── Header ── */}
      <header className="header">
        <div className="header-left">
          <div className="logo">⚡</div>
          <div>
            <div className="app-title">SEC Form Generator</div>
            <div className="app-sub">FM-QAF-01-02_02 · ใบบันทึกตรวจสอบการต่อวงจรไฟฟ้า</div>
          </div>
        </div>
        <WakeStatus status={status} />
      </header>

      <div className="body">
        {/* ═══════════ LEFT PANEL ═══════════ */}
        <section className="panel left-panel">
          <div className="panel-head">
            <span className="panel-title">จัดการรายการ</span>
            <span className="badge">{serials.length} รายการ · {totalPgGroups} หน้า</span>
          </div>

          {/* Input row */}
          <div className="add-row">
            <input
              ref={inputRef}
              className="sn-input"
              placeholder="Serial No. / FAC No. → Enter"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addSerial()}
            />
            <button className="btn btn-add" onClick={addSerial}>+ เพิ่ม</button>
          </div>

          {/* Page overflow notice */}
          {serials.length > PER_PAGE && (
            <div className="notice">
              ⚠️ รายการที่ {PER_PAGE + 1}+ จะขึ้นหน้าใหม่อัตโนมัติ
              ({totalPgGroups} หน้ารวม)
            </div>
          )}

          {/* Serial list */}
          <div className="serial-list">
            {serials.length === 0
              ? <div className="empty"><div className="empty-ico">📋</div><p>ยังไม่มีรายการ<br/>กรอก Serial No. แล้วกด Enter</p></div>
              : serials.map((s, i) => {
                  const pgBoundary = i > 0 && i % PER_PAGE === 0
                  return (
                    <div key={i}>
                      {pgBoundary && (
                        <div className="page-divider">
                          <span>หน้า {Math.floor(i / PER_PAGE) + 1}</span>
                        </div>
                      )}
                      <div className={`sn-row ${editIdx === i ? 'sn-editing' : ''}`}>
                        <span className="sn-num">{(i % PER_PAGE) + 1}</span>
                        {editIdx === i
                          ? <input className="sn-edit-input" value={editVal}
                              onChange={e => setEditVal(e.target.value)}
                              onKeyDown={e => { if(e.key==='Enter') saveEdit(); if(e.key==='Escape') setEditIdx(null) }}
                              autoFocus />
                          : <span className="sn-val">{s}</span>
                        }
                        <div className="sn-actions">
                          {editIdx === i
                            ? <>
                                <button className="act-btn act-ok" onClick={saveEdit} title="บันทึก">✓</button>
                                <button className="act-btn act-cancel" onClick={() => setEditIdx(null)} title="ยกเลิก">✕</button>
                              </>
                            : <>
                                <button className="act-btn act-edit" onClick={() => { setEditIdx(i); setEditVal(s) }} title="แก้ไข">✏️</button>
                                <button className="act-btn act-del" onClick={() => setSerials(p => p.filter((_,j) => j !== i))} title="ลบ">🗑</button>
                              </>
                          }
                        </div>
                      </div>
                    </div>
                  )
                })
            }
          </div>

          {/* Download buttons */}
          <div className="dl-row">
            <button
              className="btn btn-outline"
              disabled={!serials.length || !!dlState || status !== 'ready'}
              onClick={() => handleDl('xlsx')}
            >
              {dlState === 'xlsx' ? <Spin/> : '⬇ Excel'}
            </button>
            <button
              className="btn btn-primary"
              disabled={!serials.length || !!dlState || status !== 'ready'}
              onClick={() => handleDl('pdf')}
            >
              {dlState === 'pdf' ? <Spin/> : '⬇ ดาวน์โหลด PDF'}
            </button>
          </div>

          {err && <div className="err-msg">❌ {err}</div>}
        </section>

        {/* ═══════════ RIGHT PANEL — PREVIEW ═══════════ */}
        <section className="panel right-panel">
          <div className="panel-head">
            <span className="panel-title">Preview</span>
            {previewTotal > 1 && (
              <div className="pagination">
                <button className="pg-btn" onClick={() => setPgIdx(p => Math.max(0,p-1))} disabled={pgIdx===0}>‹</button>
                <span className="pg-label">หน้า {pgIdx+1} / {previewTotal}</span>
                <button className="pg-btn" onClick={() => setPgIdx(p => Math.min(previewTotal-1,p+1))} disabled={pgIdx>=previewTotal-1}>›</button>
              </div>
            )}
          </div>

          <div className="preview-box">
            {status === 'waking' || status === 'error'
              ? <div className="pv-center">
                  {status === 'waking' ? <><BigSpin/><p>กำลังปลุก Server...<br/><small>(อาจใช้เวลา 30–60 วินาทีในการตื่น)</small></p></> : <p>❌ ไม่สามารถเชื่อมต่อ Server<br/><small>โปรดรีเฟรชหน้าอีกครั้ง</small></p>}
                </div>
              : previewLoading
              ? <div className="pv-center"><BigSpin/><p>กำลังสร้าง Preview...</p></div>
              : pages.length
              ? <img className="pv-img" src={`data:image/png;base64,${pages[pgIdx]}`} alt="preview" />
              : <div className="pv-center">
                  <div className="pv-icon">📄</div>
                  <p>เพิ่ม Serial No. เพื่อดู Preview</p>
                </div>
            }
          </div>
        </section>
      </div>
    </div>
  )
}

function WakeStatus({ status }) {
  const cfg = {
    waking: { color:'#d97706', icon:'⏳', text:'กำลังปลุก Server...' },
    ready:  { color:'#0e9f8e', icon:'🟢', text:'พร้อมใช้งาน' },
    error:  { color:'#e03e3e', icon:'🔴', text:'เชื่อมต่อไม่ได้' },
  }[status] || {}
  return (
    <div className="wake-badge" style={{ color: cfg.color, borderColor: cfg.color+'33', background: cfg.color+'10' }}>
      {cfg.icon} {cfg.text}
    </div>
  )
}
const Spin    = () => <span className="spin spin-sm"/>
const BigSpin = () => <span className="spin spin-lg"/>
