import { describe, it, expect, beforeEach } from 'vitest'
import { getTheme, setTheme } from './theme'

describe('theme', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.removeAttribute('data-theme')
  })

  it('defaults to bloom when nothing is stored', () => {
    expect(getTheme()).toBe('bloom')
  })

  it('persists the chosen theme and applies it to <html>', () => {
    setTheme('slate')
    expect(localStorage.getItem('theme')).toBe('slate')
    expect(document.documentElement.getAttribute('data-theme')).toBe('slate')
    expect(getTheme()).toBe('slate')
  })

  it('ignores an invalid stored value and falls back to bloom', () => {
    localStorage.setItem('theme', 'neon')
    expect(getTheme()).toBe('bloom')
  })
})
