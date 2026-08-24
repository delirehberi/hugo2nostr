# hugo2nostr

[![Tests](https://github.com/delirehberi/hugo2nostr/actions/workflows/test.yml/badge.svg)](https://github.com/delirehberi/hugo2nostr/actions/workflows/test.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22-brightgreen)](https://nodejs.org)

Publish [Hugo](https://gohugo.io) static blog posts to the [Nostr](https://nostr.com) network as NIP-23 (`kind:30023`) long-form articles, sync posts back from relays, and manage deletions — all from a single CLI.

## Features

- 🚀 **Publish to Nostr**: Converts Hugo posts (Markdown + YAML/TOML frontmatter) to NIP-23 articles.
- 🔄 **Bidirectional Sync**: Pull published articles from Nostr relays back into Hugo content.
- 🌐 **Multi-Site**: Manage multiple Hugo publications from a single configuration.
- 🖼️ **Asset Handling**: Auto-uploads hero images to nostr.build via NIP-98 authentication.
- 🧩 **Shortcode Conversion**: Resolves Hugo shortcodes (`youtube`, `figure`, custom) to Markdown/HTML.
- 🗑️ **Lifecycle Management**: Mark posts for deletion or prune all published events.

## Quick Start

### Prerequisites
- Node.js 22+
- A Hugo blog and a Nostr private key (`nsec1...`)

```bash
git clone https://github.com/delirehberi/hugo2nostr.git
cd hugo2nostr
make install

# 1. Interactive setup (configures site paths, relays, and private key)
make init

# 2. Preview or Dry-Run
make preview
make dry-run

# 3. Publish to relays
make publish
```

## Configuration

Config is saved at `~/.config/hugo2nostr/config.yaml` and secrets at `~/.config/hugo2nostr/secrets` (mode `0600`).

```yaml
default_site: myblog
sites:
  myblog:
    posts_dir: ~/blog/content/posts
    blog_url: https://example.com
relays:
  - wss://relay.damus.io
  - wss://nos.lol
  - wss://relay.primal.net
image_host: nostr.build
author_id: you@example.com   # Supports NIP-05 identifier, npub, or hex pubkey
```

> **CI/CD Alternative**: You can also configure via environment variables: `POSTS_DIR`, `RELAY_LIST`, `BLOG_URL`, `NOSTR_PRIVATE_KEY`, and `DRY_RUN=1`.

## Common Commands

| Command | Action |
|---|---|
| `make publish` | Publish posts to configured relays (auto-rebuilds) |
| `make dry-run` | Simulate publishing without broadcasting events |
| `make preview` | Render formatted HTML preview in terminal |
| `make sync` | Sync remote Nostr articles back to Hugo markdown |
| `make delete` | Delete posts marked `delete: true` in frontmatter |
| `make delete-all` | Purge all published articles from relays |
| `make debug-sync` | Troubleshoot relay connectivity & NIP-05 pubkey resolution |

**CLI Flags** (pass via `ARGS="..."` e.g., `make publish ARGS="--site notes -v"`):
`--site <name>`, `--all`, `-v` (verbose), `-q` (quiet), `-y` (yes to prompts), `--delay=<ms>`.

## Frontmatter Reference

`hugo2nostr` recognizes and writes the following frontmatter fields:

```yaml
---
title: My Article Title
slug: my-article-slug          # Nostr 'd' tag identifier
date: 2024-01-15               # Published timestamp
tags: [nostr, bitcoin]        # Converted to Nostr 't' tags
description: Summary text      # Article summary
hero_image: /images/cover.jpg  # Auto-uploaded to nostr.build
nostr_id: nevent1...          # (Auto-written) Nostr event ID
nostr_image: https://...       # (Auto-written) Cached hosted image URL
delete: false                  # Set to true to delete via `make delete`
---
```

## Development

```bash
make test          # Run test suite (Jest)
make test-watch    # Run tests in watch mode
make dev           # Run TypeScript source directly via ts-node
make rebuild       # Clean dist/ and compile TypeScript
```

## Contributing

1. Fork the repo and create a feature branch (`git checkout -b feat/my-feature`).
2. Run tests and ensure clean build (`make test && make rebuild`).
3. Submit a pull request.

## License

[MIT](LICENSE)
