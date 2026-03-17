# hugo2nostr

[![Tests](https://github.com/delirehberi/hugo2nostr/actions/workflows/test.yml/badge.svg)](https://github.com/delirehberi/hugo2nostr/actions/workflows/test.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22-brightgreen)](https://nodejs.org)

A CLI tool that bridges [Hugo](https://gohugo.io) static sites and the [Nostr](https://nostr.com) network. Publish your blog posts as `kind:30023` long-form articles, sync posts back from relays, and manage deletions — all from one command.

## Table of Contents

- [Features](#features)
- [Requirements](#requirements)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [Commands](#commands)
- [Frontmatter Reference](#frontmatter-reference)
- [Image Handling](#image-handling)
- [Shortcode Processing](#shortcode-processing)
- [NIP Compliance](#nip-compliance)
- [Development](#development)
- [Contributing](#contributing)
- [License](#license)

## Features

- **Publish** Hugo posts to Nostr as NIP-23 long-form articles
- **Bidirectional sync** — pull posts from Nostr back into Hugo
- **Multi-site** — manage multiple Hugo sites from a single config
- **Image uploads** — auto-upload hero images to nostr.build via NIP-98 auth
- **Shortcode processing** — convert Hugo shortcodes to Markdown/HTML
- **Deletion management** — delete individual posts or all published articles
- **Multiple relays** — publish to many relays with automatic retry
- **YAML & TOML frontmatter** — both formats supported
- **NIP-05 author resolution** — `author_id` accepts `name@domain.com` identifiers

## Requirements

- Node.js 22+
- A Hugo site with Markdown posts
- A Nostr private key (`nsec1…`)
- `make` (optional but recommended)

## Installation

```bash
git clone https://github.com/delirehberi/hugo2nostr.git
cd hugo2nostr
make install
make build
```

Or without Make:

```bash
npm install
npm run build
```

## Quick Start

```bash
# 1. Run the interactive setup wizard
make init

# 2. Preview a post as HTML before publishing
make preview

# 3. Dry run — see what would be published without sending anything
make dry-run

# 4. Publish
make publish

# 5. Sync posts from Nostr back to Hugo
make sync
```

## Configuration

hugo2nostr stores its config at `~/.config/hugo2nostr/config.yaml` and your private key at `~/.config/hugo2nostr/secrets` (mode 600).

```yaml
default_site: myblog

sites:
  myblog:
    posts_dir: ~/blog/content/posts
    blog_url: https://example.com
  notes:
    posts_dir: ~/notes/content/posts
    blog_url: https://notes.example.com

relays:
  - wss://relay.damus.io
  - wss://nos.lol
  - wss://relay.primal.net

image_host: nostr.build

# accepts hex pubkey, npub, or NIP-05 identifier
author_id: you@example.com
```

### Private Key

```bash
# Store your key securely (interactive prompt)
make init

# Or write it directly — file permissions are set to 600 automatically
echo "nsec1..." > ~/.config/hugo2nostr/secrets
chmod 600 ~/.config/hugo2nostr/secrets
```

### Environment Variables

For CI/CD or one-off runs you can use environment variables instead of the config file:

```bash
POSTS_DIR="/path/to/posts"
RELAY_LIST="wss://relay1.example,wss://relay2.example"
BLOG_URL="https://example.com"
NOSTR_PRIVATE_KEY="nsec1..."
DRY_RUN=1   # preview without publishing
```

## Commands

> **Note:** All `make` targets that run the CLI will automatically rebuild from source if any `.ts` file has changed since the last build. You never need to manually run `make build` before a command.

### Make targets (recommended)

| Target | Description |
|--------|-------------|
| `make build` | Compile TypeScript — skipped if sources are unchanged |
| `make rebuild` | Force clean rebuild from scratch |
| `make sync` | Sync posts from Nostr → Hugo |
| `make publish` | Publish Hugo posts → Nostr |
| `make dry-run` | Preview publish without sending any events |
| `make preview` | Preview a post as styled HTML |
| `make delete` | Delete posts marked `delete: true` in frontmatter |
| `make delete-all` | Delete all published posts |
| `make debug` | Fetch and display existing articles from relays |
| `make debug-sync` | Run the sync diagnostics script |
| `make init` | Interactive setup wizard |
| `make config` | Show current configuration |
| `make add-site` | Add a new site to config |
| `make test` | Run test suite |
| `make test-watch` | Run tests in watch mode |
| `make test-coverage` | Run tests with coverage report |
| `make dev` | Run from TypeScript source via ts-node (no build) |
| `make clean` | Remove `dist/` |
| `make install` | `npm install` |
| `make help` | Print all targets with descriptions |

### CLI options

All commands accept these flags:

```
--site <name>     Select a specific configured site
--all             Operate on all configured sites
-v, --verbose     Show detailed output
-q, --quiet       Only show errors and summary
-y, --yes         Skip confirmation prompts
--delay=<ms>      Delay between publishes (default: 3000ms)
```

### Multi-site example

```bash
make publish               # publishes default_site
make publish ARGS="--site notes"
make publish ARGS="--all"
```

## Frontmatter Reference

hugo2nostr reads and writes these frontmatter fields:

```yaml
---
title: My Article
slug: my-article
date: 2024-01-15
tags: [bitcoin, nostr]
topics: [technology]          # merged with tags on publish
description: Article summary
hero_image: /images/hero.jpg  # uploaded to nostr.build automatically
nostr_id: nevent1...          # written after a successful publish
nostr_image: https://...      # cached uploaded image URL
delete: true                  # mark for deletion via `make delete`
---
```

| Field | Direction | Description |
|-------|-----------|-------------|
| `title` | read/write | Article title |
| `slug` | read/write | URL slug (defaults to filename) |
| `date` | read/write | Publication date |
| `tags`, `topics` | read | Merged into Nostr `t` tags |
| `description`, `summary` | read/write | Article summary |
| `hero_image`, `image` | read | Hero image — auto-uploaded on first publish |
| `nostr_id` | write | `nevent` ID added after publish |
| `nostr_image` | write | Cached nostr.build URL |
| `delete` | read | Set `true` to delete on next `make delete` |

## Image Handling

1. On first publish, local/relative `hero_image` paths are uploaded to nostr.build using NIP-98 auth.
2. The returned URL is cached in `nostr_image` frontmatter.
3. Subsequent publishes use the cached URL — no re-upload.

## Shortcode Processing

Hugo shortcodes are converted before publishing:

| Shortcode | Output |
|-----------|--------|
| `{{< youtube id >}}` | YouTube embed link |
| `{{< figure src="…" >}}` | Markdown image |
| Custom shortcodes | Prompted interactively; saved to `~/.config/hugo2nostr/shortcodes.json` |

## NIP Compliance

Published events conform to [NIP-23](https://github.com/nostr-protocol/nips/blob/master/23.md) (long-form content):

| Tag | Value |
|-----|-------|
| `kind` | `30023` |
| `d` | slug / identifier |
| `title` | article title |
| `summary` | description |
| `published_at` | original publication unix timestamp |
| `t` | topics / hashtags |
| `image` | hero image URL |
| `r` | canonical blog URL |

## Development

### Building

```bash
make build        # incremental — only recompiles changed files
make rebuild      # clean + full recompile
```

### Running from source

```bash
make dev          # runs via ts-node, no build step needed
```

### Tests

```bash
make test
make test-watch
make test-coverage
```

The test suite covers:

- Core configuration management
- Frontmatter parsing (YAML and TOML)
- Markdown processing and shortcode conversion
- Nostr event creation and signing
- Media upload functionality

### Diagnostics

If sync returns no events, run the diagnostics script:

```bash
make debug-sync
```

It checks each layer of the fetch chain independently: config, pubkey resolution (including NIP-05), relay connectivity, and filter correctness.

### Project Structure

```
hugo2nostr/
├── src/
│   ├── commands/       CLI commands (publish, sync, delete, …)
│   ├── core/           Configuration management
│   ├── lib/            Shared libraries (nostr, fs, media, markdown)
│   ├── __tests__/      Test files mirroring src/ structure
│   └── index.ts        Entry point and command router
├── dist/               Compiled JavaScript (generated — do not edit)
├── Makefile            Build and run targets
└── jest.config.cjs     Test configuration
```

## Contributing

Contributions are welcome. Please:

1. Fork the repository and create a feature branch (`git checkout -b feat/my-feature`)
2. Make your changes with tests where applicable (`make test`)
3. Ensure the build is clean (`make rebuild`)
4. Open a pull request with a clear description of the change

For bug reports, please include the output of `make debug-sync` if the issue is relay/sync related.

## License

[MIT](LICENSE)
