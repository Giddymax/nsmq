import { useEffect, useState } from 'react'
import { ArrowDown, ArrowUpRight, Check, CircleHelp, Download, LoaderCircle, MapPin, CalendarDays } from 'lucide-react'
import { jsPDF } from 'jspdf'
import { supabase } from './supabase'

type Contest = { contest_number: number; entrant_count: number }
type DrawResult = { entry_id: string; contest_number: number; remaining: number }
type FinalEntry = { school_name: string; contest_number: number }
const initialContests = [1, 2, 3].map((contest_number) => ({ contest_number, entrant_count: 0 }))
const schoolOptions = [
  'Bomso Advent',
  'Tweapease Pentecost',
  'Asuom DGM',
  'Asuom MA Model',
  'Asuom Jasper Community School',
  'Asuom Salvation Army',
  'Asuom Presby',
  'Asuom Roman Catholic',
  'Asuom Islamic',
  'Asuom New Ideal',
]

async function loadPmcLogo() {
  const response = await fetch('/prime-media-consult-logo.png')
  if (!response.ok) throw new Error('Could not load the Prime Media Consult logo.')
  const logoBlob = await response.blob()

  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => typeof reader.result === 'string'
      ? resolve(reader.result)
      : reject(new Error('Could not prepare the Prime Media Consult logo.'))
    reader.onerror = () => reject(reader.error ?? new Error('Could not prepare the Prime Media Consult logo.'))
    reader.readAsDataURL(logoBlob)
  })
}

export default function App() {
  const [school, setSchool] = useState('')
  const [contests, setContests] = useState<Contest[]>(initialContests)
  const [draw, setDraw] = useState<DrawResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [configured, setConfigured] = useState(Boolean(supabase))
  const [pdfLoading, setPdfLoading] = useState(false)
  const [pdfError, setPdfError] = useState('')

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
    try {
      const { data, error: resultsError } = await supabase.rpc('get_final_draw_results')
      if (resultsError || !data || data.length !== 9) {
        setPdfError('Final results are not available yet. Please refresh the page and try again.')
        return
      }

      const entries = data as FinalEntry[]
      const logoData = await loadPmcLogo()
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
      const pageWidth = 297
      const navy = [8, 53, 105] as const
      const blue = [18, 91, 163] as const
      const gold = [225, 171, 41] as const
      const ink = [28, 52, 81] as const
      const muted = [104, 122, 146] as const

      pdf.setProperties({
        title: 'Prime Media Consult 2026 SMC Quiz - Official Draw Results',
        subject: 'Final school and contest assignments',
        author: 'Prime Media Consult',
      })

      // Branded masthead and logo panel.
      pdf.setFillColor(...navy)
      pdf.rect(0, 0, pageWidth, 49, 'F')
      pdf.setFillColor(...gold)
      pdf.rect(0, 49, pageWidth, 2.2, 'F')
      pdf.setFillColor(255, 255, 255)
      pdf.roundedRect(13, 9, 68, 31, 3, 3, 'F')
      const logoSize = pdf.getImageProperties(logoData)
      const logoRatio = logoSize.width / logoSize.height
      const logoWidth = Math.min(60, 27 * logoRatio)
      const logoHeight = logoWidth / logoRatio
      pdf.addImage(logoData, 'PNG', 17, 24.5 - logoHeight / 2, logoWidth, logoHeight)

      pdf.setTextColor(235, 242, 250)
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(8)
      pdf.text('OFFICIAL FINAL DRAW', 94, 13)
      pdf.setDrawColor(...gold)
      pdf.setLineWidth(0.8)
      pdf.line(94, 17, 111, 17)
      pdf.setTextColor(255, 255, 255)
      pdf.setFontSize(18)
      pdf.text('SCIENCE, MATHS & COMPUTING QUIZ', 94, 27)
      pdf.setTextColor(217, 229, 242)
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(9)
      pdf.text('PRIME MEDIA CONSULT 2026  |  16 & 19 DECEMBER 2026  |  ASUOM CIRCUIT', 94, 37)
      pdf.setFillColor(...gold)
      pdf.roundedRect(250, 12, 32, 10, 5, 5, 'F')
      pdf.setTextColor(...navy)
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(7)
      pdf.text('DRAW CLOSED', 266, 18.5, { align: 'center' })

      // A compact summary band keeps the printout easy to scan.
      pdf.setTextColor(...ink)
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(11)
      pdf.text('FINAL RESULTS', 14, 64)
      pdf.setTextColor(...muted)
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(8)
      pdf.text('Official school assignments by contest', 14, 70)

      const summaryY = 58
      const summaryW = 42
      const summaryGap = 4
      const summaryStart = 145
      const summaries = [
        ['09', 'SCHOOLS'],
        ['03', 'CONTESTS'],
        ['03', 'PLACES EACH'],
      ]
      summaries.forEach(([count, label], index) => {
        const x = summaryStart + index * (summaryW + summaryGap)
        pdf.setFillColor(238, 245, 252)
        pdf.roundedRect(x, summaryY, summaryW, 18, 2, 2, 'F')
        pdf.setTextColor(...blue)
        pdf.setFont('helvetica', 'bold')
        pdf.setFontSize(12)
        pdf.text(count, x + 5, summaryY + 8)
        pdf.setTextColor(...muted)
        pdf.setFontSize(6.5)
        pdf.text(label, x + 15, summaryY + 8)
      })

      // Three equal cards put each contest and its three schools on one page.
      const cardY = 82
      const cardW = 85
      const cardH = 110
      const cardGap = 7
      const cardStart = 14
      for (let contestNumber = 1; contestNumber <= 3; contestNumber += 1) {
        const cardX = cardStart + (contestNumber - 1) * (cardW + cardGap)
        pdf.setFillColor(255, 255, 255)
        pdf.setDrawColor(217, 228, 240)
        pdf.setLineWidth(0.35)
        pdf.roundedRect(cardX, cardY, cardW, cardH, 3, 3, 'FD')
        pdf.setFillColor(...navy)
        pdf.roundedRect(cardX, cardY, cardW, 20, 3, 3, 'F')
        pdf.setFillColor(...blue)
        pdf.rect(cardX, cardY + 15, cardW, 5, 'F')
        pdf.setFillColor(...gold)
        pdf.circle(cardX + 10, cardY + 10, 5, 'F')
        pdf.setTextColor(...navy)
        pdf.setFont('helvetica', 'bold')
        pdf.setFontSize(9)
        pdf.text(`0${contestNumber}`, cardX + 10, cardY + 13, { align: 'center' })
        pdf.setTextColor(255, 255, 255)
        pdf.setFontSize(12)
        pdf.text(`CONTEST ${contestNumber}`, cardX + 19, cardY + 12)

        const contestEntries = entries
          .filter((entry) => entry.contest_number === contestNumber)
          .sort((a, b) => a.school_name.localeCompare(b.school_name))
        const rowTop = cardY + 24
        const rowHeight = 27
        contestEntries.forEach((entry, index) => {
          const rowY = rowTop + index * rowHeight
          if (index > 0) {
            pdf.setDrawColor(228, 235, 243)
            pdf.setLineWidth(0.25)
            pdf.line(cardX + 6, rowY, cardX + cardW - 6, rowY)
          }
          pdf.setTextColor(...gold)
          pdf.setFont('helvetica', 'bold')
          pdf.setFontSize(8)
          pdf.text(`0${index + 1}`, cardX + 8, rowY + 12)
          pdf.setTextColor(...ink)
          pdf.setFont('helvetica', 'bold')
          pdf.setFontSize(10)
          const schoolLines = pdf.splitTextToSize(entry.school_name, cardW - 27)
          pdf.text(schoolLines, cardX + 18, rowY + 9, { lineHeightFactor: 1.2 })
        })
      }

      pdf.setDrawColor(214, 225, 238)
      pdf.setLineWidth(0.35)
      pdf.line(14, 199, 283, 199)
      pdf.setTextColor(...muted)
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(7)
      pdf.text('PRIME MEDIA CONSULT  |  Promoting Education, Entertainment and More for The Future Children', 14, 204)
      pdf.text('Asuom Circuit Schools', 283, 204, { align: 'right' })

      pdf.save('prime-media-consult-2026-quiz-results.pdf')
    } catch (error) {
      console.error('Could not create final results PDF:', error)
      setPdfError('We couldn’t prepare the PDF. Please try again.')
    } finally {
      setPdfLoading(false)
    }
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
          <div className="subject-stamp">THE SMC QUIZ</div>
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
            <div className="input-wrap"><select id="school" value={school} onChange={(e) => setSchool(e.target.value)} required disabled={loading || full}><option value="" disabled>Select your school</option>{schoolOptions.map((name) => <option key={name} value={name}>{name}</option>)}</select><span className="input-index">ONE ENTRY<br />PER SCHOOL</span></div>
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

      <footer className="footer"><a className="brand" href="#top" aria-label="Prime Media Consult home"><img className="brand-logo" src="/prime-media-consult-logo.png" alt="Prime Media Consult" /></a><span>SCIENCE · MATHS · COMPUTING · 2026</span><span className="footer-motto">Promoting Education, Entertainment and More for The Future Children</span></footer>
    </main>
  )
}

