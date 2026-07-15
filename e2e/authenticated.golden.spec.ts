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
    // Other browser projects exercise the same shared fixture concurrently.
    // Retry the idempotent "watch=true" intent if a Realtime rerender detaches
    // the first button between inspection and click.
    await expect(async () => {
      const watch = dialog.getByRole('button', { name: /^(Watch|Watching)$/ })
      if ((await watch.getAttribute('aria-pressed')) !== 'true') await watch.click()
      await expect(watch).toHaveAttribute('aria-pressed', 'true', { timeout: 1_000 })
    }).toPass({ timeout: 10_000 })

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

    await page.getByRole('button', { name: `${revisedName} Workspace`, exact: true }).click()
    await page.getByRole('button', { name: 'Delete' }).click()
    await page.getByRole('button', { name: 'Confirm delete' }).click()
    await expect(
      page.getByRole('button', { name: `${revisedName} Workspace`, exact: true }),
    ).toHaveCount(0)
  })

  test('bulk-edits List and Board selections with review, undo, and explicit cleanup', async ({
    page,
  }, testInfo) => {
    await signIn(page)
    const prefix = `Bulk ${testInfo.project.name} ${Date.now()}`
    for (const suffix of ['one', 'two']) {
      const title = `${prefix} ${suffix}`
      await page.getByRole('button', { name: '+ New task' }).click()
      await page.getByLabel('New task title').fill(title)
      await page.getByLabel('New task title').press('Enter')
      await expect(page.getByRole('dialog')).toBeVisible()
      await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click()
      await expect(page.getByRole('dialog')).toBeHidden()
    }

    await page.getByLabel('Search tasks').fill(prefix)
    await page.getByRole('checkbox', { name: 'Select all Backlog tasks' }).check()
    await expect(page.getByText('2 selected')).toBeVisible()
    await page.getByLabel('Bulk action', { exact: true }).selectOption('priority')
    await page.getByLabel('Bulk action value').selectOption('urgent')
    await page.getByRole('button', { name: 'Review' }).click()
    await expect(page.getByText(/2 will change, 0 already match/)).toBeVisible()
    await page.getByRole('button', { name: 'Apply to 2' }).click()
    await expect(page.getByText(/2 changed, 0 unchanged, 0 skipped/)).toBeVisible()
    await expect(page.getByLabel('Priority')).toHaveCount(2)
    for (const priority of await page.getByLabel('Priority').all()) {
      await expect(priority).toHaveValue('urgent')
    }

    await page.getByRole('button', { name: 'Board', exact: true }).click()
    await page.getByRole('checkbox', { name: 'Select all Backlog tasks' }).check()
    await page.getByLabel('Bulk action', { exact: true }).selectOption('tag_add')
    await page.getByLabel('Bulk action value').selectOption('Backend')
    await page.getByRole('button', { name: 'Review' }).click()
    await page.getByRole('button', { name: 'Apply to 2' }).click()
    const board = page.getByRole('main', { name: 'Board view' })
    await expect(board.getByText('Backend')).toHaveCount(2)
    await page.getByRole('button', { name: 'Undo 2 changes' }).click()
    await expect(board.getByText('Backend')).toHaveCount(0)
    await expect(page.locator('[data-sonner-toast]')).toHaveCount(0, { timeout: 10_000 })
    await expectNoAxeViolations(page)

    await page.getByRole('checkbox', { name: 'Select all Backlog tasks' }).check()
    await page.getByLabel('Bulk action', { exact: true }).selectOption('delete')
    await page.getByRole('button', { name: 'Review' }).click()
    await expect(page.getByText(/cannot be restored/i)).toBeVisible()
    await page.getByRole('button', { name: 'Delete 2 permanently' }).click()
    await expect(page.getByRole('button', { name: new RegExp(`Open .*: ${prefix}`) })).toHaveCount(
      0,
    )
  })

  test('captures and uses a project template, then schedules an isolated recurring task', async ({
    page,
  }, testInfo) => {
    await signIn(page)
    const engine = testInfo.project.name
    const suffix = `${engine}-${Date.now()}`
    const templateName = `Template ${suffix}`
    const projectName = `Generated ${suffix}`
    const projectKey = `${engine.slice(0, 3)}${Date.now().toString().slice(-7)}`.toUpperCase()

    await page.getByRole('button', { name: 'Settings', exact: true }).click()
    const templates = page.getByRole('region', { name: 'Project templates' })
    // Parallel browser projects create and archive generated projects in the same
    // workspace. Pin the capture source to the stable fixture instead of relying
    // on the alphabetically first project, which can change during this test.
    await templates.getByLabel('Source project').selectOption({ label: 'P1G — Release validation' })
    await templates.getByLabel('Template name').fill(templateName)
    await templates.getByLabel('Description (optional)').fill(`Validated in ${engine}`)
    await templates.getByRole('button', { name: 'Save project as template' }).click()

    const template = templates.getByRole('listitem').filter({ hasText: templateName })
    await expect(template).toBeVisible()
    await template.getByRole('button', { name: 'Use template' }).click()
    await template.getByLabel('New project name').fill(projectName)
    await template.getByLabel('New project key').fill(projectKey)
    await template.getByRole('button', { name: 'Create' }).click()
    await expect(page.getByText(/Project created with \d+ tasks/)).toBeVisible()

    const projects = page.getByRole('region', { name: 'Projects' })
    const generatedProject = projects.getByRole('listitem').filter({ hasText: projectName })
    await expect(generatedProject).toBeVisible()
    await generatedProject.getByRole('button', { name: 'Archive' }).click()
    await generatedProject.getByRole('button', { name: 'Confirm archive' }).click()
    await expect(generatedProject).toHaveCount(0)

    await template.getByRole('button', { name: 'Delete' }).click()
    await template.getByRole('button', { name: 'Delete template' }).click()
    await expect(template).toHaveCount(0)

    await page.getByRole('button', { name: 'List', exact: true }).click()
    const taskTitle = `Recurring ${suffix}`
    await page.getByRole('button', { name: '+ New task' }).click()
    await page.getByLabel('New task title').fill(taskTitle)
    await page.getByLabel('New task title').press('Enter')
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await dialog.getByLabel('Recurrence interval').fill('2')
    await dialog.getByLabel('Recurrence frequency').selectOption('weekly')
    await dialog.getByLabel('Timezone').fill('Asia/Bangkok')
    await dialog.getByLabel('Next occurrence date').fill('2099-01-01')
    await dialog.getByLabel('Local time').fill('09:30')
    await dialog.getByRole('button', { name: 'Make recurring' }).click()
    await expect(dialog.getByRole('button', { name: 'Update recurrence' })).toBeVisible()
    await expect(page.locator('[data-sonner-toast]')).toHaveCount(0, { timeout: 10_000 })
    await expectNoAxeViolations(page)

    await dialog.getByRole('button', { name: 'Stop recurrence' }).click()
    await expect(dialog.getByRole('button', { name: 'Make recurring' })).toBeVisible()
    await dialog.getByRole('button', { name: 'Delete task' }).click()
    await dialog.getByRole('button', { name: 'Delete', exact: true }).click()
    await expect(dialog).toBeHidden()
  })

  test('tracks milestones and warns about blocked schedules without moving dates', async ({
    page,
  }, testInfo) => {
    await signIn(page)
    const suffix = `${testInfo.project.name}-${Date.now()}`
    const prefix = `Dependency ${suffix}`
    const predecessorTitle = `${prefix} foundation`
    const successorTitle = `${prefix} application`
    const milestoneTitle = `Milestone ${suffix}`
    let dialog = page.getByRole('dialog')
    const ensureTaskOpen = async (ref: string, title: string) => {
      if (await dialog.isVisible().catch(() => false)) return
      await page.getByRole('button', { name: `Open ${ref}: ${title}` }).click()
      await expect(dialog).toBeVisible()
    }
    const fillTaskDate = async (
      ref: string,
      title: string,
      label: 'Start date' | 'Due date',
      value: string,
    ) => {
      await ensureTaskOpen(ref, title)
      const saved = page.waitForResponse(
        (response) =>
          response.request().method() === 'PATCH' && response.url().includes('/rest/v1/tasks?'),
      )
      await page.getByRole('dialog').getByLabel(label).fill(value)
      await saved
    }

    await page.getByRole('button', { name: '+ New task' }).click()
    await page.getByLabel('New task title').fill(predecessorTitle)
    await page.getByLabel('New task title').press('Enter')
    const predecessorRef = (await dialog.locator('.opm-task-ref').first().textContent())!
    await fillTaskDate(predecessorRef, predecessorTitle, 'Start date', '2026-08-01')
    await fillTaskDate(predecessorRef, predecessorTitle, 'Due date', '2026-08-05')
    if (await dialog.isVisible()) await dialog.press('Escape')
    await expect(dialog).toBeHidden()

    await page.getByRole('button', { name: '+ New task' }).click()
    await page.getByLabel('New task title').fill(successorTitle)
    await page.getByLabel('New task title').press('Enter')
    dialog = page.getByRole('dialog')
    const successorRef = (await dialog.locator('.opm-task-ref').first().textContent())!
    await fillTaskDate(successorRef, successorTitle, 'Start date', '2026-08-04')
    await fillTaskDate(successorRef, successorTitle, 'Due date', '2026-08-10')
    await ensureTaskOpen(successorRef, successorTitle)
    await dialog.getByLabel('Find blocker').fill(predecessorTitle)
    const blockerOption = dialog
      .getByLabel('Add blocker')
      .locator('option')
      .filter({ hasText: predecessorTitle })
    await dialog
      .getByLabel('Add blocker')
      .selectOption((await blockerOption.getAttribute('value'))!)
    await dialog.getByRole('button', { name: 'Add', exact: true }).click()
    await expect(dialog.getByText(/Schedule warning: .* starts before .* finishes/)).toBeVisible()
    await expect(dialog.getByText(/Dates are never moved automatically/)).toBeVisible()
    await expect(dialog.getByLabel('Start date')).toHaveValue('2026-08-04')
    await dialog.press('Escape')
    await expect(dialog).toBeHidden()

    await page.getByLabel('Search tasks').fill(successorTitle)
    await expect(
      page.getByTestId('view-region').getByLabel('Blocked by 1 unfinished task'),
    ).toBeVisible()
    await page.getByRole('button', { name: 'Board', exact: true }).click()
    await expect(
      page.getByTestId('view-region').getByLabel('Blocked by 1 unfinished task'),
    ).toBeVisible()
    await page.getByRole('button', { name: 'Clear filters' }).click()

    await page.getByRole('button', { name: 'Settings', exact: true }).click()
    const milestones = page.getByRole('region', { name: 'Project milestones' })
    await milestones.getByLabel('Milestone').fill(milestoneTitle)
    await milestones.getByLabel('Project').selectOption({ label: 'P1G — Release validation' })
    await milestones.getByLabel('Target date').fill('2026-08-15')
    await milestones.getByRole('button', { name: 'Add milestone' }).click()
    await expect(milestones.getByText(milestoneTitle)).toBeVisible()

    await page.getByRole('button', { name: 'Gantt', exact: true }).click()
    await expect(page.getByRole('img', { name: new RegExp(milestoneTitle) })).toBeVisible()
    await expect(page.getByTestId('gantt-dependencies')).toBeVisible()
    await page.getByRole('button', { name: 'Timeline', exact: true }).click()
    await expect(page.getByText(milestoneTitle)).toBeVisible()
    await expectNoAxeViolations(page)

    await page.getByRole('button', { name: 'Settings', exact: true }).click()
    const milestone = milestones.getByRole('listitem').filter({ hasText: milestoneTitle })
    await milestone.getByRole('button', { name: 'Delete' }).click()
    await milestone.getByRole('button', { name: 'Delete milestone' }).click()
    await expect(milestone).toHaveCount(0)

    await page.getByRole('button', { name: 'List', exact: true }).click()
    await page.getByLabel('Search tasks').fill(prefix)
    for (const title of [successorTitle, predecessorTitle]) {
      await page.getByRole('button', { name: new RegExp(`Open .*: ${title}`) }).click()
      dialog = page.getByRole('dialog')
      await dialog.getByRole('button', { name: 'Delete task' }).click()
      await dialog.getByRole('button', { name: 'Delete', exact: true }).click()
      await expect(dialog).toBeHidden()
    }
  })
})
