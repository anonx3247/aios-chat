# AIOS Chat

AI-powered chat interface and browser built with Tauri 2.0. Features streaming AI responses, dynamic UI rendering, and multi-provider support.

## Features

- **Streaming AI Chat** - Real-time responses from Claude, GPT-4, and other models
- **Dynamic UI Components** - AI can render interactive React components in responses
- **Multiple Themes** - 7 color schemes including Warm Stone, Midnight Blue, Forest Green
- **Chat Persistence** - SQLite storage for conversation history
- **Cross-Platform** - macOS, Windows, Linux support via Tauri

## Architecture

```
Frontend (React/TypeScript)
    ↓ HTTP
Node Backend (Hono + AI SDK)
    ↓ IPC
Tauri Backend (Rust + SQLite)
```

- **Frontend**: Chat UI with `@assistant-ui/react`, dynamic UI rendering with `dynamic-ui-mcp/react`
- **Node Backend**: AI SDK streaming, MCP server connections
- **Tauri Backend**: SQLite persistence, native OS features

## Prerequisites

- [Nix](https://nixos.org/download.html) (for development environment)
- [pnpm](https://pnpm.io/) (installed via Nix)

## Development

```bash
# Install dependencies
nix-shell --run "pnpm install"
nix-shell --run "cd src-tauri/sidecars/node-backend && pnpm install"

# Run development servers (two terminals):
nix-shell --run "pnpm dev:node"   # Terminal 1: Node backend (port 3001)
nix-shell --run "pnpm tauri dev"  # Terminal 2: Tauri app

# Or run both with concurrently:
nix-shell --run "pnpm dev:all"
```

## Configuration

Set your API key in the app settings (gear icon). Currently supports:
- Anthropic (Claude models)

API keys are stored in browser localStorage.

## Project Structure

```
src/                          # React frontend
├── components/
│   ├── chat/                 # Chat UI components
│   └── layout/               # Sidebar, settings
├── hooks/                    # React hooks
└── lib/                      # API client, utilities

src-tauri/
├── src/                      # Rust backend
│   ├── db/                   # SQLite persistence
│   └── commands/             # Tauri IPC commands
└── sidecars/
    └── node-backend/         # Node.js AI backend
        └── src/              # Hono server

```

## Tech Stack

- **Frontend**: React 19, TypeScript, Tailwind CSS, assistant-ui
- **Node Backend**: Hono, Vercel AI SDK, dynamic-ui-mcp
- **Rust Backend**: Tauri 2.0, SQLite, tokio
- **Build**: Vite, esbuild

## License

MIT
