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

	app, err := newApplication(config)
	if err != nil {
		log.Fatal(err)
	}

	addr := os.Getenv("ADDR")
	if addr == "" {
		addr = fmt.Sprintf(":%d", config.AppPort)
	}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/health", handleHealth)
	mux.HandleFunc("GET /api/servers", app.handleListServers)
	mux.HandleFunc("POST /api/servers", app.handleCreateServer)
	mux.HandleFunc("GET /api/servers/{id}", app.handleGetServer)
	mux.HandleFunc("POST /api/servers/{id}/reinspect", app.handleReinspectServer)
	mux.HandleFunc("GET /api/servers/{id}/tools", app.handleListServerTools)
	mux.HandleFunc("GET /api/servers/{id}/tools/{toolName}", app.handleGetServerTool)
	mux.HandleFunc("GET /api/servers/{id}/resources", app.handleListServerResources)
	mux.HandleFunc("GET /api/servers/{id}/resources/{resourceID}", app.handleGetServerResource)
	mux.HandleFunc("POST /api/agent/chat", app.handleAgentChat)
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
