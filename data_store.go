package main

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"sync"
)

const dataFilePath = "data.json"

type persistedData struct {
	Servers []storedServer `json:"servers"`
}

type storedServer struct {
	ID              string           `json:"id"`
	Name            string           `json:"name"`
	Endpoint        string           `json:"endpoint"`
	Auth            inspectAuth      `json:"auth"`
	Status          string           `json:"status"`
	CreatedAt       string           `json:"createdAt"`
	UpdatedAt       string           `json:"updatedAt"`
	LastInspectedAt string           `json:"lastInspectedAt,omitempty"`
	LastError       string           `json:"lastError,omitempty"`
	InspectResult   *inspectResponse `json:"inspectResult,omitempty"`
}

type dataStore struct {
	path string
	mu   sync.Mutex
	data persistedData
}

func newDataStore(path string) (*dataStore, error) {
	store := &dataStore{path: path}
	if err := store.load(); err != nil {
		return nil, err
	}
	return store, nil
}

func (s *dataStore) load() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	data, err := os.ReadFile(s.path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			s.data = persistedData{Servers: []storedServer{}}
			return s.persistLocked()
		}
		return err
	}

	if len(data) == 0 {
		s.data = persistedData{Servers: []storedServer{}}
		return nil
	}

	if err := json.Unmarshal(data, &s.data); err != nil {
		return err
	}

	if s.data.Servers == nil {
		s.data.Servers = []storedServer{}
	}

	return nil
}

func (s *dataStore) listServers() []storedServer {
	s.mu.Lock()
	defer s.mu.Unlock()

	servers := make([]storedServer, 0, len(s.data.Servers))
	for _, server := range s.data.Servers {
		servers = append(servers, cloneServer(server))
	}
	return servers
}

func (s *dataStore) getServer(id string) (storedServer, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()

	for _, server := range s.data.Servers {
		if server.ID == id {
			return cloneServer(server), true
		}
	}
	return storedServer{}, false
}

func (s *dataStore) appendServer(server storedServer) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.data.Servers = append([]storedServer{cloneServer(server)}, s.data.Servers...)
	return s.persistLocked()
}

func (s *dataStore) replaceServer(server storedServer) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	for index, current := range s.data.Servers {
		if current.ID == server.ID {
			s.data.Servers[index] = cloneServer(server)
			return s.persistLocked()
		}
	}

	return os.ErrNotExist
}

func (s *dataStore) deleteServer(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	for index, current := range s.data.Servers {
		if current.ID == id {
			s.data.Servers = append(s.data.Servers[:index], s.data.Servers[index+1:]...)
			return s.persistLocked()
		}
	}

	return os.ErrNotExist
}

func (s *dataStore) persistLocked() error {
	data, err := json.MarshalIndent(s.data, "", "  ")
	if err != nil {
		return err
	}

	dir := filepath.Dir(s.path)
	tempFile, err := os.CreateTemp(dir, "data-*.json")
	if err != nil {
		return err
	}

	tempPath := tempFile.Name()
	if _, err := tempFile.Write(data); err != nil {
		tempFile.Close()
		_ = os.Remove(tempPath)
		return err
	}
	if err := tempFile.Close(); err != nil {
		_ = os.Remove(tempPath)
		return err
	}

	if err := os.Rename(tempPath, s.path); err != nil {
		_ = os.Remove(tempPath)
		return err
	}

	return nil
}

func cloneServer(server storedServer) storedServer {
	data, err := json.Marshal(server)
	if err != nil {
		return server
	}

	var clone storedServer
	if err := json.Unmarshal(data, &clone); err != nil {
		return server
	}

	return clone
}
