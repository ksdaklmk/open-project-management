import { axe } from 'jest-axe'
import { expect } from 'vitest'

export async function expectNoA11yViolations(container: HTMLElement) {
  const result = await axe(container)
  const details = result.violations
    .map(
      (violation) =>
        `${violation.id}: ${violation.help}\n${violation.nodes
          .map((node) => `  ${node.target.join(' ')} — ${node.failureSummary ?? ''}`)
          .join('\n')}`,
    )
    .join('\n\n')

  expect(result.violations, details).toEqual([])
}
