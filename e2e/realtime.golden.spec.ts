import { expect, test } from '@playwright/test'
import { signIn } from './helpers'

const REFS: Record<string, string> = {
  chromium: 'P1G-101',
  firefox: 'P1G-102',
  webkit: 'P1G-103',
}

test.describe('two-browser Realtime', () => {
  test.skip(process.env.E2E_AUTHENTICATED !== 'true', 'requires the deterministic local fixture')

  test('reconciles a remote task edit without overwriting a pristine drawer', async ({
    browser,
  }, testInfo) => {
    test.setTimeout(30_000)
    const contextA = await browser.newContext()
    const contextB = await browser.newContext()
    const pageA = await contextA.newPage()
    const pageB = await contextB.newPage()
    try {
      await Promise.all([signIn(pageA), signIn(pageB)])
      const ref = REFS[testInfo.project.name]
      await Promise.all([
        pageA.getByRole('button', { name: new RegExp(`Open ${ref}:`) }).click(),
        pageB.getByRole('button', { name: new RegExp(`Open ${ref}:`) }).click(),
      ])
      const titleA = pageA.getByRole('dialog').getByLabel('Title')
      const titleB = pageB.getByRole('dialog').getByLabel('Title')
      const syncedTitle = `${testInfo.project.name} realtime reconciled`
      await titleA.fill(syncedTitle)
      await titleA.press('Tab')
      await expect(titleB).toHaveValue(syncedTitle, { timeout: 15_000 })
      await expect(pageB.getByText('Reconnecting…')).toHaveCount(0)
    } finally {
      await Promise.all([contextA.close(), contextB.close()])
    }
  })
})
