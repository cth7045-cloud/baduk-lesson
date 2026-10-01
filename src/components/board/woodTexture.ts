/**
 * 나무결 판 무늬를 캔버스로 한 번만 그려서 이미지 주소로 돌려줌.
 * 이미지 파일 없이도 비자나무 판 느낌을 내고, 매번 다시 그리지 않아 폰에서도 가벼움.
 */
let cached: string | null = null

function rand(seed: number) {
  // 항상 같은 무늬가 나오도록 고정된 난수
  let s = seed
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}

export function woodTextureUrl(): string {
  if (cached) return cached
  if (typeof document === 'undefined') return ''
  const W = 640
  const H = 640
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''
  const r = rand(20241001)

  const base = ctx.createLinearGradient(0, 0, W, H)
  base.addColorStop(0, '#e2bc79')
  base.addColorStop(0.5, '#ddb470')
  base.addColorStop(1, '#d6ab66')
  ctx.fillStyle = base
  ctx.fillRect(0, 0, W, H)

  // 세로로 곧게 뻗은 결(정목)
  for (let i = 0; i < 260; i++) {
    const x0 = r() * W
    const width = 0.4 + r() * 2.2
    const dark = r() < 0.7
    const alpha = 0.03 + r() * 0.08
    ctx.strokeStyle = dark ? `rgba(120, 72, 25, ${alpha})` : `rgba(255, 236, 196, ${alpha})`
    ctx.lineWidth = width
    ctx.beginPath()
    const wave = 1 + r() * 4
    const freq = 0.002 + r() * 0.006
    const phase = r() * Math.PI * 2
    for (let y = 0; y <= H; y += 8) {
      const x = x0 + Math.sin(y * freq + phase) * wave
      if (y === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.stroke()
  }

  // 은은한 얼룩
  for (let i = 0; i < 18; i++) {
    const x = r() * W
    const y = r() * H
    const rad = 60 + r() * 160
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad)
    g.addColorStop(0, `rgba(160, 105, 45, ${0.03 + r() * 0.04})`)
    g.addColorStop(1, 'rgba(160, 105, 45, 0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, W, H)
  }

  try {
    cached = canvas.toDataURL('image/jpeg', 0.86)
  } catch {
    cached = ''
  }
  return cached
}
