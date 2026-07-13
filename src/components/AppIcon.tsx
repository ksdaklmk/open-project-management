export type AppIconName =
  | 'activity'
  | 'board'
  | 'chevronDown'
  | 'close'
  | 'gantt'
  | 'list'
  | 'logout'
  | 'plus'
  | 'search'
  | 'settings'
  | 'timeline'
  | 'workload'
  | 'workspace'

export function AppIcon({
  name,
  size = 18,
  className,
}: {
  name: AppIconName
  size?: number
  className?: string
}) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.7,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    className,
  }

  switch (name) {
    case 'list':
      return (
        <svg {...common}>
          <path d="M9 6h11M9 12h11M9 18h11" />
          <path d="M4 6h.01M4 12h.01M4 18h.01" strokeWidth="2.5" />
        </svg>
      )
    case 'board':
      return (
        <svg {...common}>
          <rect x="3.5" y="4" width="7" height="16" rx="1.5" />
          <rect x="13.5" y="4" width="7" height="10" rx="1.5" />
        </svg>
      )
    case 'gantt':
      return (
        <svg {...common}>
          <path d="M4 6h5M4 12h8M4 18h5" />
          <path d="M12 5h8v3h-8zM15 11h5v3h-5zM10 17h10v3H10z" />
        </svg>
      )
    case 'timeline':
      return (
        <svg {...common}>
          <path d="M4 7h16M4 17h16" />
          <circle cx="8" cy="7" r="2" fill="var(--surface)" />
          <circle cx="16" cy="17" r="2" fill="var(--surface)" />
        </svg>
      )
    case 'activity':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8.5" />
          <path d="M12 7.5V12l3 2" />
        </svg>
      )
    case 'workload':
      return (
        <svg {...common}>
          <path d="M5 19V13M10 19V8M15 19V11M20 19V5" />
          <path d="M3 19h19" />
        </svg>
      )
    case 'settings':
      return (
        <svg {...common}>
          <path d="M4 7h10M18 7h2M4 17h2M10 17h10" />
          <circle cx="16" cy="7" r="2" />
          <circle cx="8" cy="17" r="2" />
        </svg>
      )
    case 'logout':
      return (
        <svg {...common}>
          <path d="M10 5H5v14h5M14 8l4 4-4 4M8 12h10" />
        </svg>
      )
    case 'workspace':
      return (
        <svg {...common}>
          <rect x="4" y="4" width="16" height="16" rx="2" />
          <path d="M9 4v16M9 9h11" />
        </svg>
      )
    case 'search':
      return (
        <svg {...common}>
          <circle cx="10.5" cy="10.5" r="6" />
          <path d="m15 15 4 4" />
        </svg>
      )
    case 'plus':
      return (
        <svg {...common}>
          <path d="M12 5v14M5 12h14" />
        </svg>
      )
    case 'close':
      return (
        <svg {...common}>
          <path d="m6 6 12 12M18 6 6 18" />
        </svg>
      )
    case 'chevronDown':
      return (
        <svg {...common}>
          <path d="m7 9.5 5 5 5-5" />
        </svg>
      )
  }
}
