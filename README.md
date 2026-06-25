# LocalCode

A lightweight, fast code editor built with [Tauri v2](https://v2.tauri.app/), React 19, and Rust.

## Features

- **Monaco Editor** — full VS Code editor experience (syntax highlight, autocomplete, multi-cursor)
- **LSP Integration** — intellisense for TypeScript, Rust, Python, Go, YAML, CSS, HTML, JSON
- **AI Assistant** — local LLM chat with tool-using agent (create/edit/read files, run terminal commands)
- **Git Integration** — stage, commit, push, pull, branch management, history
- **GitHub Integration** — authenticate, list repos, create repos, create PRs, clone
- **Terminal** — embedded xterm.js PTY terminal
- **File Explorer** — tree view with create/rename/delete
- **Search** — full-text search with regex and whole-word options
- **Document Outline** — symbol tree via LSP
- **LSP Setup** — one-click install for language servers

## Development

```bash
# Install dependencies
npm install

# Run in development mode
npm run tauri dev

# Build for production
npm run tauri build
```

## Prerequisites

- [Node.js](https://nodejs.org/) >= 18
- [Rust](https://rustup.rs/) >= 1.77
- System dependencies for [Tauri v2](https://v2.tauri.app/start/prerequisites/)

## AI Assistant Setup

1. Download a GGUF model (e.g., from Hugging Face)
2. Click the AI button in the toolbar
3. Set the folder containing `.gguf` files
4. Click "Procurar" to scan, then "Usar" on a model
5. If `llama-server` is missing, click "Baixar llama-server"

## License

MIT
