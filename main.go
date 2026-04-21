package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
)

var version = "dev"

type healthResponse struct {
	Name    string `json:"name"`
	Status  string `json:"status"`
	Version string `json:"version"`
}

func main() {
	config, err := loadConfig()
	if err != nil {
		log.Fatal(err)
	}

	app := newApplication(config)

	addr := os.Getenv("ADDR")
	if addr == "" {
		addr = fmt.Sprintf(":%d", config.AppPort)
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/api/health", handleHealth)
	mux.HandleFunc("/api/inspect", handleInspect)
	mux.HandleFunc("/api/agent/chat", app.handleAgentChat)
	mux.Handle("/", uiHandler())

	server := &http.Server{
		Addr:    addr,
		Handler: mux,
	}

	log.Printf("mcp-inspector listening on %s", addr)
	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatal(err)
	}
}

func handleHealth(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	response := healthResponse{
		Name:    "mcp-inspector",
		Status:  "ok",
		Version: version,
	}

	if err := json.NewEncoder(w).Encode(response); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
}
