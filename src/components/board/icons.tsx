/* 도구 막대용 작은 아이콘 (선 굵기·크기를 통일) */
const base = {
  width: 20,
  height: 20,
  viewBox: '0 0 20 20',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
}

export const Icon = {
  play: () => (
    <svg {...base}>
      <circle cx="7.5" cy="10" r="5" fill="currentColor" stroke="none" />
      <circle cx="13" cy="10" r="4.6" fill="#fff" />
    </svg>
  ),
  black: () => (
    <svg {...base}>
      <circle cx="10" cy="10" r="6.5" fill="currentColor" stroke="none" />
      <path d="M15.5 3.5v4M13.5 5.5h4" />
    </svg>
  ),
  white: () => (
    <svg {...base}>
      <circle cx="10" cy="10" r="6" fill="#fff" />
      <path d="M15.5 3.5v4M13.5 5.5h4" />
    </svg>
  ),
  erase: () => (
    <svg {...base}>
      <circle cx="10" cy="10" r="6" strokeDasharray="2.2 2" />
      <path d="M7 7l6 6M13 7l-6 6" />
    </svg>
  ),
  TR: () => (
    <svg {...base}>
      <path d="M10 4l6 11H4z" />
    </svg>
  ),
  CR: () => (
    <svg {...base}>
      <circle cx="10" cy="10" r="5.5" />
    </svg>
  ),
  SQ: () => (
    <svg {...base}>
      <rect x="4.75" y="4.75" width="10.5" height="10.5" />
    </svg>
  ),
  MA: () => (
    <svg {...base}>
      <path d="M5.5 5.5l9 9M14.5 5.5l-9 9" />
    </svg>
  ),
  label: () => (
    <svg {...base} strokeWidth={0}>
      <text x="10" y="15" textAnchor="middle" fontSize="13" fontWeight="700" fill="currentColor">
        A
      </text>
    </svg>
  ),
  arrow: () => (
    <svg {...base}>
      <path d="M4 16L15 5M9 5h6v6" />
    </svg>
  ),
  first: () => (
    <svg {...base}>
      <path d="M5 4.5v11M15 5l-6 5 6 5" />
    </svg>
  ),
  back10: () => (
    <svg {...base}>
      <path d="M10 5l-6 5 6 5M17 5l-6 5 6 5" />
    </svg>
  ),
  back: () => (
    <svg {...base}>
      <path d="M12.5 5l-6 5 6 5" />
    </svg>
  ),
  forward: () => (
    <svg {...base}>
      <path d="M7.5 5l6 5-6 5" />
    </svg>
  ),
  forward10: () => (
    <svg {...base}>
      <path d="M3 5l6 5-6 5M10 5l6 5-6 5" />
    </svg>
  ),
  last: () => (
    <svg {...base}>
      <path d="M15 4.5v11M5 5l6 5-6 5" />
    </svg>
  ),
  up: () => (
    <svg {...base}>
      <path d="M5 12.5l5-5 5 5" />
    </svg>
  ),
  down: () => (
    <svg {...base}>
      <path d="M5 7.5l5 5 5-5" />
    </svg>
  ),
}
