# Task Master

Task Master is a simple, offline-first task management application with Kanban and Calendar views. It can be used purely in your browser using `localStorage`, or you can run the optional backend server to sync your tasks across devices using an API key.

## Features

- **Offline First**: Works perfectly without a backend using your browser's local storage.
- **Backend Sync**: Optional Go backend to save your tasks, register an account, and get an API key.
- **Kanban Board**: Drag and drop tasks between Pending, In Progress, and Completed.
- **Calendar View**: See your tasks organized by due date.
- **Go CLI**: A rich terminal UI (TUI) built with Bubble Tea to manage your tasks from the command line.

## Running the Web App (Offline Mode)

You don't need any server to use Task Master! Simply open `index.html` in your web browser:

```bash
# If you have Python installed, you can use its built-in server:
python -m http.server 8080
# Then visit http://localhost:8080 in your browser
```

## Running the Backend Server (Online Mode)

If you want to sync your tasks and use the CLI, you need to run the Go backend. It uses SQLite to store user data, creating a separate database file for each user.

### Prerequisites

- [Go](https://golang.org/dl/) 1.25 or higher

### Build and Run the Server

```bash
# Build the server binary
go build -o server_bin server/main.go

# Run the server
./server_bin
```

The server will start on `http://localhost:8080` and will also serve the static frontend files.

1. Open `http://localhost:8080` in your browser.
2. Click **Register** to create an account.
3. Upon registration, you will be given an **API Key**. *Save this key!* It is used to authenticate the CLI and API requests.
4. Your local offline tasks will automatically be synced to your new account.

## Using the Go CLI (Terminal UI)

The CLI allows you to manage your tasks directly from your terminal using the API Key you generated from the web interface.

### Build and Run the CLI

```bash
# Build the CLI binary
go build -o cli_bin cli/main.go

# Run the CLI
./cli_bin
```

When you run the CLI for the first time, it will ask for your **API Key**. Paste the key you received during registration on the web app.

### CLI Controls

- **Navigate**: Up/Down arrows or `j`/`k`
- **Filter**: `/`
- **Create Task**: `n` (when not filtering)
- **Cycle Status**: `Enter`
- **Delete Task**: `x`
- **Quit**: `q` or `Ctrl+C`

## Exporting Data

You can export your tasks as JSON directly from the web interface using the "Export Tasks" button. If you are logged in, it will export your data from the server. If you are offline, it exports from local storage.
