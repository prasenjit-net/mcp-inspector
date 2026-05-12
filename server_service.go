package main

import (
	"encoding/base64"
	"context"
	"crypto/rand"
	"encoding/hex"
	"net/url"
	"sort"
	"strings"
	"time"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

type createServerInput struct {
	Name     string       `json:"name"`
	Endpoint string       `json:"endpoint"`
	Auth     *inspectAuth `json:"auth,omitempty"`
}

type serverSummary struct {
	ID              string `json:"id"`
	Name            string `json:"name"`
	Endpoint        string `json:"endpoint"`
	Status          string `json:"status"`
	LastInspectedAt string `json:"lastInspectedAt,omitempty"`
	LastError       string `json:"lastError,omitempty"`
	Transport       string `json:"transport,omitempty"`
	ToolCount       int    `json:"toolCount"`
	ResourceCount   int    `json:"resourceCount"`
}

type serverDetail struct {
	serverSummary
	ServerName      string            `json:"serverName,omitempty"`
	ServerVersion   string            `json:"serverVersion,omitempty"`
	ProtocolVersion string            `json:"protocolVersion,omitempty"`
	Instructions    string            `json:"instructions,omitempty"`
	Tools           []toolSummary     `json:"tools"`
	Resources       []resourceSummary `json:"resources"`
}

type toolSummary struct {
	Name             string                  `json:"name"`
	DisplayName      string                  `json:"displayName"`
	Description      string                  `json:"description,omitempty"`
	InputFieldCount  int                     `json:"inputFieldCount"`
	OutputFieldCount int                     `json:"outputFieldCount"`
	Annotations      *inspectToolAnnotations `json:"annotations,omitempty"`
}

type toolDetail struct {
	ServerID     string                  `json:"serverId"`
	Name         string                  `json:"name"`
	DisplayName  string                  `json:"displayName"`
	Description  string                  `json:"description,omitempty"`
	Annotations  *inspectToolAnnotations `json:"annotations,omitempty"`
	InputSchema  any                     `json:"inputSchema"`
	OutputSchema any                     `json:"outputSchema,omitempty"`
}

type resourceSummary struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	URI         string `json:"uri,omitempty"`
	Description string `json:"description,omitempty"`
	MimeType    string `json:"mimeType,omitempty"`
}

type resourceDetail struct {
	ServerID string `json:"serverId"`
	resourceSummary
}

type resourceContentResponse struct {
	ServerID string                `json:"serverId"`
	Resource resourceSummary       `json:"resource"`
	Contents []resourceContentPart `json:"contents"`
}

type resourceContentPart struct {
	URI      string `json:"uri"`
	MimeType string `json:"mimeType,omitempty"`
	Text     string `json:"text,omitempty"`
	Blob     string `json:"blob,omitempty"`
}

type serverService struct {
	store *dataStore
}

type inputError struct {
	message string
}

func (e inputError) Error() string {
	return e.message
}

type notFoundError struct {
	kind string
}

func (e notFoundError) Error() string {
	return e.kind + " not found"
}

func newServerService(store *dataStore) *serverService {
	return &serverService{store: store}
}

func (s *serverService) listServerSummaries() []serverSummary {
	servers := s.store.listServers()
	summaries := make([]serverSummary, 0, len(servers))
	for _, server := range servers {
		summaries = append(summaries, sanitizeServerSummary(server))
	}
	return summaries
}

func (s *serverService) listReadyServers() []storedServer {
	servers := s.store.listServers()
	ready := make([]storedServer, 0)
	for _, server := range servers {
		if server.Status == "ready" && server.InspectResult != nil {
			ready = append(ready, server)
		}
	}
	return ready
}

func (s *serverService) getStoredServer(id string) (storedServer, error) {
	server, ok := s.store.getServer(id)
	if !ok {
		return storedServer{}, notFoundError{kind: "server"}
	}
	return server, nil
}

func (s *serverService) getServerDetail(id string) (serverDetail, error) {
	server, err := s.getStoredServer(id)
	if err != nil {
		return serverDetail{}, err
	}
	return sanitizeServerDetail(server), nil
}

func (s *serverService) createServer(ctx context.Context, input createServerInput) (serverDetail, error) {
	server, err := buildStoredServer(input)
	if err != nil {
		return serverDetail{}, err
	}

	inspected := s.inspectAndApply(ctx, server)
	if err := s.store.appendServer(inspected); err != nil {
		return serverDetail{}, err
	}

	return sanitizeServerDetail(inspected), nil
}

func (s *serverService) reinspectServer(ctx context.Context, id string) (serverDetail, error) {
	server, err := s.getStoredServer(id)
	if err != nil {
		return serverDetail{}, err
	}

	updated := s.inspectAndApply(ctx, server)
	if err := s.store.replaceServer(updated); err != nil {
		return serverDetail{}, err
	}

	return sanitizeServerDetail(updated), nil
}

func (s *serverService) deleteServer(id string) error {
	if _, err := s.getStoredServer(id); err != nil {
		return err
	}
	if err := s.store.deleteServer(id); err != nil {
		return notFoundError{kind: "server"}
	}
	return nil
}

func (s *serverService) listServerTools(id string) ([]toolSummary, error) {
	server, err := s.getStoredServer(id)
	if err != nil {
		return nil, err
	}

	detail := sanitizeServerDetail(server)
	return detail.Tools, nil
}

func (s *serverService) getServerTool(id, toolName string) (toolDetail, error) {
	server, err := s.getStoredServer(id)
	if err != nil {
		return toolDetail{}, err
	}
	if server.InspectResult == nil {
		return toolDetail{}, notFoundError{kind: "tool"}
	}

	for _, tool := range server.InspectResult.Tools {
		if tool.Name == toolName {
			return toolDetail{
				ServerID:     server.ID,
				Name:         tool.Name,
				DisplayName:  tool.DisplayName,
				Description:  tool.Description,
				Annotations:  tool.Annotations,
				InputSchema:  tool.InputSchema,
				OutputSchema: tool.OutputSchema,
			}, nil
		}
	}

	return toolDetail{}, notFoundError{kind: "tool"}
}

func (s *serverService) listServerResources(id string) ([]resourceSummary, error) {
	server, err := s.getStoredServer(id)
	if err != nil {
		return nil, err
	}

	detail := sanitizeServerDetail(server)
	return detail.Resources, nil
}

func (s *serverService) getServerResource(id, resourceID string) (resourceDetail, error) {
	server, err := s.getStoredServer(id)
	if err != nil {
		return resourceDetail{}, err
	}
	if server.InspectResult == nil {
		return resourceDetail{}, notFoundError{kind: "resource"}
	}

	for _, resource := range server.InspectResult.Resources {
		if resource.ID == resourceID {
			return resourceDetail{
				ServerID: id,
				resourceSummary: resourceSummary{
					ID:          resource.ID,
					Name:        resource.Name,
					URI:         resource.URI,
					Description: resource.Description,
					MimeType:    resource.MimeType,
				},
			}, nil
		}
	}

	return resourceDetail{}, notFoundError{kind: "resource"}
}

func (s *serverService) readServerResource(ctx context.Context, id, resourceID string) (resourceContentResponse, error) {
	server, err := s.getStoredServer(id)
	if err != nil {
		return resourceContentResponse{}, err
	}

	resource, err := s.getServerResource(id, resourceID)
	if err != nil {
		return resourceContentResponse{}, err
	}

	preferredTransport := ""
	if server.InspectResult != nil {
		preferredTransport = server.InspectResult.Transport
	}

	session, _, err := connectMCP(ctx, server.Endpoint, &server.Auth, preferredTransport)
	if err != nil {
		return resourceContentResponse{}, err
	}
	defer session.Close()

	result, err := session.ReadResource(ctx, &mcp.ReadResourceParams{URI: resourceID})
	if err != nil {
		return resourceContentResponse{}, err
	}

	contents := make([]resourceContentPart, 0, len(result.Contents))
	for _, content := range result.Contents {
		if content == nil {
			continue
		}

		part := resourceContentPart{
			URI:      content.URI,
			MimeType: content.MIMEType,
		}
		if part.MimeType == "" {
			part.MimeType = resource.MimeType
		}
		if content.Text != "" {
			part.Text = content.Text
		}
		if len(content.Blob) > 0 {
			part.Blob = base64.StdEncoding.EncodeToString(content.Blob)
		}
		contents = append(contents, part)
	}

	return resourceContentResponse{
		ServerID: id,
		Resource: resource.resourceSummary,
		Contents: contents,
	}, nil
}

func (s *serverService) inspectAndApply(ctx context.Context, server storedServer) storedServer {
	now := time.Now().UTC().Format(time.RFC3339)
	server.UpdatedAt = now
	server.LastError = ""

	inspectCtx, cancel := context.WithTimeout(ctx, inspectTimeout)
	defer cancel()

	result, err := inspectEndpoint(inspectCtx, server.Endpoint, &server.Auth)
	if err != nil {
		server.Status = "error"
		server.LastError = err.Error()
		return server
	}

	server.Status = "ready"
	server.LastInspectedAt = now
	server.InspectResult = result
	return server
}

func buildStoredServer(input createServerInput) (storedServer, error) {
	endpoint, err := normalizeEndpoint(input.Endpoint)
	if err != nil {
		return storedServer{}, inputError{message: err.Error()}
	}

	auth, err := normalizeInspectAuth(input.Auth)
	if err != nil {
		return storedServer{}, inputError{message: err.Error()}
	}

	name := strings.TrimSpace(input.Name)
	if name == "" {
		name = inferServerName(endpoint)
	}

	now := time.Now().UTC().Format(time.RFC3339)
	return storedServer{
		ID:        newServerID(),
		Name:      name,
		Endpoint:  endpoint,
		Auth:      *auth,
		Status:    "pending",
		CreatedAt: now,
		UpdatedAt: now,
	}, nil
}

func sanitizeServerSummary(server storedServer) serverSummary {
	summary := serverSummary{
		ID:              server.ID,
		Name:            server.Name,
		Endpoint:        server.Endpoint,
		Status:          server.Status,
		LastInspectedAt: server.LastInspectedAt,
		LastError:       server.LastError,
	}

	if server.InspectResult != nil {
		summary.Transport = server.InspectResult.Transport
		summary.ToolCount = len(server.InspectResult.Tools)
		summary.ResourceCount = len(server.InspectResult.Resources)
	}

	return summary
}

func sanitizeServerDetail(server storedServer) serverDetail {
	detail := serverDetail{
		serverSummary: sanitizeServerSummary(server),
		Tools:         []toolSummary{},
		Resources:     []resourceSummary{},
	}

	if server.InspectResult == nil {
		return detail
	}

	detail.ServerName = server.InspectResult.Server.Name
	detail.ServerVersion = server.InspectResult.Server.Version
	detail.ProtocolVersion = server.InspectResult.ProtocolVersion
	detail.Instructions = server.InspectResult.Instructions

	for _, tool := range server.InspectResult.Tools {
		detail.Tools = append(detail.Tools, toolSummary{
			Name:             tool.Name,
			DisplayName:      tool.DisplayName,
			Description:      tool.Description,
			InputFieldCount:  schemaFieldCount(tool.InputSchema),
			OutputFieldCount: schemaFieldCount(tool.OutputSchema),
			Annotations:      tool.Annotations,
		})
	}

	sort.Slice(detail.Tools, func(i, j int) bool {
		return detail.Tools[i].DisplayName < detail.Tools[j].DisplayName
	})

	for _, resource := range server.InspectResult.Resources {
		detail.Resources = append(detail.Resources, resourceSummary{
			ID:          resource.ID,
			Name:        resource.Name,
			URI:         resource.URI,
			Description: resource.Description,
			MimeType:    resource.MimeType,
		})
	}

	sort.Slice(detail.Resources, func(i, j int) bool {
		return detail.Resources[i].Name < detail.Resources[j].Name
	})

	return detail
}

func schemaFieldCount(value any) int {
	schema, ok := normalizeJSONValue(value).(map[string]any)
	if !ok {
		return 0
	}
	properties, ok := schema["properties"].(map[string]any)
	if !ok {
		return 0
	}
	return len(properties)
}

func inferServerName(raw string) string {
	parsed, err := url.Parse(raw)
	if err != nil || parsed.Hostname() == "" {
		return "New server"
	}
	return parsed.Hostname()
}

func newServerID() string {
	var buffer [12]byte
	if _, err := rand.Read(buffer[:]); err != nil {
		return hex.EncodeToString([]byte(time.Now().UTC().Format(time.RFC3339Nano)))
	}
	return hex.EncodeToString(buffer[:])
}
