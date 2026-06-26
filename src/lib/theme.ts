export type Theme = 'bloom' | 'slate'
export const THEMES: Theme[] = ['bloom', 'slate']

export function getTheme(): Theme {
  const stored = localStorage.getItem('theme')
  return stored === 'slate' || stored === 'bloom' ? stored : 'bloom'
}

export function setTheme(t: Theme): void {
  localStorage.setItem('theme', t)
  document.documentElement.dataset.theme = t
}
