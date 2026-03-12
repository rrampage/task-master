package main

import (
	"crypto/rand"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
	_ "modernc.org/sqlite"
)

var (
	usersDBPath = "data/users.db"
	dataDir     = "data"
	usersDB     *sql.DB
)

// Task represents a single task
type Task struct {
	ID          string   `json:"id"`
	Title       string   `json:"title"`
	Description string   `json:"description"`
	Tags        []string `json:"tags"`
	Status      string   `json:"status"`
	DueDate     string   `json:"dueDate"`
}

type User struct {
	ID       string `json:"id"`
	Username string `json:"username"`
	APIKey   string `json:"api_key"`
}

func initDB() error {
	if err := os.MkdirAll(dataDir, 0755); err != nil {
		return err
	}

	db, err := sql.Open("sqlite", usersDBPath)
	if err != nil {
		return err
	}
	usersDB = db

	_, err = db.Exec(`
		CREATE TABLE IF NOT EXISTS users (
			id TEXT PRIMARY KEY,
			username TEXT UNIQUE NOT NULL,
			password_hash TEXT NOT NULL,
			api_key TEXT UNIQUE NOT NULL,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP
		);
		CREATE TABLE IF NOT EXISTS sessions (
			session_id TEXT PRIMARY KEY,
			user_id TEXT NOT NULL,
			csrf_token TEXT NOT NULL,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY(user_id) REFERENCES users(id)
		);
	`)
	return err
}

func getUserDB(userID string) (*sql.DB, error) {
	dbPath := filepath.Join(dataDir, fmt.Sprintf("user_%s.db", userID))
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, err
	}

	_, err = db.Exec(`
		CREATE TABLE IF NOT EXISTS tasks (
			id TEXT PRIMARY KEY,
			title TEXT NOT NULL,
			description TEXT,
			tags TEXT,
			status TEXT,
			due_date TEXT
		);
	`)
	if err != nil {
		db.Close()
		return nil, err
	}
	return db, nil
}

func generateRandomString(n int) (string, error) {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

func generateAPIKey() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.URLEncoding.EncodeToString(b), nil
}

func enableCors(w *http.ResponseWriter) {
	(*w).Header().Set("Access-Control-Allow-Origin", "*")
	(*w).Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS, PUT, DELETE")
	(*w).Header().Set("Access-Control-Allow-Headers", "Accept, Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization")
}

func checkAuth(r *http.Request) (string, error) {
	// Check API Key first
	authHeader := r.Header.Get("Authorization")
	if strings.HasPrefix(authHeader, "Bearer ") {
		apiKey := strings.TrimPrefix(authHeader, "Bearer ")
		var userID string
		err := usersDB.QueryRow("SELECT id FROM users WHERE api_key = ?", apiKey).Scan(&userID)
		if err == nil {
			return userID, nil
		}
	}

	// Check Session Cookie
	cookie, err := r.Cookie("session_id")
	if err != nil {
		return "", fmt.Errorf("unauthorized")
	}

	var userID, csrfToken string
	err = usersDB.QueryRow("SELECT user_id, csrf_token FROM sessions WHERE session_id = ?", cookie.Value).Scan(&userID, &csrfToken)
	if err != nil {
		return "", fmt.Errorf("unauthorized")
	}

	// For POST/PUT/DELETE requests using session, require X-CSRF-Token header
	if r.Method != "GET" && r.Method != "OPTIONS" && r.Method != "HEAD" {
		headerToken := r.Header.Get("X-CSRF-Token")
		if headerToken != csrfToken {
			return "", fmt.Errorf("csrf validation failed")
		}
	}

	return userID, nil
}

func handleRegister(w http.ResponseWriter, r *http.Request) {
	enableCors(&w)
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}
	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	if len(req.Username) < 3 || len(req.Password) < 6 {
		http.Error(w, "Username > 2 and Password > 5 characters required", http.StatusBadRequest)
		return
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		http.Error(w, "Error hashing password", http.StatusInternalServerError)
		return
	}

	userID := uuid.New().String()
	apiKey, err := generateAPIKey()
	if err != nil {
		http.Error(w, "Error generating API key", http.StatusInternalServerError)
		return
	}

	_, err = usersDB.Exec("INSERT INTO users (id, username, password_hash, api_key) VALUES (?, ?, ?, ?)", userID, req.Username, hash, apiKey)
	if err != nil {
		http.Error(w, "Username already exists", http.StatusConflict)
		return
	}

	// Initialize user DB
	userDB, err := getUserDB(userID)
	if err != nil {
		http.Error(w, "Error initializing user storage", http.StatusInternalServerError)
		return
	}
	userDB.Close()

	sessionID, _ := generateRandomString(32)
	csrfToken, _ := generateRandomString(32)

	_, err = usersDB.Exec("INSERT INTO sessions (session_id, user_id, csrf_token) VALUES (?, ?, ?)", sessionID, userID, csrfToken)
	if err != nil {
		http.Error(w, "Error creating session", http.StatusInternalServerError)
		return
	}

	http.SetCookie(w, &http.Cookie{
		Name:     "session_id",
		Value:    sessionID,
		Path:     "/",
		HttpOnly: true,
		Secure:   false, // Set to true if using HTTPS
		SameSite: http.SameSiteLaxMode,
		MaxAge:   86400 * 30, // 30 days
	})

	w.Header().Set("X-CSRF-Token", csrfToken)
	json.NewEncoder(w).Encode(User{ID: userID, Username: req.Username, APIKey: apiKey})
}

func handleLogin(w http.ResponseWriter, r *http.Request) {
	enableCors(&w)
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}
	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	var userID, hash, apiKey string
	err := usersDB.QueryRow("SELECT id, password_hash, api_key FROM users WHERE username = ?", req.Username).Scan(&userID, &hash, &apiKey)
	if err != nil {
		http.Error(w, "Invalid credentials", http.StatusUnauthorized)
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(req.Password)); err != nil {
		http.Error(w, "Invalid credentials", http.StatusUnauthorized)
		return
	}

	sessionID, _ := generateRandomString(32)
	csrfToken, _ := generateRandomString(32)

	_, err = usersDB.Exec("INSERT INTO sessions (session_id, user_id, csrf_token) VALUES (?, ?, ?)", sessionID, userID, csrfToken)
	if err != nil {
		http.Error(w, "Error creating session", http.StatusInternalServerError)
		return
	}

	http.SetCookie(w, &http.Cookie{
		Name:     "session_id",
		Value:    sessionID,
		Path:     "/",
		HttpOnly: true,
		Secure:   false,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   86400 * 30, // 30 days
	})

	w.Header().Set("X-CSRF-Token", csrfToken)
	json.NewEncoder(w).Encode(User{ID: userID, Username: req.Username, APIKey: apiKey})
}

func handleLogout(w http.ResponseWriter, r *http.Request) {
	enableCors(&w)
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}
	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	cookie, err := r.Cookie("session_id")
	if err == nil {
		usersDB.Exec("DELETE FROM sessions WHERE session_id = ?", cookie.Value)
	}

	http.SetCookie(w, &http.Cookie{
		Name:     "session_id",
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		MaxAge:   -1,
	})

	w.WriteHeader(http.StatusOK)
}

func handleMe(w http.ResponseWriter, r *http.Request) {
	enableCors(&w)
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}
	if r.Method != "GET" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	userID, err := checkAuth(r)
	if err != nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var user User
	user.ID = userID
	err = usersDB.QueryRow("SELECT username, api_key FROM users WHERE id = ?", userID).Scan(&user.Username, &user.APIKey)
	if err != nil {
		http.Error(w, "User not found", http.StatusNotFound)
		return
	}

	json.NewEncoder(w).Encode(user)
}

func handleTasks(w http.ResponseWriter, r *http.Request) {
	enableCors(&w)
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	userID, err := checkAuth(r)
	if err != nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	userDB, err := getUserDB(userID)
	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}
	defer userDB.Close()

	if r.Method == "GET" {
		rows, err := userDB.Query("SELECT id, title, description, tags, status, due_date FROM tasks")
		if err != nil {
			http.Error(w, "Query error", http.StatusInternalServerError)
			return
		}
		defer rows.Close()

		var tasks []Task
		for rows.Next() {
			var t Task
			var tagsStr string
			if err := rows.Scan(&t.ID, &t.Title, &t.Description, &tagsStr, &t.Status, &t.DueDate); err != nil {
				continue
			}
			if tagsStr != "" {
				t.Tags = strings.Split(tagsStr, ",")
			} else {
				t.Tags = []string{}
			}
			tasks = append(tasks, t)
		}
		json.NewEncoder(w).Encode(tasks)
		return
	}

	if r.Method == "POST" {
		// Sync all tasks. Replace existing.
		var tasks []Task
		if err := json.NewDecoder(r.Body).Decode(&tasks); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		tx, err := userDB.Begin()
		if err != nil {
			http.Error(w, "Transaction error", http.StatusInternalServerError)
			return
		}
		defer tx.Rollback()

		_, err = tx.Exec("DELETE FROM tasks")
		if err != nil {
			http.Error(w, "Delete error", http.StatusInternalServerError)
			return
		}

		stmt, err := tx.Prepare("INSERT INTO tasks (id, title, description, tags, status, due_date) VALUES (?, ?, ?, ?, ?, ?)")
		if err != nil {
			http.Error(w, "Prepare error", http.StatusInternalServerError)
			return
		}
		defer stmt.Close()

		for _, t := range tasks {
			if t.ID == "" {
				t.ID = uuid.New().String()
			}
			tagsStr := strings.Join(t.Tags, ",")
			_, err = stmt.Exec(t.ID, t.Title, t.Description, tagsStr, t.Status, t.DueDate)
			if err != nil {
				http.Error(w, "Insert error", http.StatusInternalServerError)
				return
			}
		}

		if err := tx.Commit(); err != nil {
			http.Error(w, "Commit error", http.StatusInternalServerError)
			return
		}

		w.WriteHeader(http.StatusOK)
		return
	}

	http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
}

func handleExport(w http.ResponseWriter, r *http.Request) {
	enableCors(&w)
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}
	if r.Method != "GET" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	userID, err := checkAuth(r)
	if err != nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	userDB, err := getUserDB(userID)
	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}
	defer userDB.Close()

	rows, err := userDB.Query("SELECT id, title, description, tags, status, due_date FROM tasks")
	if err != nil {
		http.Error(w, "Query error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var tasks []Task
	for rows.Next() {
		var t Task
		var tagsStr string
		if err := rows.Scan(&t.ID, &t.Title, &t.Description, &tagsStr, &t.Status, &t.DueDate); err != nil {
			continue
		}
		if tagsStr != "" {
			t.Tags = strings.Split(tagsStr, ",")
		} else {
			t.Tags = []string{}
		}
		tasks = append(tasks, t)
	}

	w.Header().Set("Content-Disposition", "attachment; filename=tasks.json")
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(tasks)
}


// A simple file server for serving static files (index.html, js, css, etc.)
func main() {
	if err := initDB(); err != nil {
		log.Fatalf("Failed to initialize database: %v", err)
	}

	http.HandleFunc("/api/register", handleRegister)
	http.HandleFunc("/api/login", handleLogin)
	http.HandleFunc("/api/logout", handleLogout)
	http.HandleFunc("/api/me", handleMe)
	http.HandleFunc("/api/tasks", handleTasks)
	http.HandleFunc("/api/export", handleExport)

	// Serve static files
	fs := http.FileServer(http.Dir("."))
	http.Handle("/", fs)

	port := ":8080"
	fmt.Printf("Server listening on http://localhost%s\n", port)
	if err := http.ListenAndServe(port, nil); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}
