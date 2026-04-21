SHELL := /bin/bash

.PHONY: build ci clean dev dev-backend dev-ui lint release run test ui-build ui-install

ui-install:
	cd ui && npm ci

ui-build:
	cd ui && npm ci && npm run build

lint:
	cd ui && npm ci && npm run lint

build:
	cd ui && npm ci && npm run build
	GO_PACKAGES=$$(go list ./... | grep -v '/ui/'); go build $$GO_PACKAGES

run:
	cd ui && npm ci && npm run build
	go build -o mcp-inspector .
	./mcp-inspector

test:
	cd ui && npm ci && npm run build
	GO_PACKAGES=$$(go list ./... | grep -v '/ui/'); go test $$GO_PACKAGES

ci:
	cd ui && npm ci
	cd ui && npm run lint
	cd ui && npm run build
	GO_PACKAGES=$$(go list ./... | grep -v '/ui/'); go test $$GO_PACKAGES
	GO_PACKAGES=$$(go list ./... | grep -v '/ui/'); go build $$GO_PACKAGES

dev-backend:
	go run .

dev-ui:
	cd ui && if [ ! -d node_modules ]; then npm ci; fi && npm run dev -- --host

dev:
	trap 'kill 0' EXIT INT TERM; \
	(cd ui && if [ ! -d node_modules ]; then npm ci; fi && npm run dev -- --host) & \
	go run .

release:
	OUT_DIR=$${OUT_DIR:-dist}; \
	VERSION_VALUE=$${VERSION:-dev}; \
	APP_NAME=mcp-inspector; \
	rm -rf "$$OUT_DIR"; \
	mkdir -p "$$OUT_DIR"; \
	cd ui && npm ci && npm run build && cd ..; \
	for platform in "darwin amd64" "darwin arm64" "linux amd64" "linux arm64" "windows amd64"; do \
		read -r GOOS GOARCH <<<"$$platform"; \
		archive_base="$${APP_NAME}_$${VERSION_VALUE#v}_$${GOOS}_$${GOARCH}"; \
		binary_name="$$APP_NAME"; \
		if [ "$$GOOS" = "windows" ]; then binary_name="$$binary_name.exe"; fi; \
		build_dir="$$(mktemp -d)"; \
		GOOS="$$GOOS" GOARCH="$$GOARCH" CGO_ENABLED=0 go build -trimpath -ldflags="-s -w -X main.version=$$VERSION_VALUE" -o "$$build_dir/$$binary_name" .; \
		if [ "$$GOOS" = "windows" ]; then \
			(cd "$$build_dir" && zip -q "$$OLDPWD/$$OUT_DIR/$${archive_base}.zip" "$$binary_name"); \
		else \
			tar -C "$$build_dir" -czf "$$OUT_DIR/$${archive_base}.tar.gz" "$$binary_name"; \
		fi; \
		rm -rf "$$build_dir"; \
	done

clean:
	rm -rf dist ui/dist
