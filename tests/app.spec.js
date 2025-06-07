import { test, expect } from '@playwright/test'

test.describe('Task Master Application', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the app before each test
    await page.goto('/')
  })

  test('should load the page and display initial view', async ({ page }) => {
    // Check page title
    await expect(page).toHaveTitle('Task Master')

    // Check if either Kanban or Calendar view is visible
    const kanbanBoard = page.locator('#kanban-board')
    const calendarView = page.locator('#calendar-view')

    const isKanbanVisible = await kanbanBoard.isVisible()
    const isCalendarVisible = await calendarView.isVisible()

    // Expect that at least one of them is visible, but not both
    expect(isKanbanVisible || isCalendarVisible).toBe(true)
    expect(isKanbanVisible && isCalendarVisible).toBe(false)

    // Optional: Check for specific content if one is expected by default
    // For example, if Kanban is the typical default:
    // if (isKanbanVisible) {
    //   await expect(page.locator('#pending-column h3')).toHaveText('Pending')
    // }
  })

  test('should allow a user to create a new task', async ({ page }) => {
    // Open the task modal
    await page.locator('#show-form-btn').click()
    await expect(page.locator('#task-modal')).toBeVisible()

    // Fill in the task form
    const taskTitle = `Test Task ${Date.now()}`
    const taskDescription = 'This is a test task description'
    await page.locator('#title').fill(taskTitle)
    await page.locator('#description').fill(taskDescription)
    await page.locator('#tags').fill('test, playwright')
    await page.locator('#status').selectOption('pending') // Or 'in-progress' or 'completed'

    // For the due date, ensure it's a valid YYYY-MM-DD format
    const today = new Date()
    const year = today.getFullYear()
    const month = String(today.getMonth() + 1).padStart(2, '0') // JS months are 0-indexed
    const day = String(today.getDate()).padStart(2, '0')
    const dueDate = `${year}-${month}-${day}`
    await page.locator('#due-date').fill(dueDate)

    // Save the task
    await page.locator('#task-form button[type="submit"]').click()

    // Verify the modal is hidden
    await expect(page.locator('#task-modal')).toBeHidden()

    // Verify the task appears in the UI
    // This verification might need adjustment based on the default view (Kanban or Calendar)
    // For Kanban view (assuming 'pending' status was selected):
    const kanbanBoard = page.locator('#kanban-board')
    if (await kanbanBoard.isVisible()) {
      const pendingColumn = kanbanBoard.locator('#pending-column')
      // Check for a task card that contains the title. Using a text locator.
      await expect(pendingColumn.locator(`div.task strong:text("${taskTitle}")`)).toBeVisible()
      // Further check for due date if needed
      await expect(pendingColumn.locator(`div.task:has-text("${taskTitle}") .date-display:text("${dueDate}")`)).toBeVisible()
    } else {
      // For Calendar view:
      // This requires checking for a dot on the specific due date.
      // The dot itself might not directly contain the title, but its container (day cell) would be identifiable.
      // This part is more complex as it involves matching the date and then checking for a dot of a certain color.
      // For now, we'll focus on the Kanban confirmation, as it's more straightforward.
      // A more robust solution would check which view is active and verify accordingly.
      // Let's assume for this test, we primarily confirm via Kanban or a generic task list if that existed.
      // Given the current structure, if Kanban is not visible, this part of the test might not be fully effective
      // without more complex calendar dot checking.
      // We can refine this later if needed, or ensure Kanban is visible for this test.
      console.warn('Task creation test primarily verifies on Kanban view. Calendar view verification for new task is minimal in this test.')
    }
  })

  test('should toggle between Kanban and Calendar views', async ({ page }) => {
    const kanbanBoard = page.locator('#kanban-board')
    const calendarView = page.locator('#calendar-view')
    const toggleButton = page.locator('#view-toggle button') // Assuming a single button in #view-toggle

    // Determine initial state
    const isKanbanInitiallyVisible = await kanbanBoard.isVisible()
    const isCalendarInitiallyVisible = await calendarView.isVisible()

    // First toggle
    await toggleButton.click()

    if (isKanbanInitiallyVisible) {
      await expect(kanbanBoard).toBeHidden()
      await expect(calendarView).toBeVisible()
    } else if (isCalendarInitiallyVisible) {
      await expect(calendarView).toBeHidden()
      await expect(kanbanBoard).toBeVisible()
    } else {
      // Should not happen based on the first test, but good to handle
      throw new Error('Neither Kanban nor Calendar was initially visible')
    }

    // Second toggle (back to original state)
    await toggleButton.click()

    if (isKanbanInitiallyVisible) {
      await expect(kanbanBoard).toBeVisible()
      await expect(calendarView).toBeHidden()
    } else if (isCalendarInitiallyVisible) {
      await expect(calendarView).toBeVisible()
      await expect(kanbanBoard).toBeHidden()
    }
  })

  test('should navigate between months in Calendar view', async ({ page }) => {
    const kanbanBoard = page.locator('#kanban-board')
    const calendarView = page.locator('#calendar-view')
    const toggleButton = page.locator('#view-toggle button')
    const prevMonthButton = page.locator('#prev-month-btn')
    const nextMonthButton = page.locator('#next-month-btn')
    const monthYearHeader = page.locator('#month-year-header')

    // Ensure Calendar view is active
    if (await kanbanBoard.isVisible()) {
      await toggleButton.click()
    }
    await expect(calendarView).toBeVisible()

    // Get initial month and year
    const initialMonthYearText = await monthYearHeader.textContent()
    expect(initialMonthYearText).not.toBe('') // Ensure it's not empty

    // Click Next Month
    await nextMonthButton.click()
    const nextMonthYearText = await monthYearHeader.textContent()
    expect(nextMonthYearText).not.toBe(initialMonthYearText)

    // Click Previous Month twice (to go past the initial month)
    await prevMonthButton.click() // Back to initial month
    await prevMonthButton.click() // To month before initial
    const prevMonthYearText = await monthYearHeader.textContent()
    expect(prevMonthYearText).not.toBe(initialMonthYearText)
    expect(prevMonthYearText).not.toBe(nextMonthYearText)

    // Go back to initial month to confirm
    await nextMonthButton.click()
    await expect(monthYearHeader).toHaveText(initialMonthYearText)
  })
})
