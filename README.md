# hugo2nostr

[![Tests](https://github.com/delirehberi/hugo2nostr/actions/workflows/test.yml/badge.svg)](https://github.com/delirehberi/hugo2nostr/actions/workflows/test.yml)

Publish Hugo blog posts to Nostr as `kind:30023` (long-form article) events.

## Features

- **Multi-site support** - manage multiple Hugo sites from one config
- **Image uploads** - auto-upload images to nostr.build with NIP-98 auth
- **Shortcode processing** - convert Hugo shortcodes to markdown/HTML
- **Preview command** - preview articles as styled HTML before publishing
- **Bidirectional sync** - publish to Nostr or sync from Nostr to Hugo
- **Deletion management** - delete individual posts or all published articles
- **Multiple relays** - publish to multiple relays with automatic retry
- **Frontmatter formats** - supports YAML (`---`) and TOML (`+++`)

## Installation

```bash
git clone https://github.com/delirehberi/hugo2nostr.git
cd hugo2nostr
npm install
npm run build  # Compile TypeScript to JavaScript
```

## Quick Start

```bash
# Set up configuration (interactive)
npm run init

# Preview a post before publishing
npm run preview my-post.md

# Publish posts (dry run first)
npm run dry-run -- -v

# Publish for real
npm run publish
```

## Configuration

hugo2nostr uses a YAML config file at `~/.config/hugo2nostr/config.yaml`:

```yaml
default_site: essays

sites:
  essays:
    posts_dir: ~/blog/content/essays
    blog_url: https://example.com
  notes:
    posts_dir: ~/notes/content/posts
    blog_url: https://notes.example.com

relays:
  - wss://relay.damus.io
  - wss://nos.lol

image_host: nostr.build
author_id: you@example.com
```

Your private key is stored separately in `~/.config/hugo2nostr/secrets` with 600 permissions.

### Environment Variables

For backwards compatibility or CI/CD, you can also use environment variables:

```bash
POSTS_DIR="/path/to/posts"
RELAY_LIST="wss://relay1.example,wss://relay2.example"
BLOG_URL="https://example.com"
NOSTR_PRIVATE_KEY="nsec1..."
DRY_RUN=1  # optional: preview without publishing
```

## Commands

```bash
# Using npm scripts (recommended)
npm run <command>

# Or use the compiled distribution directly
node dist/index.js <command> [options]
```

### Available Commands

| Command | Description |
|---------|-------------|
| `npm run publish` | Publish posts to Nostr |
| `npm run preview` | Preview a post as HTML (opens in browser) |
| `npm run delete` | Delete posts marked with delete: true |
| `npm run delete-all` | Delete all published posts |
| `npm run sync` | Sync posts from Nostr to Hugo |
| `npm run debug` | Fetch and display existing articles |
| `npm run init` | Set up configuration |
| `npm run config` | Show current configuration |
| `npm run add-site` | Add a new site |
| `npm run dry-run` | Publish with dry-run mode (no actual publishing) |

### Options

```
--site <name>        Select site to operate on
--all                Operate on all configured sites
-v, --verbose        Show detailed output
-q, --quiet          Only show errors and summary
-y, --yes            Skip confirmation prompts
--delay=<ms>         Delay between publishes (default: 3000)
```

### Multi-site Usage

```bash
# Publish default site
npm run publish

# Publish specific site
npm run publish -- --site notes

# Publish all sites
npm run publish -- --all
```

## Frontmatter

hugo2nostr reads and writes frontmatter fields:

```yaml
---
title: My Article
slug: my-article
date: 2024-01-15
tags: [bitcoin, nostr]
topics: [technology]          # merged with tags
description: Article summary
hero_image: /images/hero.jpg  # uploaded to nostr.build
nostr_id: nevent1...          # added after publishing
nostr_image: https://...      # cached uploaded image URL
delete: true                  # mark for deletion
---
```

### Supported Fields

| Field | Description |
|-------|-------------|
| `title` | Article title |
| `slug` | URL slug (defaults to filename) |
| `date` | Publication date |
| `tags`, `topics` | Merged into `t` tags |
| `description`, `summary` | Article summary |
| `hero_image`, `image` | Hero image (auto-uploaded) |
| `nostr_id` | nevent ID (set after publish) |
| `nostr_image` | Cached nostr.build URL |
| `delete` | Set to `true` to delete on next `delete` run |

## Image Handling

Images are automatically uploaded to nostr.build using NIP-98 authentication:

1. Local/relative images in `hero_image` are uploaded on first publish
2. The nostr.build URL is cached in `nostr_image` frontmatter
3. Subsequent publishes use the cached URL (no re-upload)

## Shortcode Processing

Hugo shortcodes are converted during publishing:

- `{{< youtube id >}}` → YouTube embed link
- `{{< figure src="..." >}}` → Markdown image
- Custom shortcodes → interactive mapping (saved to `~/.config/hugo2nostr/shortcodes.json`)

## Workflow

```bash
# 1. Preview before publishing
npm run preview my-post.md

# 2. Dry run to see what would happen
npm run dry-run -- -v

# 3. Publish
npm run publish

# 4. Check what's on relays
npm run debug

# 5. Delete a specific post (add delete: true to frontmatter first)
npm run delete

# 6. Sync posts from Nostr back to Hugo
npm run sync
```

## Development

This project is written in TypeScript and requires compilation before use.

### Building

```bash
npm run build  # Compile TypeScript to dist/
```

### Development Mode

```bash
npm run dev  # Run directly with ts-node (no build required)
```

### Testing

The project includes a comprehensive test suite:

```bash
npm test              # Run all tests
npm run test:watch    # Run tests in watch mode
npm run test:coverage # Run tests with coverage report
```

**Test Status:**
- ✅ 6 test suites passing
- ✅ 24 tests passing
- ⏭️ 1 test suite skipped

**Test Coverage:**
- Core configuration management
- Frontmatter parsing (YAML, TOML)
- Markdown processing and shortcode conversion
- Nostr event creation and signing
- Media upload functionality

### Project Structure

```
src/
  ├── commands/     # CLI commands
  ├── core/         # Core configuration
  ├── lib/          # Utility libraries
  ├── __tests__/    # Test files
  └── index.ts      # Main entry point
dist/               # Compiled JavaScript (generated)
legacy/             # Legacy JavaScript code
```

## NIP Compliance

Published events follow [NIP-23](https://github.com/nostr-protocol/nips/blob/master/23.md):

- `kind: 30023` (long-form article)
- `d` tag: slug/identifier
- `title` tag: article title
- `summary` tag: description
- `published_at` tag: original publication timestamp
- `t` tags: topics/hashtags
- `image` tag: hero image URL
- `r` tag: canonical URL
- `author` tag: author identifier

## Contributing

Issues and pull requests welcome.

## License

MIT
