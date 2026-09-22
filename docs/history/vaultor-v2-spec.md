# 🧠 VAULTOR — Version 2 Specification

---

# 🎯 Overview

Vaultor is a **local-first, Dockerized knowledge system** that enables users to:

* Create and edit notes using a block-based editor
* Store and manage files as first-class resources
* Link everything together using inline references
* Organize content using tags
* Navigate instantly via a command palette

---

# 🧠 Core Philosophy

> “Everything is a resource. Everything can be connected. Everything should be easy to find.”

Vaultor is NOT:

* a folder-based file explorer
* a markdown-only editor

Vaultor IS:

* a **resource graph with a clean UX layer**

---

# 🧱 Core Architecture

## 1. Resource Model

All entities are stored as:

```text
Resource {
  id
  type: "note" | "file"
  title
  content (JSON for notes)
  file_path (for files)
  metadata
  createdAt
  updatedAt
  lastOpenedAt
}
```

---

## 2. Relationships (Graph Layer)

```text
relationships (
  from_id,
  to_id,
  type = "link"
)
```

Used for:

* inline linking (`[[...]]`)
* backlinks

---

## 3. Tags System

```text
tags
resource_tags
```

* Many-to-many
* Applies to ALL resources (notes + files)
* Used for filtering, NOT relationships

---

## 4. Storage

```text
/data
├── app.db
├── files/
```

* SQLite database
* Files stored on disk
* Docker volume persistence

---

# 📝 Editor System

## Block-Based Editor (Tiptap)

* WYSIWYG-like experience
* No edit/preview split
* Structured JSON storage

---

## Supported Blocks

* Paragraph
* Headings (H1, H2, H3)
* Bullet list
* Numbered list
* Code block
* Quote

---

## Editor Intelligence

### Slash Menu (`/`)

* Insert blocks
* Trigger actions

---

### Inline Linking (`[[...]]`)

* Search resources
* Create new resource inline
* Insert structured link node

---

## Internal Link Representation

```json
{
  "type": "resourceLink",
  "attrs": {
    "resourceId": "uuid",
    "label": "title"
  }
}
```

---

# 🔗 Linking System

## Features

* Link notes ↔ notes
* Link notes ↔ files
* Inline embedding inside text

---

## Backlinks

* Automatically generated from relationships table
* Displayed in resource view

---

# 📎 File System

## Files as First-Class Resources

* Upload independent of notes
* Can be tagged
* Can be linked anywhere

---

## File Preview (Level 3)

Supported:

| Type     | Behavior             |
| -------- | -------------------- |
| PDF      | iframe               |
| Images   | inline               |
| Markdown | rendered             |
| CSV      | table (limited rows) |
| Code     | syntax highlighted   |
| Text     | `<pre>`              |

Fallback:

* open in new tab

---

# 🧭 Navigation System

## Unified Top Bar

```text
[ ☰ ] [ ← ] [ → ]   Resource Title   [ Actions ]   [ Help ]
```

---

## Features

* Back / Forward navigation
* Resource title display
* Context actions (file vs note)
* Sidebar toggle

---

## Navigation History

* Browser-like stack
* Managed via Redux
* Supports back/forward shortcuts

---

# 📂 Sidebar

## Role

* Filtering, NOT navigation

---

## Features

* Resource type filter (All / Notes / Files)
* Tag filtering (multi-select)
* Collapsible sidebar
* Persistent state

---

# ⚡ Command Palette (Core Interaction)

## Trigger

* `Cmd/Ctrl + K`

---

## Capabilities

### Navigation

* Open notes/files

### Creation

* Create note
* Upload file

### Actions

* Delete resource
* Toggle sidebar
* Open shortcuts

---

## Behavior

* Fuzzy search
* Keyboard navigation
* Instant execution

---

# 🏷 Tag System

## UX

* Chip-based (not hashtags)
* Multi-select filters
* Searchable tag list

---

## Features

* Add/remove tags
* Global tag deletion
* Tag-based filtering

---

# 🔐 Security

## Master Password

* Set on first run
* Required for:

  * unlocking app
  * export
  * import

---

## Encryption

* Export is encrypted (AES-GCM)
* Key derived from password

---

## Limitations

* No recovery (v2)
* No encryption at rest (yet)

---

# 📤 Export / Import

## Export

* Full workspace → encrypted file
* Includes:

  * DB
  * files

---

## Import

* Requires password
* Restores full state

---

# 🧠 State Management

## Redux (Minimal)

```text
{
  currentResourceId,
  navigation,
  filters
}
```

---

## Rules

* Editor state NOT in Redux
* Backend is source of truth

---

# ⌨️ Keyboard Shortcuts

## Core

| Action          | Mac   | Win/Linux |
| --------------- | ----- | --------- |
| Command palette | Cmd+K | Ctrl+K    |
| Back            | Cmd+[ | Alt+←     |
| Forward         | Cmd+] | Alt+→     |
| Toggle sidebar  | Cmd+B | Ctrl+B    |
| Shortcuts help  | Cmd+/ | Ctrl+/    |

---

## Principles

* OS-aware
* No browser conflicts
* Minimal set

---

# 🧩 UI System

## Modal System

* Replaces alert/confirm
* Used for:

  * delete confirmation
  * replace links
  * search
  * shortcuts

---

## Design Principles

* Minimal
* Consistent
* Keyboard-first

---

# ⚠️ Constraints

* No attachments system
* No folder hierarchy (yet)
* No cloud sync
* No collaboration

---

# 🧪 Definition of Done (v2)

Vaultor v2 is complete when:

* Resource model is unified
* Inline linking works flawlessly
* Command palette handles navigation + actions
* Sidebar is collapsible and filter-only
* File preview works for common types
* Back/forward navigation works like browser
* No duplicate UI elements exist
* No browser prompts remain
* Keyboard shortcuts are OS-aware

---

# 🔮 Future (v3+)

* Full-text search
* Graph visualization
* Encryption at rest
* Passkey-based recovery
* Multi-device sync
* Inline rich formatting (bold, italic)

---

# 🧠 Final Philosophy

> “Vaultor is a thinking tool—not just a storage tool.”

---

**Vaultor v2 — Complete**
