import { useEffect, useRef, useState } from 'react'
// 구형 브라우저 호환판 (삼성 인터넷·업데이트 안 된 Chrome에서도 동작)
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'
import s from './Library.module.css'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

/**
 * PDF 보기. 갤럭시 폰·태블릿의 Chrome·삼성 인터넷은 PDF를 페이지 안에 직접 못 띄우므로
 * pdf.js로 쪽마다 그림으로 그려서 보여 줌. 화면에 가까워진 쪽만 그려서 가벼움.
 */
export default function PdfViewer({ url }: { url: string }) {
  const [doc, setDoc] = useState<pdfjs.PDFDocumentProxy | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    const task = pdfjs.getDocument({ url })
    task.promise.then(
      (d) => alive && setDoc(d),
      () => alive && setError('PDF를 열지 못했습니다.'),
    )
    return () => {
      alive = false
      void task.destroy()
    }
  }, [url])

  if (error) return <p className={s.error}>{error}</p>
  if (!doc) return <p className={s.muted}>PDF를 여는 중…</p>
  return (
    <div className={s.pdfDoc}>
      {Array.from({ length: doc.numPages }, (_, i) => (
        <PdfPage key={i} doc={doc} pageNumber={i + 1} />
      ))}
    </div>
  )
}

function PdfPage({ doc, pageNumber }: { doc: pdfjs.PDFDocumentProxy; pageNumber: number }) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [visible, setVisible] = useState(pageNumber <= 2)
  const [ratio, setRatio] = useState(1.414)

  useEffect(() => {
    const el = wrapRef.current
    if (!el || visible) return
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && setVisible(true), { rootMargin: '600px' })
    io.observe(el)
    return () => io.disconnect()
  }, [visible])

  useEffect(() => {
    if (!visible) return
    let cancelled = false
    let render: { cancel: () => void } | null = null
    void doc.getPage(pageNumber).then((page) => {
      if (cancelled || !canvasRef.current || !wrapRef.current) return
      const base = page.getViewport({ scale: 1 })
      setRatio(base.height / base.width)
      const width = wrapRef.current.clientWidth
      const scale = (width / base.width) * Math.min(window.devicePixelRatio || 1, 2)
      const viewport = page.getViewport({ scale })
      const canvas = canvasRef.current
      canvas.width = Math.floor(viewport.width)
      canvas.height = Math.floor(viewport.height)
      const task = page.render({ canvas, viewport })
      render = task
      task.promise.catch(() => {})
    })
    return () => {
      cancelled = true
      render?.cancel()
    }
  }, [doc, pageNumber, visible])

  return (
    <div ref={wrapRef} className={s.pdfPage} style={{ aspectRatio: `1 / ${ratio}` }}>
      <canvas ref={canvasRef} aria-label={`${pageNumber}쪽`} />
    </div>
  )
}
