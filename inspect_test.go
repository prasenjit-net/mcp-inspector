package main

import (
	"context"
	"testing"
	"time"

	"net/http"
	"net/http/httptest"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

type searchInput struct {
	Query string `json:"query" jsonschema:"Query string to search for"`
	Limit int    `json:"limit" jsonschema:"Maximum number of matches to return"`
}

type searchOutput struct {
	Results []string `json:"results" jsonschema:"Matched result identifiers"`
	Count   int      `json:"count" jsonschema:"Total number of matches returned"`
}

func TestInspectEndpointStreamableHTTP(t *testing.T) {
	server := newTestMCPServer()
	httpServer := httptest.NewServer(mcp.NewStreamableHTTPHandler(func(*http.Request) *mcp.Server {
		return server
	}, nil))
	defer httpServer.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	response, err := inspectEndpoint(ctx, httpServer.URL, nil)
	if err != nil {
		t.Fatalf("inspectEndpoint returned error: %v", err)
	}

	if response.Transport != "streamable-http" {
		t.Fatalf("expected streamable-http transport, got %q", response.Transport)
	}

	assertToolResponse(t, response)
}

func TestInspectEndpointSSEFallback(t *testing.T) {
	server := newTestMCPServer()
	httpServer := httptest.NewServer(mcp.NewSSEHandler(func(*http.Request) *mcp.Server {
		return server
	}, nil))
	defer httpServer.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	response, err := inspectEndpoint(ctx, httpServer.URL, nil)
	if err != nil {
		t.Fatalf("inspectEndpoint returned error: %v", err)
	}

	if response.Transport != "sse" {
		t.Fatalf("expected sse transport, got %q", response.Transport)
	}

	assertToolResponse(t, response)
}

func TestNormalizeEndpoint(t *testing.T) {
	if _, err := normalizeEndpoint("ftp://example.com"); err == nil {
		t.Fatal("expected non-http URL to fail validation")
	}
}

func TestInspectEndpointBearerAuth(t *testing.T) {
	server := newTestMCPServer()
	handler := requireHeader("Authorization", "Bearer secret-token", mcp.NewStreamableHTTPHandler(func(*http.Request) *mcp.Server {
		return server
	}, nil))
	httpServer := httptest.NewServer(handler)
	defer httpServer.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	response, err := inspectEndpoint(ctx, httpServer.URL, &inspectAuth{
		Type:  "bearer",
		Token: "secret-token",
	})
	if err != nil {
		t.Fatalf("inspectEndpoint returned error: %v", err)
	}

	if response.Transport != "streamable-http" {
		t.Fatalf("expected streamable-http transport, got %q", response.Transport)
	}
}

func TestInspectEndpointCustomHeaderAuthSSE(t *testing.T) {
	server := newTestMCPServer()
	handler := requireHeader("X-Api-Key", "abc123", mcp.NewSSEHandler(func(*http.Request) *mcp.Server {
		return server
	}, nil))
	httpServer := httptest.NewServer(handler)
	defer httpServer.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	response, err := inspectEndpoint(ctx, httpServer.URL, &inspectAuth{
		Type:        "header",
		HeaderName:  "X-Api-Key",
		HeaderValue: "abc123",
	})
	if err != nil {
		t.Fatalf("inspectEndpoint returned error: %v", err)
	}

	if response.Transport != "sse" {
		t.Fatalf("expected sse transport, got %q", response.Transport)
	}
}

func TestNormalizeInspectAuth(t *testing.T) {
	auth, err := normalizeInspectAuth(&inspectAuth{Type: "bearer", Token: "test-token"})
	if err != nil {
		t.Fatalf("normalizeInspectAuth returned error: %v", err)
	}
	if auth.Type != "bearer" || auth.Token != "test-token" {
		t.Fatalf("unexpected normalized auth: %#v", auth)
	}

	if _, err := normalizeInspectAuth(&inspectAuth{Type: "header", HeaderName: "Bad Header", HeaderValue: "x"}); err == nil {
		t.Fatal("expected invalid header name to fail validation")
	}
}

func newTestMCPServer() *mcp.Server {
	server := mcp.NewServer(&mcp.Implementation{
		Name:    "fixture-server",
		Version: "1.2.3",
	}, nil)

	mcp.AddTool(server, &mcp.Tool{
		Name:        "search_docs",
		Title:       "Search docs",
		Description: "Search the documentation index for matching entries.",
	}, func(context.Context, *mcp.CallToolRequest, searchInput) (*mcp.CallToolResult, searchOutput, error) {
		return &mcp.CallToolResult{}, searchOutput{}, nil
	})

	return server
}

func assertToolResponse(t *testing.T, response *inspectResponse) {
	t.Helper()

	if response.Server.Name != "fixture-server" {
		t.Fatalf("expected server name fixture-server, got %q", response.Server.Name)
	}

	if len(response.Tools) != 1 {
		t.Fatalf("expected 1 tool, got %d", len(response.Tools))
	}

	tool := response.Tools[0]
	if tool.Name != "search_docs" {
		t.Fatalf("expected tool name search_docs, got %q", tool.Name)
	}

	inputSchema, ok := tool.InputSchema.(map[string]any)
	if !ok {
		t.Fatalf("expected input schema object, got %T", tool.InputSchema)
	}

	properties, ok := inputSchema["properties"].(map[string]any)
	if !ok {
		t.Fatalf("expected input schema properties, got %T", inputSchema["properties"])
	}

	queryProperty, ok := properties["query"].(map[string]any)
	if !ok {
		t.Fatalf("expected query property schema, got %T", properties["query"])
	}

	if queryProperty["description"] != "Query string to search for" {
		t.Fatalf("expected query description, got %#v", queryProperty["description"])
	}

	outputSchema, ok := tool.OutputSchema.(map[string]any)
	if !ok {
		t.Fatalf("expected output schema object, got %T", tool.OutputSchema)
	}

	outputProperties, ok := outputSchema["properties"].(map[string]any)
	if !ok {
		t.Fatalf("expected output schema properties, got %T", outputSchema["properties"])
	}

	countProperty, ok := outputProperties["count"].(map[string]any)
	if !ok {
		t.Fatalf("expected count property schema, got %T", outputProperties["count"])
	}

	if countProperty["description"] != "Total number of matches returned" {
		t.Fatalf("expected count description, got %#v", countProperty["description"])
	}
}

func requireHeader(name, value string, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if got := r.Header.Get(name); got != value {
			http.Error(w, "missing auth", http.StatusUnauthorized)
			return
		}
		next.ServeHTTP(w, r)
	})
}
