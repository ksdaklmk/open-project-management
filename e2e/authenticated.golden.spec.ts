import { expect, test } from '@playwright/test'
import { expectNoAxeViolations, signIn } from './helpers'

test.describe('authenticated Phase 1 golden paths', () => {
  test.skip(process.env.E2E_AUTHENTICATED !== 'true', 'requires the deterministic local fixture')

  test('creates, edits, comments on, and plans work across every view', async ({
    page,
  }, testInfo) => {
    await signIn(page)
    await expect(page.getByRole('heading', { name: 'Set up your team’s first week' })).toBeVisible()
    await expectNoAxeViolations(page)

    const engine = testInfo.project.name
    const originalTitle = `Golden path ${engine}`
    const editedTitle = `${originalTitle} edited`
    await page.getByRole('button', { name: '+ New task' }).click()
    await page.getByLabel('New task title').fill(originalTitle)
    await page.getByLabel('New task title').press('Enter')

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await dialog.getByLabel('Title').fill(editedTitle)
    await dialog.getByLabel('Title').press('Tab')
    await dialog.getByLabel('Points').fill('5')
    await dialog.getByLabel('Points').press('Tab')
    await dialog.getByLabel('Description').fill('Privacy-safe browser release fixture')
    await dialog.getByLabel('Description').press('Tab')
    await dialog.getByLabel('Add a comment').fill(`Validated in ${engine}`)
    await dialog.getByRole('button', { name: 'Post' }).click()
    await expect(
      dialog.getByRole('paragraph').filter({ hasText: `Validated in ${engine}` }),
    ).toBeVisible()
    await expectNoAxeViolations(page)
    await dialog.getByRole('button', { name: 'Close' }).click()
    await expect(dialog).toBeHidden()

    await page.getByLabel('Search tasks').fill(editedTitle)
    await expect(
      page.getByRole('button', { name: new RegExp(`Open .*: ${editedTitle}`) }),
    ).toBeVisible()
    await page.getByRole('button', { name: 'Clear filters' }).click()

    await page.getByRole('button', { name: 'My Work', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'My Work', exact: true })).toBeVisible()
    await page.getByRole('button', { name: /Open P1G-101:/ }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click()

    for (const view of ['Board', 'Gantt', 'Timeline', 'Activity', 'Workload', 'Settings']) {
      await page.getByRole('button', { name: view, exact: true }).click()
      await expect(page.getByRole('heading', { name: view, exact: true }).first()).toBeVisible()
    }
    await expect(page.getByRole('heading', { name: 'Workspace settings' })).toBeVisible()
  })

  test('supports keyboard navigation and a 320px viewport without page overflow', async ({
    page,
  }, testInfo) => {
    await signIn(page)
    await page.evaluate(() => {
      document.body.tabIndex = -1
      document.body.focus()
    })
    // macOS WebKit follows the system convention where Option+Tab includes
    // links even when full keyboard access is disabled.
    const tabKey =
      testInfo.project.name === 'webkit' && process.platform === 'darwin' ? 'Alt+Tab' : 'Tab'
    await page.keyboard.press(tabKey)
    await expect(page.getByRole('link', { name: 'Skip to main content' })).toBeFocused()

    await page.setViewportSize({ width: 320, height: 720 })
    for (const view of ['My Work', 'List', 'Board', 'Gantt', 'Timeline', 'Activity', 'Workload']) {
      await page.getByRole('button', { name: view, exact: true }).click()
      await expect(page.getByRole('heading', { name: view, exact: true })).toBeVisible()
      const viewport = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
      }))
      expect(viewport.scrollWidth).toBeLessThanOrEqual(viewport.innerWidth)
    }

    await page.getByRole('button', { name: 'List', exact: true }).click()
    await page.getByRole('button', { name: /Open P1G-101:/ }).click()
    const drawer = page.getByRole('dialog')
    await expect(drawer).toBeVisible()
    expect(await drawer.evaluate((element) => element.getBoundingClientRect().width)).toBeCloseTo(
      320,
      2,
    )
    await expectNoAxeViolations(page)
  })

  test('opens Inbox notifications, watches a task, and selects a normalized mention', async ({
    page,
  }, testInfo) => {
    await signIn(page)
    await page.getByRole('button', { name: 'Inbox', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Inbox', exact: true })).toBeVisible()
    await page.getByRole('button', { name: /assigned to P1G-101/ }).click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    const watch = dialog.getByRole('button', { name: /^(Watch|Watching)$/ })
    if ((await watch.getAttribute('aria-pressed')) === 'false') await watch.click()
    await expect(dialog.getByRole('button', { name: 'Watching' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    const composer = dialog.getByLabel('Add a comment')
    await composer.fill('Could you check this, @Phase One M')
    await page
      .getByRole('listbox', { name: 'Workspace members' })
      .getByRole('option', { name: 'Phase One Member' })
      .click()
    await composer.pressSequentially(`Validated in ${testInfo.project.name}`)
    await dialog.getByRole('button', { name: 'Post' }).click()
    await expect(
      dialog
        .getByRole('paragraph')
        .filter({ hasText: `@Phase One Member Validated in ${testInfo.project.name}` }),
    ).toBeVisible()
    await expectNoAxeViolations(page)
  })

  test('saves, updates, duplicates, shares, and deletes a URL-backed task view', async ({
    page,
  }, testInfo) => {
    await signIn(page)
    const suffix = `${testInfo.project.name}-${Date.now()}`
    const name = `Saved ${suffix}`
    const revisedName = `${name} revised`
    const copyName = `${revisedName} copy`.slice(0, 80)

    await page.getByLabel('Search tasks').fill('Phase')
    await page.getByLabel('Saved views', { exact: true }).click()
    await page.getByRole('button', { name: 'Save current' }).click()
    await page.getByLabel('New saved view name').fill(name)
    await page.getByLabel('New saved view visibility').selectOption('workspace')
    await page.getByRole('button', { name: 'Create saved view' }).click()
    await expect(page).toHaveURL(/savedView=/)
    await expect(page.getByRole('button', { name: 'Copy share link' })).toBeVisible()

    await page.getByLabel('Saved views', { exact: true }).click()
    await page.getByLabel('Search tasks').fill('website')
    await expect(page).not.toHaveURL(/savedView=/)
    await page.getByLabel('Saved views', { exact: true }).click()
    await page.getByLabel('Saved view name').fill(revisedName)
    await page.getByRole('button', { name: 'Update with current filters' }).click()
    await expect(page).toHaveURL(/savedView=/)
    await expect(page).toHaveURL(/q=website/)

    await page.getByRole('button', { name: 'Duplicate' }).click()
    await expect(page.getByRole('button', { name: new RegExp(`^${copyName}`) })).toBeVisible()
    await page.getByRole('button', { name: 'Delete' }).click()
    await page.getByRole('button', { name: 'Confirm delete' }).click()
    await expect(page).not.toHaveURL(/savedView=/)

    await page.getByRole('button', { name: new RegExp(`^${revisedName}`) }).click()
    await page.getByRole('button', { name: 'Delete' }).click()
    await page.getByRole('button', { name: 'Confirm delete' }).click()
    await expect(page.getByRole('button', { name: new RegExp(`^${revisedName}`) })).toHaveCount(0)
  })
})
