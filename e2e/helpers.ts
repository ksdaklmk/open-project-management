import AxeBuilder from '@axe-core/playwright'
import { expect, type Page } from '@playwright/test'

export const OWNER_EMAIL = 'phase1-owner@example.invalid'
export const OWNER_PASSWORD = 'Phase1-release-owner-2026!'

export async function signIn(page: Page) {
  await page.goto('/')
  await page.getByLabel('Email').fill(OWNER_EMAIL)
  await page.getByLabel('Password').fill(OWNER_PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  // The local Auth request can complete before the session listener has
  // hydrated workspace queries when all three browser projects start together.
  await expect(page.getByRole('heading', { name: 'List' })).toBeVisible({ timeout: 15_000 })
  await expect(page.getByLabel('Workspace', { exact: true })).toHaveValue(
    '91000000-0000-0000-0000-000000000001',
  )
}

export async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).analyze()
  expect(
    results.violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      targets: violation.nodes.map((node) => node.target),
    })),
  ).toEqual([])
}
