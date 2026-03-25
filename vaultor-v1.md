# 🧠 VAULTOR — Version 1 (Delivered)

## 🎯 Overview

Vaultor v1 is a **local-first, Dockerized personal knowledge vault** that enables users to:

* Write notes using a **Notion-style block editor**
* Store and manage files locally
* Export and import their entire workspace securely
* Maintain full ownership of their data without relying on any cloud service

---

# ✅ Delivered Features

## 📝 Block-Based Note Editor

### Core

* Create, update, delete notes
* Notes consist of:

  * Title
  * Block-based content (JSON)

### Editor Experience

* Single unified editing interface (no preview mode)
* Real-time rendering (WYSIWYG-like)
* Smooth typing and navigation between blocks

### Supported Blocks

* Paragraph
* Heading (H1, H2, H3)
* Bullet list
* Numbered list
* Code block
* Quote

---

## ⚡ Editor Intelligence

### Slash Command Menu (`/`)

* Opens command menu
* Supports filtering via typing
* Keyboard navigation (↑ ↓ Enter)
* Inserts selected block type

---

### Markdown Shortcuts (Typing)

Auto-conversion during typing:

* `# ` → Heading 1
* `## ` → Heading 2
* `- ` or `* ` → Bullet list
* `1. ` → Numbered list
* `> ` → Quote
* ```→ Code block
  ```

---

### Markdown Paste Handling

* Detects pasted markdown
* Converts into structured block format
* Replaces current content seamlessly

---

## 📎 File Management

* Upload files (PDF, CSV, XLSX, etc.)
* Files stored on disk (`/data/files`)
* Attach files to notes
* Detach files from notes
* Download files

---

## 📤 Encrypted Export

* Full workspace export supported
* Requires master password
* Output is an **encrypted binary file**

### Includes:

* SQLite database (`app.db`)
* All uploaded files

---

## 📥 Encrypted Import

* Import encrypted export file
* Requires master password
* Replaces existing workspace completely

---

## 🔐 Security (Master Password)

* Master password set during initial setup
* Required for:

  * Unlocking application
  * Export operations
  * Import operations

### Security Properties

* Password stored as secure hash
* Encryption uses derived key (PBKDF2/Argon2 + AES-GCM)
* No recovery mechanism in v1
* Incorrect password results in hard failure

---

## 🐳 Dockerized Deployment

* Fully containerized application
* Single backend container
* SQLite database stored in mounted volume

---

## 🧱 Data Model (Implemented)

### Notes

* Stored as:

  * `id`
  * `title`
  * `content` (JSON block structure)
  * timestamps

---

### Files

* Metadata stored in database
* Binary stored on disk

---

### Relationships

* Many-to-many:

  * Notes ↔ Files

---

## 📁 Storage Layout

```id="lz2p9z"
/data
├── app.db
├── files/
│   ├── <stored files>
```

---

## 🌐 API Surface (Implemented)

### Notes

* Create note
* Fetch all notes (lightweight)
* Fetch single note (full content)
* Update note
* Delete note

---

### Files

* Upload file
* Download file
* Delete file

---

### Note ↔ File

* Attach file to note
* Remove file from note

---

### Export / Import

* Export workspace (encrypted)
* Import workspace (encrypted)

---

# ⚠️ Known Limitations (v1)

* No search functionality
* No tags or folder hierarchy
* No multi-device sync
* No collaboration
* No password recovery
* No encryption at rest (only export-level encryption)

---

# 🏁 Status

Vaultor v1 is:

* Fully functional
* Locally deployable via Docker
* Secure for personal use
* Feature-complete as per initial scope

---

# 🔮 Next Direction (v2 Candidates)

* Passkey-based recovery (WebAuthn)
* Full-text search
* Tagging / organization system
* Block drag-and-drop
* Inline formatting (bold, italic)
* Encryption at rest

---

# 🧠 Final Philosophy

> “Vaultor gives you a private, portable, and powerful space to think—without friction, without lock-in.”

---

**Vaultor v1 — Completed**
