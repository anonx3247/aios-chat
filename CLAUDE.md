# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**aios-chat-browser** - A cross-platform AI-powered browser and chat interface using Tauri 2.0 (Rust backend + React/TypeScript frontend + Node.js sidecar). Provides a chat-based interface to an AI assistant that can control the computer, search the web, execute code, and render dynamic UIs.

**Operating Modes:**
- **Standalone Mode**: Works on any OS as an AI assistant browser
- **Compositor Mode**: On Linux with aios-compositor, becomes the primary window manager UI

## Development Environment

This project uses Nix for development dependencies. Always run commands inside the Nix shell:

```bash
# Run commands with nix-shell
nix-shell --run "pnpm install"
nix-shell --run "pnpm tauri dev"

# Or enter the shell interactively
nix-shell
```

## Build Commands

```bash
# Install dependencies (run from project root)
nix-shell --run "pnpm install"

# Install node-backend dependencies
nix-shell --run "cd src-tauri/sidecars/node-backend && pnpm install"

# Development - run BOTH of these in separate terminals:
nix-shell --run "pnpm dev:node"   # Terminal 1: Node backend on port 3001
nix-shell --run "pnpm tauri dev"  # Terminal 2: Tauri app

# Or use concurrently (may have output issues):
nix-shell --run "pnpm dev:all"

# Build production binary
nix-shell --run "pnpm tauri build"

# Frontend only (Vite dev server)
nix-shell --run "pnpm dev"

# Type checking
nix-shell --run "pnpm typecheck"

# Linting
nix-shell --run "pnpm lint"

# Run tests
nix-shell --run "pnpm test"

# Rust backend commands
nix-shell --run "cd src-tauri && cargo build"
nix-shell --run "cd src-tauri && cargo clippy"
```

## Architecture

### Three-Layer Design

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend (React/TS)                       │
│  - Chat UI with @assistant-ui/react                         │
│  - Dynamic UI rendering (dynamic-ui-mcp/react)              │
│  - Theme system with CSS variables                           │
│  - Calls Node backend via HTTP (localhost:3001)              │
└────────────────────────┬────────────────────────────────────┘
                         │ HTTP
┌────────────────────────▼────────────────────────────────────┐
│                 Node Backend (Hono server)                   │
│  - AI SDK streaming (Anthropic, OpenAI, etc.)               │
│  - MCP server connections                                    │
│  - dynamic-ui-mcp/tools (requires Node.js fs)               │
│  - Runs on localhost:3001                                    │
└─────────────────────────────────────────────────────────────┘
                         │ IPC (Tauri commands)
┌────────────────────────▼────────────────────────────────────┐
│               Tauri Backend (Rust)                           │
│  - SQLite persistence (threads, messages)                    │
│  - Native OS features (screenshots, file access)             │
│  - Window management                                         │
└─────────────────────────────────────────────────────────────┘
```

**Frontend (React/TypeScript in `src/`):**
- Chat interface with streaming AI responses
- Dynamic UI renderer (renders components from dynamic-ui-mcp)
- Theme system with multiple color schemes
- Zustand stores for state management

**Node Backend (in `src-tauri/sidecars/node-backend/`):**
- AI SDK integration (Anthropic, OpenAI via Vercel AI SDK)
- MCP server connections (dynamic-ui-mcp, perplexity, sandbox, etc.)
- Hono server on localhost:3001
- Will be bundled as Tauri sidecar in production

**Tauri Backend (Rust in `src-tauri/`):**
- SQLite database for chat persistence
- Native capabilities (screenshots, file access)
- Tauri commands exposed to frontend via IPC

### Key Data Flows

**Chat message flow:**
1. User sends message → Frontend
2. Frontend calls Node backend HTTP API (/api/chat)
3. Node backend streams to AI provider with tools
4. If AI uses renderCustom tool → returns component source
5. Frontend receives stream, renders text + dynamic components
6. Frontend saves to Tauri SQLite via IPC

**Dynamic UI rendering:**
1. AI calls `renderCustom` tool with TSX source
2. Node backend returns component source in tool result
3. Frontend receives tool invocation
4. DynamicUIRenderer compiles and renders component
5. Component has access to React, Recharts, Prism, theme

### MCP Integration

The Node backend connects to MCP servers:
- `dynamic-ui-mcp` - Renders dynamic React components in chat
- `@modelcontextprotocol/server-perplexity` - Web search (planned)
- `@anthropic/sandbox` - Code execution (planned)

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

## Configuration

- API keys stored in localStorage (frontend)
- Theme stored in localStorage (frontend)
- Chat history in SQLite (Tauri data dir)

## New Repository Status

This is a new repository. Follow these principles:
- Set up comprehensive linting from the start
- Keep boilerplate minimal
- Never over-engineer - build only what's needed now
