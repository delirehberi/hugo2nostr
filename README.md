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
```

## Quick Start

```bash
# Set up configuration (interactive)
node src/index.js init

# Preview a post before publishing
node src/index.js preview my-post.md

# Publish posts (dry run first)
DRY_RUN=1 node src/index.js publish -v

# Publish for real
node src/index.js publish
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

```
node src/index.js <command> [options]

Commands:
  publish              Publish posts to Nostr
  preview <file>       Preview a post as HTML (opens in browser)
  delete               Delete posts marked with delete: true
  delete-all           Delete all published posts
  update               Update nevent IDs in frontmatter
  sync                 Sync posts from Nostr to Hugo
  debug                Fetch and display existing articles
  init                 Set up configuration
  config               Show current configuration
  add-site [name]      Add a new site

Options:
  --site <name>        Select site to operate on
  --all                Operate on all configured sites
  -v, --verbose        Show detailed output
  -q, --quiet          Only show errors and summary
  -y, --yes            Skip confirmation prompts
  --delay=<ms>         Delay between publishes (default: 3000)
```

You can also use npm scripts defined in package.json (e.g., `npm run publish`).

### Multi-site Usage

```bash
# Publish default site
node src/index.js publish

# Publish specific site
node src/index.js publish --site notes

# Publish all sites
node src/index.js publish --all
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
hugo2nostr preview my-post.md

# 2. Dry run to see what would happen
DRY_RUN=1 hugo2nostr publish -v

# 3. Publish
hugo2nostr publish

# 4. Check what's on relays
hugo2nostr debug

# 5. Delete a specific post (add delete: true to frontmatter first)
hugo2nostr delete

# 6. Sync posts from Nostr back to Hugo
hugo2nostr sync

# 7. Update nevent IDs after changing relays
hugo2nostr update
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
