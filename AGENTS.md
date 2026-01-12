# AGENTS.md - Hugo2Nostr

Guidelines for AI coding agents working on this codebase.

## Project Overview

Hugo2Nostr is a Node.js CLI tool that publishes Hugo blog posts to the Nostr network as `kind:30023` (Article) events. It supports bidirectional sync, deletion management, and multiple relay publishing.

**Stack**: Node.js (ES Modules), nostr-tools, Jest

## Build & Run Commands

```bash
# Install dependencies
npm install

# Run the CLI
node src/index.js <command>

# Available commands via npm scripts
npm run publish      # Publish Hugo posts to Nostr
npm run dry-run      # Preview events without publishing (DRY_RUN=1)
npm run debug        # Fetch existing articles from relays
npm run delete       # Delete posts marked with delete: true in frontmatter
npm run delete-all   # Delete all published articles
npm run sync         # Sync posts from Nostr back to Hugo
npm run update       # Update relay list and nevent IDs in frontmatter
```

## Testing

```bash
# Run all tests
npm test

# Run a single test file
npm test -- tests/utils.test.js

# Run a single test by name/pattern
npm test -- -t "parseFrontmatter parses YAML"

# Run tests with CI flags (used in GitHub Actions)
npm test -- --ci --runInBand

# Run tests matching multiple patterns
npm test -- -t "normalizeTags"
```

**Test Framework**: Jest v30 with Babel for ES Module transpilation
**Test Location**: `tests/*.test.js`

## Environment Configuration

Required environment variables (see `.env.dist`):

```bash
POSTS_DIR="/path/to/hugo/content/posts"  # Hugo posts directory
RELAY_LIST="wss://relay1.example,wss://relay2.example"  # Comma-separated relays
NOSTR_PRIVATE_KEY="nsec..."  # Nostr private key (nsec format)
DRY_RUN=1  # Optional: set to "1" for preview mode
```

The project uses direnv (`.envrc`) to auto-load `.env` file.

## Code Style Guidelines

### Module System
- ES Modules exclusively (`"type": "module"` in package.json)
- All imports use `.js` extension for local modules

### Import Order
1. Node.js built-ins (`fs`)
2. Third-party packages (`nostr-tools`, `gray-matter`, `glob`)
3. Local modules (`./utils.js`, `./init.js`)

```javascript
import fs from "fs";
import { glob } from "glob";
import * as nip19 from "nostr-tools/nip19";
import { parseFrontmatter } from "./utils.js";
import { RELAYS, init } from "./init.js";
```

### Naming Conventions

| Element | Convention | Examples |
|---------|------------|----------|
| Exported functions | snake_case | `delete_marked()`, `update_nevents()` |
| Internal functions | camelCase | `parseFrontmatter()`, `rewriteNevent()` |
| Constants | SCREAMING_SNAKE_CASE | `RELAYS`, `DRY_RUN`, `POSTS_DIR` |
| Variables | camelCase | `signedEvent`, `nostrEvent` |
| Files | kebab-case or snake_case | `delete-all.js`, `to_hugo.js` |

### Function Declarations
- Use `async function name()` for async functions
- Use `function name()` for sync functions
- Export functions individually: `export async function publish()`
- No classes - functional approach throughout

### Error Handling

```javascript
// Pattern: try-catch with console logging, continue on error
for (const file of files) {
  try {
    // ... processing
  } catch (e) {
    console.error(`Error processing ${file}:`, e);
    // Continue to next file
  }
}
```

- Wrap file and network operations in try-catch
- Use `console.warn` for warnings, `console.error` for errors
- Continue processing remaining items after individual failures
- Exit with `process.exit(1)` only for fatal configuration errors

### Async Patterns
- Use `await` in `for...of` loops for sequential processing
- Use `Promise.all()` with `.map()` for parallel operations
- Add sleep delays between network operations: `await sleep(3000)`

### Console Output
Use emoji prefixes for visual distinction:
- `✅` Success
- `⚠️` Warning  
- `❌` Error
- `📚` Info/counts
- `🚀` Action starting
- `🔄` Sync/update
- `🗑️` Delete
- `💾` Save
- `🎉` Completion

### Frontmatter Handling
The codebase supports multiple frontmatter formats:
- YAML (delimited by `---`)
- TOML (delimited by `+++`)
- Plain (no frontmatter)

Use `parseFrontmatter()` and `stringifyFrontmatter()` from `utils.js`.

### Nostr Events
Standard pattern for creating and publishing events:

```javascript
const nostrEvent = {
  kind: 30023,  // Article kind
  created_at: Math.floor(Date.now() / 1000),
  tags: [["title", title], ["d", slug], ...tags.map(t => ["t", t])],
  content: content,
};
const signedEvent = finalizeEvent(nostrEvent, AUTHOR_PRIVATE_KEY);
await publishToNostr(signedEvent);
```

## Project Structure

```
hugo2nostr/
├── src/
│   ├── index.js       # CLI entry point, command routing
│   ├── init.js        # Configuration, env vars, WebSocket setup
│   ├── utils.js       # Shared utilities (parsing, publishing, etc.)
│   ├── publish.js     # Publish posts to Nostr
│   ├── delete.js      # Delete marked posts
│   ├── delete-all.js  # Delete all posts
│   ├── update.js      # Update nevent IDs
│   ├── to_hugo.js     # Sync from Nostr to Hugo
│   └── debug.js       # Debug/fetch existing articles
├── tests/
│   └── utils.test.js  # Unit tests for utils.js
└── .github/workflows/
    └── test.yml       # CI workflow
```

## Key Files

- `src/init.js` - Centralizes config; must call `init()` before using WebSocket/pool
- `src/utils.js` - Shared utilities; add new helpers here
- `.env.dist` - Template for required environment variables

## Testing Guidelines

- Mock external dependencies (`fs`, `nostr-tools/pool`, `crypto`)
- Test files mirror source structure: `src/utils.js` -> `tests/utils.test.js`
- Use descriptive test names: `"parseFrontmatter parses YAML frontmatter"`
- Group related tests with `describe()` blocks

## Common Gotchas

1. **WebSocket initialization**: Call `init()` from `init.js` before using SimplePool
2. **Environment variables**: Required vars must be set or the module will throw on import
3. **Relay failures**: Code is designed to continue if individual relays fail
4. **Sleep delays**: Network operations include deliberate delays to avoid rate limiting
5. **Frontmatter type tracking**: Always preserve and pass through the `type` field

## CI/CD

GitHub Actions runs tests on all branches and PRs:
- Node.js 22
- `npm test -- --ci --runInBand`
