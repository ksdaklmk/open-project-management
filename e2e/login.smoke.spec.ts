import { expect, test } from '@playwright/test'
import { expectNoAxeViolations } from './helpers'

test('renders the unauthenticated sign-in flow', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible()
  await expect(page.getByPlaceholder('Email')).toBeEditable()
  await expect(page.getByPlaceholder('Password')).toBeEditable()
  await expect(page.getByRole('button', { name: 'Sign up' })).toBeEnabled()
  await expect(page.getByRole('button', { name: 'Google' })).toBeEnabled()
  await expect(page.getByRole('button', { name: 'GitHub' })).toBeEnabled()
  await expectNoAxeViolations(page)
})
