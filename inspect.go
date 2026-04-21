package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/textproto"
	"net/url"
	"sort"
	"strings"
	"time"
	"unicode"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

const inspectTimeout = 20 * time.Second

type inspectRequest struct {
	URL  string       `json:"url"`
	Auth *inspectAuth `json:"auth,omitempty"`
}

type inspectAuth struct {
	Type        string `json:"type,omitempty"`
	Token       string `json:"token,omitempty"`
	HeaderName  string `json:"headerName,omitempty"`
	HeaderValue string `json:"headerValue,omitempty"`
}

type inspectResponse struct {
	URL             string            `json:"url"`
	Transport       string            `json:"transport"`
	ProtocolVersion string            `json:"protocolVersion,omitempty"`
	Instructions    string            `json:"instructions,omitempty"`
	Server          inspectServerInfo `json:"server"`
	Tools           []inspectTool     `json:"tools"`
	Resources       []inspectResource `json:"resources,omitempty"`
}

type inspectServerInfo struct {
	Name    string `json:"name,omitempty"`
	Version string `json:"version,omitempty"`
}

type inspectTool struct {
	Name         string                  `json:"name"`
	Title        string                  `json:"title,omitempty"`
	DisplayName  string                  `json:"displayName"`
	Description  string                  `json:"description,omitempty"`
	Annotations  *inspectToolAnnotations `json:"annotations,omitempty"`
	InputSchema  any                     `json:"inputSchema"`
	OutputSchema any                     `json:"outputSchema,omitempty"`
}

type inspectToolAnnotations struct {
	Title           string `json:"title,omitempty"`
	ReadOnlyHint    bool   `json:"readOnlyHint,omitempty"`
	IdempotentHint  bool   `json:"idempotentHint,omitempty"`
	DestructiveHint *bool  `json:"destructiveHint,omitempty"`
	OpenWorldHint   *bool  `json:"openWorldHint,omitempty"`
}

type inspectResource struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	URI         string `json:"uri,omitempty"`
	Description string `json:"description,omitempty"`
	MimeType    string `json:"mimeType,omitempty"`
}

type apiError struct {
	Error string `json:"error"`
}

type inspectTransport struct {
	name    string
	connect func(context.Context, string) (*mcp.ClientSession, error)
}

func handleInspect(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, apiError{Error: "method not allowed"})
		return
	}

	var request inspectRequest
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()

	if err := decoder.Decode(&request); err != nil {
		writeJSON(w, http.StatusBadRequest, apiError{Error: "invalid JSON request body"})
		return
	}

	if err := decoder.Decode(&struct{}{}); err != io.EOF {
		writeJSON(w, http.StatusBadRequest, apiError{Error: "request body must contain a single JSON object"})
		return
	}

	endpoint, err := normalizeEndpoint(request.URL)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, apiError{Error: err.Error()})
		return
	}

	auth, err := normalizeInspectAuth(request.Auth)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, apiError{Error: err.Error()})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), inspectTimeout)
	defer cancel()

	response, err := inspectEndpoint(ctx, endpoint, auth)
	if err != nil {
		writeJSON(w, http.StatusBadGateway, apiError{Error: err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, response)
}

func inspectEndpoint(ctx context.Context, endpoint string, auth *inspectAuth) (*inspectResponse, error) {
	var failures []string

	for _, transport := range availableTransports(auth, "") {
		attemptCtx, cancel := context.WithTimeout(ctx, transportTimeout(ctx))
		response, err := inspectWithTransport(attemptCtx, endpoint, transport)
		cancel()
		if err == nil {
			return response, nil
		}

		failures = append(failures, fmt.Sprintf("%s: %v", transport.name, err))
	}

	return nil, fmt.Errorf("failed to inspect MCP server at %s (%s)", endpoint, strings.Join(failures, "; "))
}

func inspectWithTransport(ctx context.Context, endpoint string, transport inspectTransport) (*inspectResponse, error) {
	session, err := transport.connect(ctx, endpoint)
	if err != nil {
		return nil, err
	}
	defer session.Close()

	tools, err := listAllTools(ctx, session)
	if err != nil {
		return nil, err
	}
	resources, err := listAllResources(ctx, session)
	if err != nil {
		resources = nil
	}

	initialize := session.InitializeResult()
	response := &inspectResponse{
		URL:       endpoint,
		Transport: transport.name,
		Tools:     normalizeTools(tools),
		Resources: normalizeResources(resources),
	}

	if initialize != nil {
		response.ProtocolVersion = initialize.ProtocolVersion
		response.Instructions = initialize.Instructions
		if initialize.ServerInfo != nil {
			response.Server = inspectServerInfo{
				Name:    initialize.ServerInfo.Name,
				Version: initialize.ServerInfo.Version,
			}
		}
	}

	return response, nil
}

func connectMCP(ctx context.Context, endpoint string, auth *inspectAuth, preferred string) (*mcp.ClientSession, string, error) {
	var failures []string

	for _, transport := range availableTransports(auth, preferred) {
		session, err := transport.connect(ctx, endpoint)
		if err == nil {
			return session, transport.name, nil
		}

		failures = append(failures, fmt.Sprintf("%s: %v", transport.name, err))
	}

	return nil, "", fmt.Errorf("failed to connect to MCP server at %s (%s)", endpoint, strings.Join(failures, "; "))
}

func availableTransports(auth *inspectAuth, preferred string) []inspectTransport {
	transports := []inspectTransport{
		{
			name: "streamable-http",
			connect: func(ctx context.Context, endpoint string) (*mcp.ClientSession, error) {
				client := newInspectorClient()
				return client.Connect(ctx, &mcp.StreamableClientTransport{
					Endpoint:             endpoint,
					HTTPClient:           newInspectorHTTPClient(auth),
					DisableStandaloneSSE: true,
				}, nil)
			},
		},
		{
			name: "sse",
			connect: func(ctx context.Context, endpoint string) (*mcp.ClientSession, error) {
				client := newInspectorClient()
				return client.Connect(ctx, &mcp.SSEClientTransport{
					Endpoint:   endpoint,
					HTTPClient: newInspectorHTTPClient(auth),
				}, nil)
			},
		},
	}

	if preferred == "" || preferred == transports[0].name {
		return transports
	}

	if preferred == transports[1].name {
		return []inspectTransport{transports[1], transports[0]}
	}

	return transports
}

func listAllTools(ctx context.Context, session *mcp.ClientSession) ([]*mcp.Tool, error) {
	tools := make([]*mcp.Tool, 0)

	for tool, err := range session.Tools(ctx, nil) {
		if err != nil {
			return nil, err
		}
		if tool != nil {
			tools = append(tools, tool)
		}
	}

	return tools, nil
}

func listAllResources(ctx context.Context, session *mcp.ClientSession) ([]*mcp.Resource, error) {
	resources := make([]*mcp.Resource, 0)

	for resource, err := range session.Resources(ctx, nil) {
		if err != nil {
			return nil, err
		}
		if resource != nil {
			resources = append(resources, resource)
		}
	}

	return resources, nil
}

func normalizeTools(tools []*mcp.Tool) []inspectTool {
	result := make([]inspectTool, 0, len(tools))

	for _, tool := range tools {
		if tool == nil {
			continue
		}

		result = append(result, inspectTool{
			Name:         tool.Name,
			Title:        tool.Title,
			DisplayName:  displayNameForTool(tool),
			Description:  tool.Description,
			Annotations:  normalizeToolAnnotations(tool.Annotations),
			InputSchema:  normalizeJSONValue(tool.InputSchema),
			OutputSchema: normalizeJSONValue(tool.OutputSchema),
		})
	}

	sort.Slice(result, func(i, j int) bool {
		return result[i].DisplayName < result[j].DisplayName
	})

	return result
}

func normalizeResources(resources []*mcp.Resource) []inspectResource {
	result := make([]inspectResource, 0, len(resources))

	for _, resource := range resources {
		if resource == nil {
			continue
		}

		name := resource.Name
		if name == "" {
			name = resource.URI
		}

		result = append(result, inspectResource{
			ID:          resource.URI,
			Name:        name,
			URI:         resource.URI,
			Description: resource.Description,
			MimeType:    resource.MIMEType,
		})
	}

	sort.Slice(result, func(i, j int) bool {
		return result[i].Name < result[j].Name
	})

	return result
}

func displayNameForTool(tool *mcp.Tool) string {
	switch {
	case tool.Title != "":
		return tool.Title
	case tool.Annotations != nil && tool.Annotations.Title != "":
		return tool.Annotations.Title
	default:
		return tool.Name
	}
}

func normalizeToolAnnotations(annotations *mcp.ToolAnnotations) *inspectToolAnnotations {
	if annotations == nil {
		return nil
	}

	return &inspectToolAnnotations{
		Title:           annotations.Title,
		ReadOnlyHint:    annotations.ReadOnlyHint,
		IdempotentHint:  annotations.IdempotentHint,
		DestructiveHint: annotations.DestructiveHint,
		OpenWorldHint:   annotations.OpenWorldHint,
	}
}

func normalizeJSONValue(value any) any {
	if value == nil {
		return nil
	}

	data, err := json.Marshal(value)
	if err != nil {
		return nil
	}

	var normalized any
	if err := json.Unmarshal(data, &normalized); err != nil {
		return nil
	}

	return normalized
}

func newInspectorClient() *mcp.Client {
	return mcp.NewClient(&mcp.Implementation{
		Name:    "mcp-inspector",
		Version: version,
	}, nil)
}

func newInspectorHTTPClient(auth *inspectAuth) *http.Client {
	if auth == nil || auth.Type == "" || auth.Type == "none" {
		return nil
	}

	return &http.Client{
		Transport: &authTransport{
			base: http.DefaultTransport,
			auth: auth,
		},
	}
}

type authTransport struct {
	base http.RoundTripper
	auth *inspectAuth
}

func (t *authTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	clone := req.Clone(req.Context())
	clone.Header = req.Header.Clone()

	switch t.auth.Type {
	case "bearer":
		clone.Header.Set("Authorization", "Bearer "+t.auth.Token)
	case "header":
		clone.Header.Set(t.auth.HeaderName, t.auth.HeaderValue)
	}

	base := t.base
	if base == nil {
		base = http.DefaultTransport
	}

	return base.RoundTrip(clone)
}

func normalizeEndpoint(raw string) (string, error) {
	value := strings.TrimSpace(raw)
	if value == "" {
		return "", errors.New("mcp URL is required")
	}

	parsed, err := url.ParseRequestURI(value)
	if err != nil {
		return "", errors.New("mcp URL must be a valid http or https URL")
	}

	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return "", errors.New("mcp URL must use http or https")
	}

	return parsed.String(), nil
}

func normalizeInspectAuth(auth *inspectAuth) (*inspectAuth, error) {
	if auth == nil || strings.TrimSpace(auth.Type) == "" || strings.TrimSpace(auth.Type) == "none" {
		return &inspectAuth{Type: "none"}, nil
	}

	switch strings.TrimSpace(auth.Type) {
	case "bearer":
		token := strings.TrimSpace(auth.Token)
		if token == "" {
			return nil, errors.New("bearer token is required")
		}
		if containsHeaderControlChars(token) {
			return nil, errors.New("bearer token contains invalid characters")
		}
		return &inspectAuth{Type: "bearer", Token: token}, nil
	case "header":
		name := textprotoTrim(auth.HeaderName)
		value := strings.TrimSpace(auth.HeaderValue)
		if name == "" {
			return nil, errors.New("custom header name is required")
		}
		if !isValidHeaderName(name) {
			return nil, errors.New("custom header name is invalid")
		}
		if value == "" {
			return nil, errors.New("custom header value is required")
		}
		if containsHeaderControlChars(value) {
			return nil, errors.New("custom header value contains invalid characters")
		}
		return &inspectAuth{
			Type:        "header",
			HeaderName:  name,
			HeaderValue: value,
		}, nil
	default:
		return nil, errors.New("unsupported auth type")
	}
}

func containsHeaderControlChars(value string) bool {
	return strings.ContainsAny(value, "\r\n")
}

func isValidHeaderName(value string) bool {
	if value == "" || containsHeaderControlChars(value) {
		return false
	}

	for _, r := range value {
		if !isHeaderTokenRune(r) {
			return false
		}
	}

	return true
}

func isHeaderTokenRune(r rune) bool {
	if r > unicode.MaxASCII {
		return false
	}

	if 'a' <= r && r <= 'z' || 'A' <= r && r <= 'Z' || '0' <= r && r <= '9' {
		return true
	}

	switch r {
	case '!', '#', '$', '%', '&', '\'', '*', '+', '-', '.', '^', '_', '`', '|', '~':
		return true
	default:
		return false
	}
}

func textprotoTrim(value string) string {
	return textproto.CanonicalMIMEHeaderKey(strings.TrimSpace(value))
}

func transportTimeout(ctx context.Context) time.Duration {
	if deadline, ok := ctx.Deadline(); ok {
		remaining := time.Until(deadline)
		if remaining <= 0 {
			return time.Millisecond
		}
		if remaining < 8*time.Second {
			return remaining
		}
	}

	return 8 * time.Second
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)

	if err := json.NewEncoder(w).Encode(payload); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
}
