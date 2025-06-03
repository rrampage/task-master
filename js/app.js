let tasks = []
let tagFilter = []
let currentView = localStorage.getItem('taskView') || 'kanban'

function initializeTasks() {
  const localTasks = localStorage.getItem("tasks")
  if (localTasks) {
    tasks = JSON.parse(localTasks)
  } else {
    fetch("js/sample-tasks.json") // Path relative to index.html
      .then(response => {
        if (!response.ok) {
          throw new Error('Network response was not ok ' + response.statusText)
        }
        return response.json()
      })
      .then(sampleTasks => {
        tasks = sampleTasks
        saveTasks() // Save the fetched sample tasks to localStorage for next time
        // render() is called inside saveTasks(), so no need to call it again here explicitly
      })
      .catch(error => {
        console.error('Failed to load sample tasks:', error)
      })
  }
}


// Call initializeTasks when the script loads
initializeTasks()
render()


function getDueColor(dueDate) {
  if (!dueDate) return '#ffddcc'
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const due = new Date(dueDate)
  const xdays = 10
  due.setHours(0, 0, 0, 0)
  const days = Math.floor((due - today) / (1000 * 60 * 60 * 24))

  if (days < 0) return '#ff4d4d'
  if (days === 0) return '#ff1a1a'
  if (days <= xdays) {
    const r = 255
    const g = 119 + Math.round(119 * days / xdays)
    const b = 51 + Math.round(187 * days / xdays)
    return `rgb(${r},${g},${b})`
  }
  return '#ffe6e6'
}

function toggleHelpModal() {
  const modal = document.getElementById('help-modal')
  if (modal) {
    modal.style.display = modal.style.display === 'none' || modal.style.display === '' ? 'block' : 'none'
  }
}

function toggleTaskModal(isEdit = false) {
  const modal = document.getElementById("task-modal")
  const form = document.getElementById("task-form")
  const taskIdField = document.getElementById("task-id")
  const titleInput = document.getElementById("title")

  if (modal.style.display === "block" || modal.style.display === "") {
    modal.style.display = "none"
  } else {
    if (!isEdit) { // If not an edit operation, it's a new task
      form.reset()
      taskIdField.value = ""
    }
    modal.style.display = "block"
    // Focus the title field when opening, prioritize if it's a new task or if editTask specifically requests it later
    if (titleInput) {
      titleInput.focus()
    }
  }
}

function saveTasks() {
  localStorage.setItem("tasks", JSON.stringify(tasks))
  render()
}

function renderTasks() {
  const kanban = document.getElementById('kanban-board')
  if (kanban) { kanban.style.display = currentView === 'kanban' ? 'flex' : 'none' }
  const statuses = ['pending', 'in-progress', 'completed']
  statuses.forEach(id => {
    const col = document.getElementById(`${id}-column`)
    if (col) col.innerHTML = `<h3>${id.replace('-', ' ').replace(/\b\w/g, c => c.toUpperCase())}</h3>`
  })

  statuses.forEach((status) => {
    let filtered = tasks.filter((task) => task.status === status)
    if (tagFilter.length) {
      filtered = filtered.filter((task) =>
        tagFilter.every((tag) => task.tags.includes(tag)),
      )
    }
    filtered.sort((a, b) =>
      (a.dueDate || "2099-12-31").localeCompare(b.dueDate || "2099-12-31"),
    )

    filtered.forEach((task, index) => {
      const globalIndex = tasks.indexOf(task) // Get the actual index in the global tasks array
      const div = document.createElement("div")
      div.className = "task" + " " + (task.status)
      if (task.status !== 'completed') {
        div.style.backgroundColor = getDueColor(task.dueDate)
      }
      div.draggable = true
      div.tabIndex = 0 // Make task focusable
      div.dataset.taskIndex = globalIndex // Store global task index

      div.ondragstart = (e) => {
        e.dataTransfer.setData("text/plain", globalIndex)
        div.classList.add("dragging")
      }
      div.ondragend = () => {
        div.classList.remove("dragging")
      }
      div.innerHTML = `
      <strong>${task.title}</strong><br />
      <small>Tags: ${task.tags.map((tag) => `<span class="tag" onclick="filterByTag('${tag}')">${tag}</span>`).join(", ")}</small><br />
      <small><span class="date-display">${task.dueDate || "None"}</span><span class="calendar-icon" onclick="editDueDate(this, ${globalIndex})">📅</span></small><br />
      <button class="emoji-button" onclick="editTask(${globalIndex})" title="Edit Task">🖊️</button>
      <button class="emoji-button" onclick="deleteTask(${globalIndex})" title="Delete Task">🗑️</button>
    `
      document.getElementById(`${status}-column`).appendChild(div)
    })
  })

  document.querySelectorAll('.calendar-icon').forEach(icon => {
    icon.addEventListener('click', function () {
      const taskIndex = this.dataset.taskIndex // Assuming you add a data-task-index attribute
      const task = tasks[taskIndex]
      const dateDisplay = this.previousElementSibling
      const dateInput = document.createElement('input')
      dateInput.type = 'date'
      dateInput.value = task.dueDate || ''
      dateInput.addEventListener('blur', function () {
        task.dueDate = this.value
        saveTasks()
      })
      dateDisplay.replaceWith(dateInput)
    })
  })

  document.getElementById("filter-indicator").innerHTML = tagFilter.length
    ? `Filtering by tags: ${tagFilter.map((tag) => `<a href="#" class="tag" onclick="removeTagFilter('${tag}')">${tag} <span class='clear-filter'>&times;</span></a>`).join(", ")}`
    : ""
}


function renderCalendar() {
  const columns = {
    'pending': document.getElementById('calendar-pending'),
    'in-progress': document.getElementById('calendar-in-progress'),
    'completed': document.getElementById('calendar-completed')
  }

  for (const col of Object.values(columns)) {
    col.innerHTML = '<h3>' + col.querySelector('h3').innerText + '</h3>'
  }

  const today = new Date()
  const nextWeek = new Date()
  nextWeek.setDate(today.getDate() + 7)

  tasks
    .filter(task => task.status && task.dueDate)
    .map(task => ({ ...task, due: new Date(task.dueDate) }))
    .filter(task => task.due >= today && task.due <= nextWeek)
    .sort((a, b) => a.due - b.due)
    .forEach(task => {
      const col = columns[task.status]
      if (!col) return

      const dateStr = task.due.toDateString()
      let dayContainer = col.querySelector(`[data-date="${dateStr}"]`)

      if (!dayContainer) {
        dayContainer = document.createElement('div')
        dayContainer.className = 'calendar-day'
        dayContainer.setAttribute('data-date', dateStr)
        dayContainer.innerHTML = `<h4>${dateStr}</h4>`
        col.appendChild(dayContainer)
      }

      const card = document.createElement('div')
      card.className = 'calendar-task' // Keep this class for styling
      card.classList.add('task') // Add generic 'task' class for shared focus/event logic if any
      card.style.backgroundColor = getDueColor(task.dueDate)
      card.textContent = task.title
      card.tabIndex = 0 // Make it focusable
      card.dataset.taskTitle = task.title
      card.dataset.taskDueDate = task.dueDate
      card.dataset.taskStatus = task.status
      card.dataset.taskDateStr = dateStr // Store the date string for navigation

      // Store the original task index for easier editing
      const originalTaskIndex = tasks.findIndex(t => t.title === task.title && t.dueDate === task.dueDate && t.status === task.status)
      if (originalTaskIndex !== -1) {
        card.dataset.originalTaskIndex = originalTaskIndex
      }

      dayContainer.appendChild(card)
    })
}

function render() {
  if (currentView === 'kanban') {
    document.getElementById('kanban-board').style.display = 'flex'
    document.getElementById('calendar-view').style.display = 'none'
    renderTasks()
  } else {
    document.getElementById('kanban-board').style.display = 'none'
    document.getElementById('calendar-view').style.display = 'block'
    renderCalendar()
  }
}

function toggleView() {
  currentView = currentView === 'kanban' ? 'calendar' : 'kanban'
  localStorage.setItem('taskView', currentView)
  render()
}

function filterByTag(tag) {
  if (!tagFilter.includes(tag)) {
    tagFilter.push(tag)
    render()
  }
}

function removeTagFilter(tag) {
  tagFilter = tagFilter.filter((t) => t !== tag)
  render()
}

function clearTagFilter() {
  tagFilter = []
  render()
}

function allowDrop(e) {
  e.preventDefault()
  e.currentTarget.classList.add("drag-over")
}

function drop(e, newStatus) {
  e.preventDefault()
  e.currentTarget.classList.remove("drag-over")
  const index = e.dataTransfer.getData("text/plain")
  tasks[index].status = newStatus
  saveTasks()
}

function editTask(index) {
  const task = tasks[index]
  document.getElementById("title").value = task.title
  document.getElementById("description").value = task.description
  document.getElementById("tags").value = task.tags.join(", ")
  document.getElementById("status").value = task.status
  document.getElementById("due-date").value = task.dueDate
  document.getElementById("task-id").value = index
  toggleTaskModal(true) // true indicates it's an edit operation
}

function deleteTask(index) {
  if (confirm("Are you sure you want to delete this task?")) {
    tasks.splice(index, 1)
    saveTasks()
  }
}

document
  .getElementById("task-form")
  .addEventListener("submit", function (e) {
    e.preventDefault()
    const id = document.getElementById("task-id").value
    const task = {
      title: document.getElementById("title").value,
      description: document.getElementById("description").value,
      tags: document
        .getElementById("tags")
        .value.split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      status: document.getElementById("status").value,
      dueDate: document.getElementById("due-date").value,
    }
    if (id === "") {
      tasks.push(task)
    } else {
      tasks[parseInt(id)] = task
    }
    document.getElementById("task-form").reset()
    document.getElementById("task-id").value = ""
    saveTasks()
    toggleTaskModal() // Close modal after saving
  })

function exportTasks() {
  const blob = new Blob([JSON.stringify(tasks, null, 2)], {
    type: "application/json",
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = "tasks.json"
  a.click()
  URL.revokeObjectURL(url)
}

function importTasks() {
  const fileInput = document.getElementById("import-file")
  const file = fileInput.files[0]
  if (!file) return

  const reader = new FileReader()
  reader.onload = function (e) {
    try {
      const imported = JSON.parse(e.target.result)
      if (Array.isArray(imported)) {
        const existingSet = new Set(
          tasks.map((task) => task.title + "|" + task.dueDate),
        )
        const newTasks = imported.filter(
          (task) => !existingSet.has(task.title + "|" + task.dueDate),
        )
        tasks = tasks.concat(newTasks)
        saveTasks()
      } else {
        alert("Invalid file format")
      }
    } catch (err) {
      alert("Error reading file")
    }
  }
  reader.readAsText(file)
}

function editDueDate(element, index) {
  const task = tasks[index]
  const dateDisplay = element.previousElementSibling
  const dateInput = document.createElement('input')
  dateInput.type = 'date'
  dateInput.value = task.dueDate || ''
  dateInput.addEventListener('blur', function () {
    task.dueDate = this.value
    saveTasks()
  })
  dateDisplay.replaceWith(dateInput)
}

document.addEventListener('keydown', function(event) {
  // Check for '?' key press for help modal
  if (event.key === '?') {
    const activeElement = document.activeElement
    if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA' || activeElement.tagName === 'SELECT')) {
      // Do nothing if focused on an input, textarea, or select
    } else {
      toggleHelpModal()
      event.preventDefault() // Prevent '?' from appearing in search bars if any, or other default browser actions
    }
  }

  if (event.key === 'Escape') {
    const helpModal = document.getElementById('help-modal')
    if (helpModal && helpModal.style.display === 'block') {
      toggleHelpModal()
    }
    const taskModal = document.getElementById('task-modal')
    if (taskModal && taskModal.style.display === 'block') {
      toggleTaskModal()
    }
  }

  // Check for 't' key press for toggling form, ensuring not in an input field
  if (event.key === 't' || event.key === 'T') { // Check for both 't' and 'T'
    const activeElement = document.activeElement
    if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA' || activeElement.tagName === 'SELECT')) {
      // Do nothing if focused on an input, textarea, or select
    } else {
      toggleTaskModal() // Opens modal for new task, will reset form and focus title
      event.preventDefault()
    }
  }

  // Check for 'Delete' or 'Backspace' key press for deleting tasks
  if (event.key === 'Delete' || event.key === 'Backspace') {
    const activeElement = document.activeElement
    // Ensure not typing in an input, textarea, or select AND a task is focused
    if (activeElement && !(activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA' || activeElement.tagName === 'SELECT')) {
      if (activeElement.classList.contains('task')) { // This covers both Kanban .task and Calendar .calendar-task (which also has .task)
        event.preventDefault() // Prevent default browser behavior (e.g., back navigation or deleting text in an input field if somehow missed by above check)
        let taskIndex = -1
        if (currentView === 'kanban' && activeElement.dataset.taskIndex) {
          taskIndex = parseInt(activeElement.dataset.taskIndex)
        } else if (currentView === 'calendar' && activeElement.dataset.originalTaskIndex) {
          taskIndex = parseInt(activeElement.dataset.originalTaskIndex)
        }
        
        if (taskIndex !== -1) {
          deleteTask(taskIndex)
          // Note: Focus will be lost after deletion. Future enhancement could be to focus next/prev task.
        }
      }
    }
  }

  // Check for 'e' or 'E' key press for editing tasks
  if (event.key === 'e' || event.key === 'E') {
    const activeElement = document.activeElement
    // Ensure not typing in an input, textarea, or select AND a task is focused
    if (activeElement && !(activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA' || activeElement.tagName === 'SELECT')) {
      if (activeElement.classList.contains('task')) { // This covers both Kanban .task and Calendar .calendar-task (which also has .task)
        if (currentView === 'kanban' && activeElement.dataset.taskIndex) {
          const taskIndex = parseInt(activeElement.dataset.taskIndex)
          editTask(taskIndex) // This will call toggleTaskModal(true) and focus title
          event.preventDefault() // Prevent 'e' from being typed into any inputs if form opens quickly
        } else if (currentView === 'calendar' && activeElement.dataset.originalTaskIndex) {
          const taskIndex = parseInt(activeElement.dataset.originalTaskIndex)
          editTask(taskIndex) // This will call toggleTaskModal(true) and focus title
          event.preventDefault()// Prevent 'e' from being typed into any inputs if form opens quickly
        }
      }
    }
  }

  // Arrow key navigation
  if (currentView === 'kanban' && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
    event.preventDefault() // Prevent default scrolling behavior
    const focusedElement = document.activeElement

    if (!focusedElement || !focusedElement.classList.contains('task')) {
      // If no task is focused, or focused element is not a task, focus the first task in the first column (Kanban)
      const firstColumn = document.getElementById('pending-column')
      if (firstColumn) {
        const firstTask = firstColumn.querySelector('.task')
        if (firstTask) {
          firstTask.focus()
        }
      }
      return
    }

    const currentKanbanColumnEl = focusedElement.closest('.column')
    if (!currentKanbanColumnEl) return

    const currentKanbanColumnTasks = Array.from(currentKanbanColumnEl.querySelectorAll('.task'))
    const currentTaskKanbanColumnIndex = currentKanbanColumnTasks.indexOf(focusedElement)

    const kanbanColumnElements = Array.from(document.querySelectorAll('#kanban-board .column'))
    const currentKanbanColumnBoardIndex = kanbanColumnElements.indexOf(currentKanbanColumnEl)

    if (event.key === 'ArrowUp') {
      if (currentTaskKanbanColumnIndex > 0) {
        currentKanbanColumnTasks[currentTaskKanbanColumnIndex - 1].focus()
      } else {
        currentKanbanColumnTasks[currentKanbanColumnTasks.length - 1].focus()
      }
    } else if (event.key === 'ArrowDown') {
      if (currentTaskKanbanColumnIndex < currentKanbanColumnTasks.length - 1) {
        currentKanbanColumnTasks[currentTaskKanbanColumnIndex + 1].focus()
      } else {
        currentKanbanColumnTasks[0].focus()
      }
    } else if (event.key === 'ArrowLeft') {
      let prevKanbanColumnIndex = currentKanbanColumnBoardIndex - 1
      if (prevKanbanColumnIndex < 0) {
        prevKanbanColumnIndex = kanbanColumnElements.length - 1
      }
      const prevKanbanColumnTasks = Array.from(kanbanColumnElements[prevKanbanColumnIndex].querySelectorAll('.task'))
      if (prevKanbanColumnTasks.length > 0) {
        prevKanbanColumnTasks[0].focus()
      } else {
        for (let i = 1; i < kanbanColumnElements.length; i++) {
          let tryIndex = (prevKanbanColumnIndex - i + kanbanColumnElements.length) % kanbanColumnElements.length
          let targetTasks = Array.from(kanbanColumnElements[tryIndex].querySelectorAll('.task'))
          if (targetTasks.length > 0) {
            targetTasks[0].focus()
            break
          }
        }
      }
    } else if (event.key === 'ArrowRight') {
      let nextKanbanColumnIndex = currentKanbanColumnBoardIndex + 1
      if (nextKanbanColumnIndex >= kanbanColumnElements.length) {
        nextKanbanColumnIndex = 0
      }
      const nextKanbanColumnTasks = Array.from(kanbanColumnElements[nextKanbanColumnIndex].querySelectorAll('.task'))
      if (nextKanbanColumnTasks.length > 0) {
        nextKanbanColumnTasks[0].focus()
      } else {
         for (let i = 1; i < kanbanColumnElements.length; i++) {
          let tryIndex = (nextKanbanColumnIndex + i) % kanbanColumnElements.length
          let targetTasks = Array.from(kanbanColumnElements[tryIndex].querySelectorAll('.task'))
          if (targetTasks.length > 0) {
            targetTasks[0].focus()
            break
          }
        }
      }
    }
  } else if (currentView === 'calendar' && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
    event.preventDefault() // Prevent default scrolling behavior
    const focusedElement = document.activeElement

    if (!focusedElement || !focusedElement.classList.contains('calendar-task')) {
      // If no task is focused, or focused element is not a calendar task, focus the first task available
      const firstCalendarTask = document.querySelector('#calendar-view .calendar-task')
      if (firstCalendarTask) {
        firstCalendarTask.focus()
      }
      return
    }

    const currentDayEl = focusedElement.closest('.calendar-day')
    const currentColumnEl = focusedElement.closest('[id^="calendar-"]') // e.g. calendar-pending, calendar-in-progress
    if (!currentDayEl || !currentColumnEl) return

    const tasksInCurrentDayAndColumn = Array.from(currentDayEl.querySelectorAll(`.calendar-task[data-task-status="${focusedElement.dataset.taskStatus}"]`))
    const currentTaskIndexInDayColumn = tasksInCurrentDayAndColumn.indexOf(focusedElement)
    
    const calendarStatusColumns = ['calendar-pending', 'calendar-in-progress', 'calendar-completed']
    const currentStatusIndex = calendarStatusColumns.indexOf(currentColumnEl.id)

    if (event.key === 'ArrowUp') {
      if (currentTaskIndexInDayColumn > 0) {
        tasksInCurrentDayAndColumn[currentTaskIndexInDayColumn - 1].focus()
      } else {
        // Try to move to previous day in the same status column
        let prevDayEl = currentDayEl.previousElementSibling
        while(prevDayEl && !prevDayEl.classList.contains('calendar-day')) { // Skip h4 etc.
            prevDayEl = prevDayEl.previousElementSibling
        }
        if (prevDayEl) {
          const tasksInPrevDay = Array.from(prevDayEl.querySelectorAll(`.calendar-task[data-task-status="${focusedElement.dataset.taskStatus}"]`))
          if (tasksInPrevDay.length > 0) {
            tasksInPrevDay[tasksInPrevDay.length - 1].focus()
          }
        } else {
          // Wrap to the last task of the last day in the current column
          const allDaysInColumn = Array.from(currentColumnEl.querySelectorAll('.calendar-day'))
          if (allDaysInColumn.length > 0) {
            const lastDayEl = allDaysInColumn[allDaysInColumn.length -1]
            const tasksInLastDay = Array.from(lastDayEl.querySelectorAll(`.calendar-task[data-task-status="${focusedElement.dataset.taskStatus}"]`))
            if(tasksInLastDay.length > 0) tasksInLastDay[tasksInLastDay.length -1].focus()
          }
        }
      }
    } else if (event.key === 'ArrowDown') {
      if (currentTaskIndexInDayColumn < tasksInCurrentDayAndColumn.length - 1) {
        tasksInCurrentDayAndColumn[currentTaskIndexInDayColumn + 1].focus()
      } else {
        // Try to move to next day in the same status column
        let nextDayEl = currentDayEl.nextElementSibling
        while(nextDayEl && !nextDayEl.classList.contains('calendar-day')) {
            nextDayEl = nextDayEl.nextElementSibling
        }
        if (nextDayEl) {
          const tasksInNextDay = Array.from(nextDayEl.querySelectorAll(`.calendar-task[data-task-status="${focusedElement.dataset.taskStatus}"]`))
          if (tasksInNextDay.length > 0) {
            tasksInNextDay[0].focus()
          }
        } else {
           // Wrap to the first task of the first day in the current column
           const firstDayEl = currentColumnEl.querySelector('.calendar-day')
           if (firstDayEl) {
             const tasksInFirstDay = Array.from(firstDayEl.querySelectorAll(`.calendar-task[data-task-status="${focusedElement.dataset.taskStatus}"]`))
             if(tasksInFirstDay.length > 0) tasksInFirstDay[0].focus()
           }
        }
      }
    } else if (event.key === 'ArrowLeft') {
      let targetStatusIndex = currentStatusIndex - 1
      if (targetStatusIndex < 0) targetStatusIndex = calendarStatusColumns.length - 1 // wrap

      for(let i=0; i<calendarStatusColumns.length; i++){
        const targetColumnId = calendarStatusColumns[targetStatusIndex]
        const targetColumnEl = document.getElementById(targetColumnId)
        if (targetColumnEl) {
          const targetDayEl = targetColumnEl.querySelector(`[data-date="${focusedElement.dataset.taskDateStr}"]`)
          if (targetDayEl) {
            const tasksInTarget = Array.from(targetDayEl.querySelectorAll('.calendar-task'))
            if (tasksInTarget.length > 0) {
              tasksInTarget[0].focus()
              break
            }
          }
        }
        targetStatusIndex = (targetStatusIndex - 1 + calendarStatusColumns.length) % calendarStatusColumns.length // try next if empty
         if(targetStatusIndex === currentStatusIndex) break // full circle
      }

    } else if (event.key === 'ArrowRight') {
      let targetStatusIndex = currentStatusIndex + 1
      if (targetStatusIndex >= calendarStatusColumns.length) targetStatusIndex = 0 // wrap
      
      for(let i=0; i<calendarStatusColumns.length; i++){
        const targetColumnId = calendarStatusColumns[targetStatusIndex]
        const targetColumnEl = document.getElementById(targetColumnId)
        if (targetColumnEl) {
          const targetDayEl = targetColumnEl.querySelector(`[data-date="${focusedElement.dataset.taskDateStr}"]`)
          if (targetDayEl) {
            const tasksInTarget = Array.from(targetDayEl.querySelectorAll('.calendar-task'))
            if (tasksInTarget.length > 0) {
              tasksInTarget[0].focus()
              break
            }
          }
        }
        targetStatusIndex = (targetStatusIndex + 1) % calendarStatusColumns.length // try next if empty
        if(targetStatusIndex === currentStatusIndex) break // full circle
      }
    }
  }
})

// Ensure a newline character at the end of the file
// The initial render() call at the very end of app.js is removed,
// as initializeTasks() now handles the initial rendering.
