# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**aios-chat-browser** - A cross-platform AI-powered browser and chat interface using Tauri 2.0 (Rust backend + React/TypeScript frontend). Provides a chat-based interface to an AI assistant that can control the computer, search the web, execute code, and render dynamic UIs.

**Operating Modes:**
- **Standalone Mode**: Works on any OS as an AI assistant browser
- **Compositor Mode**: On Linux with aios-compositor, becomes the primary window manager UI

## Development Environment

This project uses Nix for development dependencies. Always run commands inside the Nix shell:

```bash
# Enter the Nix development shell first
nix develop

# All commands below should be run inside the Nix shell
```

## Build Commands

```bash
# Install dependencies
pnpm install

# Development (runs both frontend and backend)
pnpm tauri dev

# Build production binary
pnpm tauri build

# Frontend only (Vite dev server)
pnpm dev

# Type checking
pnpm typecheck

# Linting
pnpm lint

# Run tests
pnpm test

# Run single test file
pnpm test -- path/to/test.ts

# Rust backend commands (from src-tauri/)
cargo build
cargo test
cargo clippy
cargo fmt --check
```

## Architecture

### Two-Layer Design

**Frontend (React/TypeScript in `src/`):**
- Chat interface with streaming AI responses
- Vertical tab bar (web pages, chat sessions, apps in compositor mode)
- WebView manager for browser functionality
- Dynamic UI renderer (renders components from dynamic-ui-mcp)
- Zustand stores for state management

**Backend (Rust/Tauri in `src-tauri/`):**
- MCP client manager - discovers and connects to MCP servers
- AI provider integration - Anthropic API with SSE streaming
- Screenshot capture - platform-specific, sent as context to AI
- Tab and window state management
- Tauri commands exposed to frontend via IPC

### MCP (Model Context Protocol) Integration

The app connects to multiple MCP servers:
- `dynamic-ui-mcp` - Renders dynamic React components in chat
- `@modelcontextprotocol/server-perplexity` - Web search
- `@anthropic/sandbox` - Code execution in isolated containers
- System-specific servers: `aios-shell-exec`, `aios-nix-manager`, `aios-window-mgmt`

MCP servers are configured in `~/.config/aios-chat-browser/mcp-servers.toml`.

### Key Data Flows

**Chat message flow:**
1. User sends message → Tauri command `send_chat_message`
2. Backend captures screenshot of active tab
3. Backend builds context (messages + screenshot as base64)
4. Streams request to Anthropic API with available MCP tools
5. Response chunks streamed to frontend via Tauri events
6. If AI calls tool → backend invokes MCP server → result fed back to AI

**Dynamic UI rendering:**
1. AI calls `dynamic-ui-mcp` tool with component spec
2. MCP server returns instance_id
3. Backend emits event to frontend
4. Frontend dynamically imports React component from `dynamic-ui-mcp` package

### Tab Types

```rust
enum TabType {
    Web { url: String, webview_id: String },
    Chat { session_id: String },
    App { app_name: String, window_id: Option<String> }, // compositor mode only
}
```

## TypeScript Conventions

- **Never use `any`** - always provide proper types
- **Use `??` (nullish coalescing)** over `||`
- **Use `@app/*` alias** for imports from `src/`
- **Zustand** for state management
- **Tailwind CSS** for styling

## Rust Conventions

- Use `anyhow::Result` for error handling in commands
- Use `thiserror` for custom error types
- Async with `tokio` runtime
- MCP transports: stdio for local servers, HTTP/WebSocket for remote

## Configuration Files

- `~/.config/aios-chat-browser/mcp-servers.toml` - MCP server configuration
- `~/.config/aios-chat-browser/settings.toml` - App settings (theme, AI model, etc.)
- API keys read from environment variables (e.g., `ANTHROPIC_API_KEY`, `PERPLEXITY_API_KEY`)

## New Repository Status

This is a new repository. Follow these principles:
- Set up comprehensive linting from the start
- Keep boilerplate minimal
- Never over-engineer - build only what's needed now
- Use TDD workflow: write tests before implementation
