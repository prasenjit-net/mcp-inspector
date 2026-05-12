package main

import (
	"testing"
)

func TestDataStoreDeleteServer(t *testing.T) {
	t.Parallel()

	path := t.TempDir() + "/data.json"
	store, err := newDataStore(path)
	if err != nil {
		t.Fatalf("newDataStore: %v", err)
	}

	server := storedServer{
		ID:       "server-1",
		Name:     "Test server",
		Endpoint: "http://localhost:8080/mcp",
		Status:   "ready",
	}
	if err := store.appendServer(server); err != nil {
		t.Fatalf("appendServer: %v", err)
	}

	if err := store.deleteServer(server.ID); err != nil {
		t.Fatalf("deleteServer: %v", err)
	}

	if servers := store.listServers(); len(servers) != 0 {
		t.Fatalf("expected no servers after delete, got %d", len(servers))
	}
}
