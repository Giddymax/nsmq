import { useEffect, useState } from 'react'
import { ArrowDown, ArrowUpRight, Check, CircleHelp, Download, LoaderCircle, MapPin, CalendarDays, RotateCcw, Sparkles, X } from 'lucide-react'
import { jsPDF } from 'jspdf'
import { supabase } from './supabase'

type Contest = { contest_number: number; entrant_count: number }
type DrawResult = { entry_id: string; contest_number: number; remaining: number }
type FinalEntry = { school_name: string; contest_number: number }
const initialContests = [1, 2, 3].map((contest_number) => ({ contest_number, entrant_count: 0 }))

export default function App() {
  const [school, setSchool] = useState('')
  const [contests, setContests] = useState<Contest[]>(initialContests)
  const [draw, setDraw] = useState<DrawResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [configured, setConfigured] = useState(Boolean(supabase))
  const [pdfLoading, setPdfLoading] = useState(false)
  const [pdfError, setPdfError] = useState('')
  const [resetOpen, setResetOpen] = useState(false)
  const [resetPassword, setResetPassword] = useState('')
  const [resetLoading, setResetLoading] = useState(false)
  const [resetError, setResetError] = useState('')

  async function refreshCounts() {
    if (!supabase) return
    const { data, error: countError } = await supabase.rpc('get_contest_counts')
    if (countError) return
    setContests(data as Contest[])
  }

  useEffect(() => { void refreshCounts() }, [])

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!school.trim()) return
    if (!supabase) {
      setConfigured(false)
      setError('Connect your Supabase project to open the ballot.')
      return
    }
    setLoading(true)
    setError('')
    setDraw(null)
    const { data, error: drawError } = await supabase.rpc('enter_quiz_draw', { school_name: school.trim() })
    setLoading(false)
    if (drawError) {
      const message = drawError.message
      if (message.includes('DRAW_FULL')) setError('All nine places have been drawn. The ballot is now closed.')
      else if (message.includes('SCHOOL_ALREADY_ENTERED')) setError('This school has already entered the draw. Each school gets one entry.')
      else setError('We couldn’t save that entry. Please check the school name and try again.')
      await refreshCounts()
      return
    }
    const result = (data as DrawResult[])[0]
    setDraw(result)
    setSchool('')
    await refreshCounts()
  }

  async function downloadFinalResults() {
    if (!supabase) return
    setPdfLoading(true)
    setPdfError('')
    const { data, error: resultsError } = await supabase.rpc('get_final_draw_results')
    setPdfLoading(false)
    if (resultsError || !data || data.length !== 9) {
      setPdfError('Final results are not available yet. Please refresh the page and try again.')
      return
    }

    const entries = data as FinalEntry[]
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    pdf.setFillColor(7, 55, 110)
    pdf.rect(0, 0, 210, 48, 'F')
    pdf.setTextColor(255, 255, 255)
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(10)
    pdf.text('PRIME MEDIA CONSULT', 18, 17)
    pdf.setFontSize(16)
    pdf.text('2026 SCIENCE MATHS & COMPUTING QUIZ', 18, 29)
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(10)
    pdf.text('Official draw results  |  16 & 19 December 2026', 18, 39)

    pdf.setTextColor(22, 62, 114)
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(11)
    pdf.text('OFFICIAL FINAL BALLOT', 18, 62)
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(9)
    pdf.setTextColor(95, 112, 139)
    pdf.text('Nine schools · Three contests · Three schools per contest', 18, 69)

    const startY = 82
    const rowHeight = 13
    pdf.setFillColor(236, 243, 250)
    pdf.roundedRect(16, startY, 178, 12, 2, 2, 'F')
    pdf.setTextColor(22, 62, 114)
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(9)
    pdf.text('SCHOOL', 21, startY + 8)
    pdf.text('CONTEST', 170, startY + 8)

    let rowY = startY + 12
    entries.forEach((entry, index) => {
      const schoolLines = pdf.splitTextToSize(entry.school_name, 130)
      const dynamicRowHeight = Math.max(rowHeight, schoolLines.length * 5 + 5)
      const y = rowY
      if (index % 2 === 0) {
        pdf.setFillColor(250, 252, 255)
        pdf.rect(16, y, 178, dynamicRowHeight, 'F')
      }
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(10)
      pdf.setTextColor(31, 64, 112)
      pdf.text(schoolLines, 21, y + 7)
      pdf.setFont('helvetica', 'bold')
      pdf.setTextColor(7, 86, 165)
      pdf.text(`Contest ${entry.contest_number}`, 170, y + 8)
      rowY += dynamicRowHeight
    })

    pdf.setDrawColor(190, 208, 229)
    pdf.line(16, rowY + 5, 194, rowY + 5)
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(8)
    pdf.setTextColor(102, 121, 146)
    pdf.text('Asuom Circuit Schools · Asuom, Bomso & Tweapease', 16, rowY + 13)
    pdf.text('Generated from the completed ballot', 16, rowY + 19)
    pdf.save('prime-media-consult-2026-quiz-results.pdf')
  }

  async function resetBallot(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase) {
      setResetError('Connect Supabase before resetting the ballot.')
      return
    }
    setResetLoading(true)
    setResetError('')
    let code = ''
    const { data, error: resetRequestError } = await supabase.functions.invoke('reset-ballot', {
      body: { password: resetPassword },
    })
    if (resetRequestError) {
      try {
        const response = resetRequestError.context
        if (response instanceof Response) code = (await response.json()).error ?? ''
      } catch {
        code = ''
      }
    } else {
      code = data?.error ?? ''
    }
    setResetLoading(false)

    if (resetRequestError || code) {
      if (code === 'INCORRECT_PASSWORD') setResetError('That password is incorrect.')
      else if (code === 'TOO_MANY_ATTEMPTS') setResetError('Too many attempts. Try again in 15 minutes.')
      else if (code === 'RESET_NOT_CONFIGURED') setResetError('The Supabase reset function is not configured yet.')
      else setResetError('The ballot could not be reset. Please try again.')
      return
    }

    setContests(initialContests)
    setSchool('')
    setDraw(null)
    setError('')
    setPdfError('')
    setResetPassword('')
    setResetOpen(false)
    await refreshCounts()
  }

  const total = contests.reduce((sum, contest) => sum + Number(contest.entrant_count), 0)
  const full = total >= 9

  return (
    <main className="page-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Prime Media Consult quiz home"><img className="brand-logo" src="/prime-media-consult-logo.png" alt="Prime Media Consult — Promoting Education, Entertainment and More for the Future Children" /></a>
        <div className="edition"><span className="live-dot" /> SCIENCE · MATHS · COMPUTING <span className="edition-year">/ 2026</span></div>
        <a className="help-link" href="#how-it-works"><CircleHelp size={16} /> HOW IT WORKS <ArrowUpRight size={14} /></a>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <h1>Science.<br />Maths.<br /><em>Computing.</em></h1>
          <div className="subject-stamp"><Sparkles size={16} /> THE SCHOOL QUIZ</div>
          <p className="hero-description">Enter your school in the Prime Media Consult 2026 Science Maths &amp; Computing Quiz draw and discover your contest number.</p>
          <div className="event-facts"><span><CalendarDays size={15} /> 16 &amp; 19 DECEMBER 2026</span><span><MapPin size={15} /> ASUOM CIRCUIT</span></div>
          <a className="scroll-cue" href="#entry"><span className="scroll-icon"><ArrowDown size={15} /></span> ENTER THE SCHOOL DRAW</a>
        </div>
        <div className="hero-art">
          <div className="poster-frame"><img src="/asuom-quiz-poster.jpeg" alt="Prime Media Consult 2026 Science Maths and Computing Quiz event poster" /><div className="poster-tag"><span className="live-dot" /> OFFICIAL EVENT POSTER</div></div>
          <div className="art-caption">K’BIBIREM MUNICIPAL · GHANA <span>✳</span></div>
        </div>
      </section>

      <section className="event-ribbon"><div><span className="ribbon-label">THE CHALLENGE</span><strong>THREE CONTESTS</strong></div><span className="ribbon-plus">✳</span><div><span className="ribbon-label">THE DRAW</span><strong>NINE SCHOOLS</strong></div><span className="ribbon-plus">✳</span><div><span className="ribbon-label">THE RULE</span><strong>ONE ENTRY EACH</strong></div></section>

      <section className="draw-section" id="entry">
        <div className="section-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> STEP INTO THE DRAW</div><h2>Which contest<br />will your school get?</h2></div><div className="places-counter"><span className="counter-number">{String(Math.max(0, 9 - total)).padStart(2, '0')}</span><span>PLACES<br />LEFT</span></div></div>
        <div className="entry-grid">
          <form className="entry-card" onSubmit={submit}>
            <label htmlFor="school">SCHOOL NAME</label>
            <div className="input-wrap"><input id="school" value={school} onChange={(e) => setSchool(e.target.value)} placeholder="Enter your school name" maxLength={120} required disabled={loading || full} /><span className="input-index">ONE ENTRY<br />PER SCHOOL</span></div>
            <div className="form-bottom"><span className="form-hint">Every school enters once.<br />Your contest is picked at random.</span><button type="submit" disabled={loading || full || !school.trim()}>{loading ? <><LoaderCircle className="spin" size={16} /> DRAWING…</> : full ? 'DRAW CLOSED' : <>DRAW MY CONTEST <ArrowUpRight size={16} /></>}</button></div>
            {error && <div className="error-message" role="alert">{error}</div>}
            {draw && <div className="result-message" role="status"><span className="result-check"><Check size={17} /></span><span><b>Contest {draw.contest_number}!</b> Your school is in the draw. Each school may enter once.</span><span className="result-number">0{draw.contest_number}</span></div>}
            {full && <div className="pdf-download"><p>The draw is closed. Download the final school and contest assignments.</p><button type="button" className="pdf-button" onClick={downloadFinalResults} disabled={pdfLoading}>{pdfLoading ? <><LoaderCircle className="spin" size={16} /> PREPARING PDF…</> : <><Download size={16} /> DOWNLOAD FINAL RESULTS PDF</>}</button>{pdfError && <div className="error-message" role="alert">{pdfError}</div>}</div>}
            {!configured && <div className="setup-note">Ballot setup required: add your Supabase project keys to enable entries.</div>}
          </form>
          <aside className="live-card"><div className="live-card-top"><span><span className="live-dot" /> LIVE CAPACITY</span><span className="mono">{String(total).padStart(2, '0')} / 09</span></div><div className="contest-list">{contests.map((contest) => <div className="contest-row" key={contest.contest_number}><div className="contest-id">0{contest.contest_number}</div><div className="contest-info"><div className="contest-name">Contest {contest.contest_number}</div><div className="slots" aria-label={`${contest.entrant_count} of 3 places filled`}>{[0, 1, 2].map((slot) => <span key={slot} className={slot < Number(contest.entrant_count) ? 'slot filled' : 'slot'} />)}</div></div><div className="contest-count">{contest.entrant_count}<span> / 3</span></div></div>)}</div><div className="capacity-foot"><span>THREE SCHOOLS PER CONTEST</span><span className="capacity-icon">↗</span></div></aside>
        </div>
      </section>

      <section className="how-section" id="how-it-works"><div className="how-title"><div className="eyebrow"><span className="eyebrow-line" /> FAIR DRAW, BIG ENERGY</div><h2>How it works</h2><p>One school, one shot.<br />Let the draw decide.</p></div><div className="steps"><article className="step"><div className="step-number">01</div><div><h3>Enter your school</h3><p>Use your school’s full name. Each school may enter once.</p></div></article><article className="step"><div className="step-number">02</div><div><h3>Get a contest number</h3><p>The draw randomly assigns an open place in Contest 1, 2 or 3.</p></div></article><article className="step"><div className="step-number">03</div><div><h3>Get ready to shine</h3><p>Three schools can be assigned to each contest. See you in December!</p></div></article></div></section>

      <footer className="footer"><a className="brand" href="#top" aria-label="Prime Media Consult home"><img className="brand-logo" src="/prime-media-consult-logo.png" alt="Prime Media Consult" /></a><span>SCIENCE · MATHS · COMPUTING · 2026</span><span className="footer-motto">MADE FOR BRIGHT MINDS <span className="footer-star">✳</span></span><button type="button" className="reset-trigger" onClick={() => { setResetError(''); setResetOpen(true) }}><RotateCcw size={12} /> RESET BALLOT</button></footer>

      {resetOpen && <div className="reset-backdrop"><section className="reset-dialog" role="dialog" aria-modal="true" aria-labelledby="reset-title"><button className="reset-close" type="button" aria-label="Close reset dialog" onClick={() => setResetOpen(false)} disabled={resetLoading}><X size={18} /></button><div className="eyebrow"><span className="eyebrow-line" /> ADMIN ACTION</div><h2 id="reset-title">Reset the ballot?</h2><p>This clears all school entries and returns all three contests to zero. Enter the reset password to continue.</p><form onSubmit={resetBallot}><label htmlFor="reset-password">RESET PASSWORD</label><input id="reset-password" type="password" autoComplete="current-password" value={resetPassword} onChange={(e) => setResetPassword(e.target.value)} required maxLength={128} autoFocus disabled={resetLoading} />{resetError && <div className="error-message" role="alert">{resetError}</div>}<div className="reset-actions"><button type="button" className="reset-cancel" onClick={() => { setResetOpen(false); setResetPassword('') }} disabled={resetLoading}>CANCEL</button><button type="submit" className="reset-confirm" disabled={resetLoading || !resetPassword}>{resetLoading ? <><LoaderCircle className="spin" size={15} /> RESETTING…</> : <><RotateCcw size={15} /> RESET BALLOT</>}</button></div></form></section></div>}
    </main>
  )
}

