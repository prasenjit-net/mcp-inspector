package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"
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
	mux.HandleFunc("DELETE /api/servers/{id}", app.handleDeleteServer)
	mux.HandleFunc("POST /api/servers/{id}/reinspect", app.handleReinspectServer)
	mux.HandleFunc("GET /api/servers/{id}/tools", app.handleListServerTools)
	mux.HandleFunc("GET /api/servers/{id}/tools/{toolName}", app.handleGetServerTool)
	mux.HandleFunc("GET /api/servers/{id}/resources", app.handleListServerResources)
	mux.HandleFunc("GET /api/servers/{id}/resources/{resourceID}", app.handleGetServerResource)
	mux.HandleFunc("POST /api/servers/{id}/resources/{resourceID}/content", app.handleReadServerResource)
	mux.HandleFunc("POST /api/agent/chat", app.handleAgentChat)
	mux.Handle("/", uiHandler())

	server := &http.Server{
		Addr:    addr,
		Handler: mux,
	}

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		log.Printf("mcp-inspector listening on %s", addr)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatal(err)
		}
	}()

	<-quit
	log.Println("shutting down, draining in-flight requests...")

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := server.Shutdown(ctx); err != nil {
		log.Fatalf("server shutdown failed: %v", err)
	}

	log.Println("server stopped")
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
