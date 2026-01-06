# Sandcastle Desktop Application - Implementation Plan

## Overview

This document outlines the complete implementation plan for a Tauri desktop application that provides a visual interface for managing Sandcastle projects and worktrees. The application replaces CLI interactions with a modern, user-friendly UI.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Tauri Desktop App                            │
├─────────────────────────────────────────────────────────────────┤
│  Frontend (React + Vite)              │  Backend (Bun Sidecar)  │
│  ├── TailwindCSS v4                   │  ├── HTTP API Server    │
│  ├── ShadcnUI Components              │  ├── ProjectService     │
│  ├── Zustand (State)                  │  ├── WorktreeService    │
│  ├── TanStack Query (Data)            │  └── SQLite Database    │
│  └── TanStack Router                  │                         │
└─────────────────────────────────────────────────────────────────┘
```

### Why a Bun Sidecar?

The existing `@sandcastle/worktree` and CLI packages use:
- `Bun.$` for git shell commands
- `bun:sqlite` for database operations
- Node.js `fs` APIs for file operations

These cannot run directly in a browser/WebView context. The solution is a Bun HTTP server that:
1. Runs as a sidecar process spawned by Tauri
2. Exposes REST API endpoints
3. Uses the existing packages internally

---

## Phase 1: Dependencies Installation

### Frontend Dependencies (apps/desktop)

```bash
# Core UI
bun add tailwindcss@next @tailwindcss/vite
bun add zustand
bun add @tanstack/react-query @tanstack/react-router

# ShadcnUI (requires manual setup)
bun add class-variance-authority clsx tailwind-merge
bun add lucide-react
bun add @radix-ui/react-dialog @radix-ui/react-slot @radix-ui/react-dropdown-menu
bun add @radix-ui/react-alert-dialog @radix-ui/react-tooltip
```

### Backend Dependencies (apps/desktop/src-backend)

```bash
# Will use workspace packages
@sandcastle/worktree
@sandcastle/petname
effect
```

---

## Phase 2: Backend API Server

### Directory Structure

```
apps/desktop/
├── src-backend/
│   ├── index.ts          # Bun.serve() entry point
│   ├── routes/
│   │   ├── projects.ts   # Project CRUD endpoints
│   │   └── worktrees.ts  # Worktree CRUD endpoints
│   └── services/
│       └── project.ts    # Copied/adapted from CLI
```

### API Endpoints

#### Projects
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/projects` | List all projects |
| POST | `/api/projects` | Add a new project |
| DELETE | `/api/projects/:name` | Remove a project |

#### Worktrees
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/projects/:name/worktrees` | List worktrees for project |
| POST | `/api/projects/:name/worktrees` | Create a worktree |
| DELETE | `/api/projects/:name/worktrees/:worktreeName` | Remove a worktree |
| POST | `/api/projects/:name/worktrees/:worktreeName/open` | Open in Cursor |

---

## Phase 3: Frontend Structure

### Directory Structure

```
apps/desktop/src/
├── main.tsx
├── App.tsx
├── index.css                    # TailwindCSS entry
├── lib/
│   └── utils.ts                 # cn() helper
├── components/
│   └── ui/                      # ShadcnUI components
│       ├── button.tsx
│       ├── card.tsx
│       ├── dialog.tsx
│       ├── input.tsx
│       ├── alert-dialog.tsx
│       └── ...
├── stores/
│   ├── projects.ts              # Zustand project store
│   └── ui.ts                    # UI state (modals, etc.)
├── hooks/
│   └── api.ts                   # TanStack Query hooks
├── pages/
│   ├── ProjectsPage.tsx         # Project list & CRUD
│   └── WorktreesPage.tsx        # Worktree list & CRUD
└── routes.tsx                   # TanStack Router config
```

---

## Phase 4: UI Components & Pages

### Projects Page Features
- [ ] List all registered projects (name, path, created date)
- [ ] "Add Project" button → Dialog with path input (folder picker)
- [ ] Delete project button with confirmation dialog
- [ ] Click project to navigate to worktrees page

### Worktrees Page Features
- [ ] List all worktrees for selected project
- [ ] Display: branch name, path, commit hash, isMain indicator
- [ ] "Create Worktree" button → Dialog with optional name input
- [ ] Delete worktree button with confirmation (force option)
- [ ] "Open in Cursor" button for each worktree
- [ ] Copy path to clipboard button
- [ ] Back button to projects list

---

## Phase 5: Tauri Sidecar Configuration

### Tauri Configuration Updates

1. Add shell command capabilities
2. Configure sidecar for Bun backend
3. Add file dialog capabilities for folder picker

### tauri.conf.json additions

```json
{
  "plugins": {
    "shell": {
      "open": true,
      "sidecar": true,
      "scope": [
        {
          "name": "bun-backend",
          "cmd": "bun",
          "args": ["run", "../src-backend/index.ts"]
        }
      ]
    }
  }
}
```

---

## Implementation Order

1. **Install all dependencies** (frontend)
2. **Create backend API server** with Bun.serve()
3. **Set up TailwindCSS v4** configuration
4. **Create ShadcnUI components** (button, card, dialog, input, alert-dialog)
5. **Create Zustand stores** (projects, ui)
6. **Set up TanStack Query** (API hooks)
7. **Build Projects page** (list, add, delete)
8. **Build Worktrees page** (list, create, delete, open)
9. **Configure Tauri sidecar** for backend
10. **End-to-end testing**

---

## Verification Checklist

### Backend API
- [x] `GET /api/projects` returns project list
- [x] `POST /api/projects` creates new project
- [x] `DELETE /api/projects/:name` removes project
- [x] `GET /api/projects/:name/worktrees` returns worktrees
- [x] `POST /api/projects/:name/worktrees` creates worktree
- [x] `DELETE /api/projects/:name/worktrees/:name` removes worktree
- [x] `POST /api/projects/:name/worktrees/:name/open` opens in Cursor

### Frontend UI
- [x] Projects page loads and displays projects
- [x] Add project dialog works with path input
- [x] Delete project confirmation works
- [x] Navigate from project to worktrees page
- [x] Worktrees page lists all worktrees
- [x] Create worktree dialog works
- [x] Delete worktree with force option works
- [x] Open in Cursor button executes correctly
- [x] Worktree path is displayed and copyable

### Integration
- [x] Backend and frontend run together via `bun run dev:all`
- [x] Frontend communicates with backend API
- [x] All CRUD operations implemented end-to-end
- [x] TypeScript compiles without errors
- [x] Frontend builds successfully

---

## Running the Application

### Development Mode

Start both the backend and frontend simultaneously:

```bash
cd apps/desktop
bun run dev:all
```

This will:
- Start the backend API server on http://localhost:31415
- Start the Vite dev server on http://localhost:1420

### Running with Tauri

To run the full Tauri desktop application:

```bash
cd apps/desktop
bun run tauri:dev
```

### Available Scripts

| Script | Description |
|--------|-------------|
| `bun run dev` | Start Vite dev server only |
| `bun run dev:backend` | Start backend API server only |
| `bun run dev:all` | Start both frontend and backend |
| `bun run tauri:dev` | Start Tauri app with backend |
| `bun run build` | Build frontend for production |

---

## Technology Choices

| Category | Technology | Rationale |
|----------|------------|-----------|
| Build Tool | Vite | Already configured, fast HMR |
| CSS | TailwindCSS v4 | Latest version, CSS-first config |
| Components | ShadcnUI + Radix | Modern, accessible, customizable |
| State | Zustand | Simple, minimal boilerplate |
| Data Fetching | TanStack Query | Caching, refetching, mutations |
| Routing | TanStack Router | Type-safe, modern |
| Backend Runtime | Bun | Fast, existing package compatibility |
| Desktop | Tauri | Lightweight, Rust-based |

---

## Notes

- The backend server runs on `http://localhost:31415` (arbitrary port)
- Projects are stored in `~/sandcastle/sandcastle.db` (SQLite)
- Worktrees are created at `~/sandcastle/worktrees/{project}/{name}`
- The "Open in Cursor" feature uses shell command execution
