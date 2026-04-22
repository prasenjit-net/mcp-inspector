package main

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
)

func (a *application) handleListServers(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"servers": a.servers.listServerSummaries()})
}

func (a *application) handleCreateServer(w http.ResponseWriter, r *http.Request) {
	var input createServerInput
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()

	if err := decoder.Decode(&input); err != nil {
		writeJSON(w, http.StatusBadRequest, apiError{Error: "invalid JSON request body"})
		return
	}
	if err := decoder.Decode(&struct{}{}); err != io.EOF {
		writeJSON(w, http.StatusBadRequest, apiError{Error: "request body must contain a single JSON object"})
		return
	}

	detail, err := a.servers.createServer(r.Context(), input)
	if err != nil {
		writeServerError(w, err)
		return
	}

	writeJSON(w, http.StatusCreated, detail)
}

func (a *application) handleGetServer(w http.ResponseWriter, r *http.Request) {
	detail, err := a.servers.getServerDetail(r.PathValue("id"))
	if err != nil {
		writeServerError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, detail)
}

func (a *application) handleReinspectServer(w http.ResponseWriter, r *http.Request) {
	detail, err := a.servers.reinspectServer(r.Context(), r.PathValue("id"))
	if err != nil {
		writeServerError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, detail)
}

func (a *application) handleListServerTools(w http.ResponseWriter, r *http.Request) {
	tools, err := a.servers.listServerTools(r.PathValue("id"))
	if err != nil {
		writeServerError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"tools": tools})
}

func (a *application) handleGetServerTool(w http.ResponseWriter, r *http.Request) {
	toolName, err := url.PathUnescape(r.PathValue("toolName"))
	if err != nil {
		writeJSON(w, http.StatusBadRequest, apiError{Error: "invalid tool name"})
		return
	}

	tool, err := a.servers.getServerTool(r.PathValue("id"), toolName)
	if err != nil {
		writeServerError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, tool)
}

func (a *application) handleListServerResources(w http.ResponseWriter, r *http.Request) {
	resources, err := a.servers.listServerResources(r.PathValue("id"))
	if err != nil {
		writeServerError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"resources": resources})
}

func (a *application) handleGetServerResource(w http.ResponseWriter, r *http.Request) {
	resourceID, err := url.PathUnescape(r.PathValue("resourceID"))
	if err != nil {
		writeJSON(w, http.StatusBadRequest, apiError{Error: "invalid resource id"})
		return
	}

	resource, err := a.servers.getServerResource(r.PathValue("id"), resourceID)
	if err != nil {
		writeServerError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, resource)
}

func writeServerError(w http.ResponseWriter, err error) {
	var inputErr inputError
	var notFoundErr notFoundError

	switch {
	case err == nil:
		return
	case errors.As(err, &notFoundErr):
		writeJSON(w, http.StatusNotFound, apiError{Error: notFoundErr.Error()})
	case errors.As(err, &inputErr):
		writeJSON(w, http.StatusBadRequest, apiError{Error: inputErr.Error()})
	case errors.Is(err, context.DeadlineExceeded):
		writeJSON(w, http.StatusGatewayTimeout, apiError{Error: "request timed out"})
	default:
		writeJSON(w, http.StatusInternalServerError, apiError{Error: "internal server error"})
	}
}
