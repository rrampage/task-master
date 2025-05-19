let tasks = JSON.parse(localStorage.getItem("tasks")) || [
  {
    title: "Sample Task 1",
    description: "Do something important.",
    tags: ["work"],
    status: "pending",
    dueDate: "2025-05-20",
  },
  {
    title: "Sample Task 2",
    description: "In progress work.",
    tags: ["project"],
    status: "in-progress",
    dueDate: "2025-05-21",
  },
  {
    title: "Sample Task 3",
    description: "This is done.",
    tags: ["done"],
    status: "completed",
    dueDate: "2025-05-18",
  },
]

let tagFilter = []
let currentView = localStorage.getItem('taskView') || 'kanban'

function getDueColor(dueDate) {
  if (!dueDate) return '#ffe6e6'
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const due = new Date(dueDate)
  const xdays = 10
  due.setHours(0, 0, 0, 0)
  const days = Math.floor((due - today) / (1000 * 60 * 60 * 24))

  if (days < 0) return '#ff0000'
  if (days === 0) return '#ff1a1a'
  if (days <= xdays) {
    const r = 255
    const g = 26 + Math.round(178*days / xdays)
    const b = 26 + Math.round(178*days / xdays)
    return `rgb(${r},${g},${b})`
  }
  return '#ffe6e6'
}


function toggleForm() {
  const form = document.getElementById("task-form")
  form.style.display =
    form.style.display === "none" || !form.style.display
      ? "block"
      : "none"
}

function saveTasks() {
  localStorage.setItem("tasks", JSON.stringify(tasks))
  renderTasks()
  renderCalendar()
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
      (a.dueDate || "").localeCompare(b.dueDate || ""),
    )

    filtered.forEach((task, index) => {
      const div = document.createElement("div")
      div.className = "task" + " " + (task.status)
      if (task.status !== 'completed') {
        div.style.backgroundColor =  getDueColor(task.dueDate)
      }
      div.draggable = true
      div.ondragstart = (e) => {
        e.dataTransfer.setData("text/plain", tasks.indexOf(task))
        div.classList.add("dragging")
      }
      div.ondragend = () => {
        div.classList.remove("dragging")
      }
      div.innerHTML = `
      <strong>${task.title}</strong><br />
      <small>Tags: ${task.tags.map((tag) => `<span class="tag" onclick="filterByTag('${tag}')">${tag}</span>`).join(", ")}</small><br />
      <small><span class="date-display">${task.dueDate || "None"}</span><span class="calendar-icon" onclick="editDueDate(this, ${tasks.indexOf(task)})">📅</span></small><br />
      <button class="emoji-button" onclick="editTask(${tasks.indexOf(task)})" title="Edit Task">🖊️</button>
      <button class="emoji-button" onclick="deleteTask(${tasks.indexOf(task)})" title="Delete Task">🗑️</button>
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
  const calendar = document.getElementById('calendar-view')
  calendar.style.display = currentView === 'calendar' ? 'block' : 'none'
  const now = new Date()
  const weekAhead = new Date()
  weekAhead.setDate(now.getDate() + 7)
  const calendarDiv = document.getElementById('calendar-tasks')
  calendarDiv.innerHTML = ''

  const grouped = {}
  tasks.filter(task => ['pending', 'in-progress'].includes(task.status) && task.dueDate).forEach(task => {
    const due = new Date(task.dueDate)
    if (due >= now && due <= weekAhead) {
      const key = task.dueDate
      if (!grouped[key]) grouped[key] = []
      grouped[key].push(task)
    }
  })

  Object.keys(grouped).sort().forEach(date => {
    const dayDiv = document.createElement('div')
    dayDiv.className = 'calendar-day'
    dayDiv.innerHTML = `<h4>${date}</h4>`
    grouped[date].forEach(task => {
      const taskDiv = document.createElement('div')
      taskDiv.className = 'calendar-task'
      taskDiv.style.backgroundColor = getDueColor(task.dueDate)
      taskDiv.innerHTML = `<strong>${task.title}</strong> (${task.status})`
      dayDiv.appendChild(taskDiv)
    })
    calendarDiv.appendChild(dayDiv)
  })
}

function toggleView() {
  currentView = currentView === 'kanban' ? 'calendar' : 'kanban'
  localStorage.setItem('taskView', currentView)
  renderTasks()
  renderCalendar()
}

function filterByTag(tag) {
  if (!tagFilter.includes(tag)) {
    tagFilter.push(tag)
    renderTasks()
    renderCalendar()
  }
}

function removeTagFilter(tag) {
  tagFilter = tagFilter.filter((t) => t !== tag)
  renderTasks()
  renderCalendar()
}

function clearTagFilter() {
  tagFilter = []
  renderTasks()
  renderCalendar()
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
  document.getElementById("task-form").style.display = "block"
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
    document.getElementById("task-form").style.display = "none"
    document.getElementById("task-id").value = ""
    saveTasks()
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

renderTasks()
renderCalendar()