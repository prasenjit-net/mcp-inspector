package main

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

type application struct {
	config appConfig
	agent  *agentService
}

type agentService struct {
	config   appConfig
	client   *http.Client
	mu       sync.Mutex
	sessions map[string]*agentSession
}

type agentSession struct {
	ID       string
	mu       sync.Mutex
	Messages []openAIChatMessage
	Servers  []agentServer
}

type agentChatRequest struct {
	SessionID string        `json:"sessionId,omitempty"`
	Message   string        `json:"message"`
	Servers   []agentServer `json:"servers"`
}

type agentServer struct {
	ID            string           `json:"id"`
	Name          string           `json:"name"`
	Endpoint      string           `json:"endpoint"`
	AuthType      string           `json:"authType,omitempty"`
	BearerToken   string           `json:"bearerToken,omitempty"`
	HeaderName    string           `json:"headerName,omitempty"`
	HeaderValue   string           `json:"headerValue,omitempty"`
	InspectResult *inspectResponse `json:"inspectResult,omitempty"`
}

type openAIChatRequest struct {
	Model       string              `json:"model"`
	Messages    []openAIChatMessage `json:"messages"`
	Tools       []openAITool        `json:"tools,omitempty"`
	ToolChoice  string              `json:"tool_choice,omitempty"`
	Temperature float64             `json:"temperature,omitempty"`
}

type openAIChatMessage struct {
	Role       string           `json:"role"`
	Content    string           `json:"content,omitempty"`
	ToolCalls  []openAIToolCall `json:"tool_calls,omitempty"`
	ToolCallID string           `json:"tool_call_id,omitempty"`
}

type openAITool struct {
	Type     string             `json:"type"`
	Function openAIToolFunction `json:"function"`
}

type openAIToolFunction struct {
	Name        string `json:"name"`
	Description string `json:"description,omitempty"`
	Parameters  any    `json:"parameters"`
}

type openAIToolCall struct {
	ID       string                 `json:"id"`
	Type     string                 `json:"type"`
	Function openAIToolCallFunction `json:"function"`
}

type openAIToolCallFunction struct {
	Name      string `json:"name"`
	Arguments string `json:"arguments"`
}

type openAIChatResponse struct {
	Choices []struct {
		Message openAIChatMessage `json:"message"`
	} `json:"choices"`
}

type agentToolBinding struct {
	OpenAIName string
	Server     agentServer
	Tool       inspectTool
}

func newApplication(config appConfig) *application {
	return &application{
		config: config,
		agent: &agentService{
			config: config,
			client: &http.Client{
				Timeout: 60 * time.Second,
			},
			sessions: make(map[string]*agentSession),
		},
	}
}

func (a *application) handleAgentChat(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, apiError{Error: "method not allowed"})
		return
	}

	if strings.TrimSpace(a.config.OpenAI.APIKey) == "" {
		writeJSON(w, http.StatusServiceUnavailable, apiError{Error: "openai api key is not configured"})
		return
	}

	var request agentChatRequest
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

	if strings.TrimSpace(request.Message) == "" {
		writeJSON(w, http.StatusBadRequest, apiError{Error: "message is required"})
		return
	}

	servers, err := normalizeAgentServers(request.Servers)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, apiError{Error: err.Error()})
		return
	}
	if len(servers) == 0 {
		writeJSON(w, http.StatusBadRequest, apiError{Error: "at least one inspected server is required"})
		return
	}

	session := a.agent.getOrCreateSession(request.SessionID, servers)
	session.mu.Lock()
	session.Servers = servers
	session.mu.Unlock()

	flusher, ok := w.(http.Flusher)
	if !ok {
		writeJSON(w, http.StatusInternalServerError, apiError{Error: "streaming is not supported"})
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")

	emit := newEventEmitter(w, flusher)
	emit("session", map[string]string{"sessionId": session.ID})

	if err := a.agent.runChat(r.Context(), session, strings.TrimSpace(request.Message), emit); err != nil {
		emit("error", map[string]string{"error": err.Error()})
	}
}

func (s *agentService) getOrCreateSession(id string, servers []agentServer) *agentSession {
	s.mu.Lock()
	defer s.mu.Unlock()

	if id != "" {
		if session, ok := s.sessions[id]; ok {
			return session
		}
	}

	session := &agentSession{
		ID:      newSessionID(),
		Servers: servers,
	}
	s.sessions[session.ID] = session
	return session
}

func (s *agentService) runChat(ctx context.Context, session *agentSession, userMessage string, emit eventEmitter) error {
	session.mu.Lock()
	defer session.mu.Unlock()

	bindings, tools := buildOpenAITools(session.Servers)
	if len(tools) == 0 {
		return errors.New("no inspected tools are available across the connected servers")
	}

	messages := make([]openAIChatMessage, 0, len(session.Messages)+4)
	messages = append(messages, openAIChatMessage{
		Role:    "system",
		Content: buildSystemPrompt(session.Servers),
	})
	messages = append(messages, session.Messages...)
	persistFrom := len(messages) - 1
	messages = append(messages, openAIChatMessage{
		Role:    "user",
		Content: userMessage,
	})

	emit("status", map[string]string{"message": "Thinking"})

	for attempt := 0; attempt < 8; attempt++ {
		response, err := s.complete(ctx, messages, tools)
		if err != nil {
			return err
		}
		if len(response.Choices) == 0 {
			return errors.New("openai returned no choices")
		}

		assistantMessage := response.Choices[0].Message
		if len(assistantMessage.ToolCalls) == 0 {
			if strings.TrimSpace(assistantMessage.Content) == "" {
				return errors.New("openai returned an empty assistant message")
			}
			messages = append(messages, assistantMessage)
			session.Messages = append([]openAIChatMessage(nil), messages[persistFrom+1:]...)
			emit("final", map[string]string{"content": assistantMessage.Content})
			return nil
		}

		messages = append(messages, assistantMessage)
		for _, toolCall := range assistantMessage.ToolCalls {
			binding, ok := bindings[toolCall.Function.Name]
			if !ok {
				return fmt.Errorf("unknown tool call %q", toolCall.Function.Name)
			}

			emit("tool_call", map[string]string{
				"server":    binding.Server.Name,
				"tool":      binding.Tool.DisplayName,
				"arguments": toolCall.Function.Arguments,
			})

			result, err := callRemoteTool(ctx, binding.Server, binding.Tool.Name, toolCall.Function.Arguments)
			if err != nil {
				return err
			}

			emit("tool_result", map[string]string{
				"server": binding.Server.Name,
				"tool":   binding.Tool.DisplayName,
				"result": truncateForEvent(result, 1600),
			})

			messages = append(messages, openAIChatMessage{
				Role:       "tool",
				ToolCallID: toolCall.ID,
				Content:    result,
			})
		}
	}

	return errors.New("agent exceeded maximum tool-call rounds")
}

func (s *agentService) complete(ctx context.Context, messages []openAIChatMessage, tools []openAITool) (*openAIChatResponse, error) {
	payload := openAIChatRequest{
		Model:       s.config.OpenAI.Model,
		Messages:    messages,
		Tools:       tools,
		ToolChoice:  "auto",
		Temperature: 0.2,
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}

	request, err := http.NewRequestWithContext(ctx, http.MethodPost, strings.TrimRight(s.config.OpenAI.BaseURL, "/")+"/chat/completions", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}

	request.Header.Set("Authorization", "Bearer "+s.config.OpenAI.APIKey)
	request.Header.Set("Content-Type", "application/json")

	response, err := s.client.Do(request)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()

	if response.StatusCode >= 300 {
		errorBody, _ := io.ReadAll(io.LimitReader(response.Body, 4096))
		return nil, fmt.Errorf("openai request failed: %s", strings.TrimSpace(string(errorBody)))
	}

	var parsed openAIChatResponse
	if err := json.NewDecoder(response.Body).Decode(&parsed); err != nil {
		return nil, err
	}

	return &parsed, nil
}

func buildOpenAITools(servers []agentServer) (map[string]agentToolBinding, []openAITool) {
	bindings := make(map[string]agentToolBinding)
	tools := make([]openAITool, 0)
	usedNames := make(map[string]int)

	for index, server := range servers {
		if server.InspectResult == nil {
			continue
		}

		for _, tool := range server.InspectResult.Tools {
			name := sanitizeToolName(fmt.Sprintf("srv%d_%s", index+1, tool.Name))
			if count := usedNames[name]; count > 0 {
				name = fmt.Sprintf("%s_%d", name, count+1)
			}
			usedNames[name]++

			description := strings.TrimSpace(fmt.Sprintf("%s (Server: %s)", tool.Description, server.Name))
			parameters := tool.InputSchema
			if parameters == nil {
				parameters = map[string]any{"type": "object"}
			}

			binding := agentToolBinding{
				OpenAIName: name,
				Server:     server,
				Tool:       tool,
			}

			bindings[name] = binding
			tools = append(tools, openAITool{
				Type: "function",
				Function: openAIToolFunction{
					Name:        name,
					Description: description,
					Parameters:  parameters,
				},
			})
		}
	}

	sort.Slice(tools, func(i, j int) bool {
		return tools[i].Function.Name < tools[j].Function.Name
	})

	return bindings, tools
}

func buildSystemPrompt(servers []agentServer) string {
	var builder strings.Builder
	builder.WriteString("You are MCP Inspector Agent. You help the user by using MCP tools exposed by the connected servers when useful. Prefer using tools when they can answer the question reliably. Keep answers concise and grounded in tool results.\n\nConnected servers:\n")

	for _, server := range servers {
		builder.WriteString("- ")
		builder.WriteString(server.Name)
		builder.WriteString(" (")
		builder.WriteString(server.Endpoint)
		builder.WriteString(")")
		if server.InspectResult != nil && strings.TrimSpace(server.InspectResult.Instructions) != "" {
			builder.WriteString(": ")
			builder.WriteString(server.InspectResult.Instructions)
		}
		builder.WriteString("\n")
	}

	return builder.String()
}

func callRemoteTool(ctx context.Context, server agentServer, toolName, rawArguments string) (string, error) {
	auth, err := normalizeInspectAuth(&inspectAuth{
		Type:        server.AuthType,
		Token:       server.BearerToken,
		HeaderName:  server.HeaderName,
		HeaderValue: server.HeaderValue,
	})
	if err != nil {
		return "", err
	}

	session, _, err := connectMCP(ctx, server.Endpoint, auth, preferredTransport(server))
	if err != nil {
		return "", err
	}
	defer session.Close()

	var arguments map[string]any
	if strings.TrimSpace(rawArguments) != "" {
		if err := json.Unmarshal([]byte(rawArguments), &arguments); err != nil {
			return "", fmt.Errorf("parse tool arguments: %w", err)
		}
	}

	result, err := session.CallTool(ctx, &mcp.CallToolParams{
		Name:      toolName,
		Arguments: arguments,
	})
	if err != nil {
		return "", err
	}

	return formatToolResult(result), nil
}

func preferredTransport(server agentServer) string {
	if server.InspectResult == nil {
		return ""
	}
	return server.InspectResult.Transport
}

func formatToolResult(result *mcp.CallToolResult) string {
	if result == nil {
		return ""
	}

	var parts []string
	for _, content := range result.Content {
		switch value := content.(type) {
		case *mcp.TextContent:
			parts = append(parts, value.Text)
		default:
			if normalized := normalizeJSONValue(value); normalized != nil {
				data, err := json.Marshal(normalized)
				if err == nil {
					parts = append(parts, string(data))
				}
			}
		}
	}

	if len(parts) == 0 && result.StructuredContent != nil {
		data, err := json.Marshal(result.StructuredContent)
		if err == nil {
			parts = append(parts, string(data))
		}
	}

	if len(parts) == 0 {
		data, err := json.Marshal(result)
		if err == nil {
			parts = append(parts, string(data))
		}
	}

	return strings.Join(parts, "\n")
}

func normalizeAgentServers(servers []agentServer) ([]agentServer, error) {
	normalized := make([]agentServer, 0, len(servers))

	for _, server := range servers {
		endpoint, err := normalizeEndpoint(server.Endpoint)
		if err != nil {
			return nil, err
		}

		auth, err := normalizeInspectAuth(&inspectAuth{
			Type:        server.AuthType,
			Token:       server.BearerToken,
			HeaderName:  server.HeaderName,
			HeaderValue: server.HeaderValue,
		})
		if err != nil {
			return nil, err
		}

		name := strings.TrimSpace(server.Name)
		if name == "" {
			name = inferServerNameFromURL(endpoint)
		}

		copyServer := server
		copyServer.Name = name
		copyServer.Endpoint = endpoint
		copyServer.AuthType = auth.Type
		copyServer.BearerToken = auth.Token
		copyServer.HeaderName = auth.HeaderName
		copyServer.HeaderValue = auth.HeaderValue
		normalized = append(normalized, copyServer)
	}

	return normalized, nil
}

func sanitizeToolName(value string) string {
	value = strings.ToLower(value)
	var builder strings.Builder
	for _, r := range value {
		if ('a' <= r && r <= 'z') || ('0' <= r && r <= '9') || r == '_' {
			builder.WriteRune(r)
			continue
		}
		builder.WriteRune('_')
	}

	result := strings.Trim(builder.String(), "_")
	if result == "" {
		return "mcp_tool"
	}
	if len(result) > 48 {
		return result[:48]
	}
	return result
}

func truncateForEvent(value string, limit int) string {
	if len(value) <= limit {
		return value
	}
	return value[:limit] + "..."
}

func inferServerNameFromURL(raw string) string {
	parsed, err := url.Parse(raw)
	if err != nil || parsed.Hostname() == "" {
		return "MCP server"
	}
	return parsed.Hostname()
}

func newSessionID() string {
	var buffer [16]byte
	if _, err := rand.Read(buffer[:]); err != nil {
		return fmt.Sprintf("session-%d", time.Now().UnixNano())
	}
	return hex.EncodeToString(buffer[:])
}

type eventEmitter func(event string, payload any)

func newEventEmitter(w http.ResponseWriter, flusher http.Flusher) eventEmitter {
	return func(event string, payload any) {
		data, err := json.Marshal(payload)
		if err != nil {
			return
		}

		_, _ = fmt.Fprintf(w, "event: %s\n", event)
		_, _ = fmt.Fprintf(w, "data: %s\n\n", data)
		flusher.Flush()
	}
}
