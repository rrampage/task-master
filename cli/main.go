package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/charmbracelet/bubbles/list"
	"github.com/charmbracelet/bubbles/textinput"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
)

var (
	docStyle           = lipgloss.NewStyle().Margin(1, 2)
	titleStyle         = lipgloss.NewStyle().Foreground(lipgloss.Color("205")).Bold(true).MarginBottom(1)
	statusPendingStyle = lipgloss.NewStyle().Foreground(lipgloss.Color("202"))
	statusProgressStyle= lipgloss.NewStyle().Foreground(lipgloss.Color("214"))
	statusCompleteStyle= lipgloss.NewStyle().Foreground(lipgloss.Color("42"))
	errorStyle         = lipgloss.NewStyle().Foreground(lipgloss.Color("9")).Bold(true)
)

type Config struct {
	ServerURL string `json:"server_url"`
	APIKey    string `json:"api_key"`
}

type Task struct {
	ID          string   `json:"id"`
	Title       string   `json:"title"`
	Description string   `json:"description"`
	Tags        []string `json:"tags"`
	Status      string   `json:"status"`
	DueDate     string   `json:"dueDate"`
}

func (t Task) TitleDesc() string { return t.Title }
func (t Task) DescriptionDesc() string {
	statusStr := ""
	switch t.Status {
	case "pending":
		statusStr = statusPendingStyle.Render("Pending")
	case "in-progress":
		statusStr = statusProgressStyle.Render("In Progress")
	case "completed":
		statusStr = statusCompleteStyle.Render("Completed")
	}

	dueDate := ""
	if t.DueDate != "" {
		dueDate = fmt.Sprintf(" | Due: %s", t.DueDate)
	}

	tags := ""
	if len(t.Tags) > 0 {
		tags = fmt.Sprintf(" | Tags: %s", strings.Join(t.Tags, ", "))
	}

	return fmt.Sprintf("[%s] %s%s%s", statusStr, t.Description, dueDate, tags)
}
func (t Task) FilterValue() string { return t.Title }

// We need a wrapper to satisfy list.Item interface
type item struct {
	Task
}

func (i item) Title() string       { return i.Task.TitleDesc() }
func (i item) Description() string { return i.Task.DescriptionDesc() }
func (i item) FilterValue() string { return i.Task.FilterValue() }

type appState int

const (
	stateLogin appState = iota
	stateList
	stateCreate
)

type model struct {
	state       appState
	config      Config
	configPath  string

	// List state
	list        list.Model
	tasks       []Task

	// Create state
	titleInput  textinput.Model
	descInput   textinput.Model
	tagsInput   textinput.Model
	statusInput textinput.Model
	dateInput   textinput.Model
	createStep  int

	// Error state
	errMessage  string
}

func getConfigPath() string {
	home, err := os.UserHomeDir()
	if err != nil {
		return ".taskmaster.json"
	}
	return filepath.Join(home, ".taskmaster.json")
}

func loadConfig() Config {
	path := getConfigPath()
	b, err := os.ReadFile(path)
	if err != nil {
		return Config{ServerURL: "http://localhost:8080"}
	}
	var c Config
	json.Unmarshal(b, &c)
	if c.ServerURL == "" {
		c.ServerURL = "http://localhost:8080"
	}
	return c
}

func saveConfig(c Config) error {
	path := getConfigPath()
	b, _ := json.MarshalIndent(c, "", "  ")
	return os.WriteFile(path, b, 0600)
}

func fetchTasks(c Config) tea.Cmd {
	return func() tea.Msg {
		req, err := http.NewRequest("GET", c.ServerURL+"/api/tasks", nil)
		if err != nil {
			return errMsg{err}
		}
		req.Header.Set("Authorization", "Bearer "+c.APIKey)

		client := &http.Client{Timeout: 10 * time.Second}
		resp, err := client.Do(req)
		if err != nil {
			return errMsg{err}
		}
		defer resp.Body.Close()

		if resp.StatusCode != 200 {
			return errMsg{fmt.Errorf("server returned %d", resp.StatusCode)}
		}

		var tasks []Task
		if err := json.NewDecoder(resp.Body).Decode(&tasks); err != nil {
			return errMsg{err}
		}

		return tasksMsg(tasks)
	}
}

func syncTasks(c Config, tasks []Task) tea.Cmd {
	return func() tea.Msg {
		b, err := json.Marshal(tasks)
		if err != nil {
			return errMsg{err}
		}

		req, err := http.NewRequest("POST", c.ServerURL+"/api/tasks", bytes.NewBuffer(b))
		if err != nil {
			return errMsg{err}
		}
		req.Header.Set("Authorization", "Bearer "+c.APIKey)
		req.Header.Set("Content-Type", "application/json")

		client := &http.Client{Timeout: 10 * time.Second}
		resp, err := client.Do(req)
		if err != nil {
			return errMsg{err}
		}
		defer resp.Body.Close()

		if resp.StatusCode != 200 {
			b, _ := io.ReadAll(resp.Body)
			return errMsg{fmt.Errorf("server returned %d: %s", resp.StatusCode, string(b))}
		}

		return syncSuccessMsg{}
	}
}

type tasksMsg []Task
type syncSuccessMsg struct{}
type errMsg struct{ err error }

func (e errMsg) Error() string { return e.err.Error() }

func initialModel() model {
	c := loadConfig()

	// Setup list
	delegate := list.NewDefaultDelegate()
	l := list.New([]list.Item{}, delegate, 0, 0)
	l.Title = "Task Master CLI"
	l.SetShowStatusBar(true)
	l.SetFilteringEnabled(true)

	// Setup inputs
	ti := textinput.New()
	ti.Placeholder = "Task Title"
	ti.Focus()

	di := textinput.New()
	di.Placeholder = "Description"

	tgi := textinput.New()
	tgi.Placeholder = "Tags (comma-separated)"

	si := textinput.New()
	si.Placeholder = "Status (pending, in-progress, completed)"
	si.SetValue("pending")

	dai := textinput.New()
	dai.Placeholder = "Due Date (YYYY-MM-DD)"

	m := model{
		state:       stateLogin,
		config:      c,
		list:        l,
		titleInput:  ti,
		descInput:   di,
		tagsInput:   tgi,
		statusInput: si,
		dateInput:   dai,
	}

	if c.APIKey != "" {
		m.state = stateList
	}

	return m
}

func (m model) Init() tea.Cmd {
	if m.state == stateList {
		return fetchTasks(m.config)
	}
	return textinput.Blink
}

func (m model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	var cmd tea.Cmd
	var cmds []tea.Cmd

	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		h, v := docStyle.GetFrameSize()
		m.list.SetSize(msg.Width-h, msg.Height-v)
		return m, nil

	case tasksMsg:
		m.tasks = []Task(msg)
		items := make([]list.Item, len(m.tasks))
		for i, t := range m.tasks {
			items[i] = item{t}
		}
		cmd = m.list.SetItems(items)
		cmds = append(cmds, cmd)

	case syncSuccessMsg:
		m.state = stateList
		m.createStep = 0
		cmds = append(cmds, fetchTasks(m.config))

	case errMsg:
		m.errMessage = msg.Error()

	case tea.KeyMsg:
		// Global quit
		if msg.Type == tea.KeyCtrlC {
			return m, tea.Quit
		}

		if m.errMessage != "" {
			if msg.Type == tea.KeyEnter || msg.Type == tea.KeyEsc {
				m.errMessage = ""
			}
			return m, nil
		}

		switch m.state {
		case stateLogin:
			if msg.Type == tea.KeyEnter {
				m.config.APIKey = m.titleInput.Value()
				if m.config.APIKey != "" {
					saveConfig(m.config)
					m.state = stateList
					m.titleInput.SetValue("") // reset for later
					cmds = append(cmds, fetchTasks(m.config))
				}
			} else {
				m.titleInput, cmd = m.titleInput.Update(msg)
				cmds = append(cmds, cmd)
			}

		case stateList:
			if msg.String() == "n" && !m.list.SettingFilter() {
				m.state = stateCreate
				m.createStep = 0
				m.titleInput.Focus()
				m.titleInput.SetValue("")
				m.descInput.SetValue("")
				m.tagsInput.SetValue("")
				m.statusInput.SetValue("pending")
				m.dateInput.SetValue("")
				return m, nil
			}

			if msg.String() == "x" && !m.list.SettingFilter() {
				// Delete selected
				if i, ok := m.list.SelectedItem().(item); ok {
					var newTasks []Task
					for _, t := range m.tasks {
						if t.ID != i.ID {
							newTasks = append(newTasks, t)
						}
					}
					m.tasks = newTasks
					cmds = append(cmds, syncTasks(m.config, m.tasks))
				}
			}

			if msg.String() == "enter" && !m.list.SettingFilter() {
				// Toggle status
				if it, ok := m.list.SelectedItem().(item); ok {
					for i, t := range m.tasks {
						if t.ID == it.ID {
							if m.tasks[i].Status == "pending" {
								m.tasks[i].Status = "in-progress"
							} else if m.tasks[i].Status == "in-progress" {
								m.tasks[i].Status = "completed"
							} else {
								m.tasks[i].Status = "pending"
							}
							cmds = append(cmds, syncTasks(m.config, m.tasks))
							break
						}
					}
				}
			}

			m.list, cmd = m.list.Update(msg)
			cmds = append(cmds, cmd)

		case stateCreate:
			if msg.Type == tea.KeyEsc {
				m.state = stateList
				return m, nil
			}

			if msg.Type == tea.KeyEnter {
				m.createStep++
				switch m.createStep {
				case 1:
					m.titleInput.Blur()
					m.descInput.Focus()
				case 2:
					m.descInput.Blur()
					m.tagsInput.Focus()
				case 3:
					m.tagsInput.Blur()
					m.statusInput.Focus()
				case 4:
					m.statusInput.Blur()
					m.dateInput.Focus()
				case 5:
					// Create task
					var tags []string
					if m.tagsInput.Value() != "" {
						tags = strings.Split(m.tagsInput.Value(), ",")
						for i := range tags {
							tags[i] = strings.TrimSpace(tags[i])
						}
					}

					newTask := Task{
						ID:          "", // Backend assigns or frontend assigns UUID. In Go let's leave empty, backend will assign.
						Title:       m.titleInput.Value(),
						Description: m.descInput.Value(),
						Tags:        tags,
						Status:      m.statusInput.Value(),
						DueDate:     m.dateInput.Value(),
					}
					m.tasks = append(m.tasks, newTask)
					m.dateInput.Blur()
					cmds = append(cmds, syncTasks(m.config, m.tasks))
				}
			}

			switch m.createStep {
			case 0:
				m.titleInput, cmd = m.titleInput.Update(msg)
			case 1:
				m.descInput, cmd = m.descInput.Update(msg)
			case 2:
				m.tagsInput, cmd = m.tagsInput.Update(msg)
			case 3:
				m.statusInput, cmd = m.statusInput.Update(msg)
			case 4:
				m.dateInput, cmd = m.dateInput.Update(msg)
			}
			cmds = append(cmds, cmd)
		}
	}

	return m, tea.Batch(cmds...)
}

func (m model) View() string {
	if m.errMessage != "" {
		return docStyle.Render(fmt.Sprintf("%s\n\n%s\n\nPress Enter to continue.",
			titleStyle.Render("Error"),
			errorStyle.Render(m.errMessage),
		))
	}

	switch m.state {
	case stateLogin:
		m.titleInput.Placeholder = "Enter your API Key"
		return docStyle.Render(fmt.Sprintf(
			"%s\n\nServer: %s\n\n%s\n\n%s",
			titleStyle.Render("Task Master CLI - Authentication"),
			m.config.ServerURL,
			m.titleInput.View(),
			"(Press Enter to submit, Ctrl+C to quit)",
		))
	case stateList:
		return docStyle.Render(m.list.View() + "\n(n)ew task | (x) delete | (enter) cycle status | (/) filter | (q)uit")
	case stateCreate:
		return docStyle.Render(fmt.Sprintf(
			"%s\n\n%s\n%s\n%s\n%s\n%s\n\n(Esc to cancel)",
			titleStyle.Render("Create New Task"),
			m.titleInput.View(),
			m.descInput.View(),
			m.tagsInput.View(),
			m.statusInput.View(),
			m.dateInput.View(),
		))
	}

	return "Unknown state"
}

func main() {
	if os.Getenv("DEBUG") != "" {
		f, err := tea.LogToFile("debug.log", "debug")
		if err != nil {
			fmt.Println("fatal:", err)
			os.Exit(1)
		}
		defer f.Close()
	}

	p := tea.NewProgram(initialModel(), tea.WithAltScreen())
	if _, err := p.Run(); err != nil {
		fmt.Printf("Error starting CLI: %v\n", err)
		os.Exit(1)
	}
}
