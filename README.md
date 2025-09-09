# Hugo to Nostr Publisher

This project allows you to **publish your Hugo blog posts to the Nostr network** as `kind:30023` (Article) events, track already published posts, and manage deletions. It also includes debug tools to inspect events on relays.

---

## Features

- Publish Hugo posts from `content/posts/*.md` to Nostr.
- Support multiple frontmatter formats:
  - YAML (`---`)
  - TOML (`+++`)
- Normalize tags and dates automatically.
- Dry-run mode to preview events before publishing.
- Debug script to fetch existing articles from relays.
- Delete script to send deletion events for all articles.
- Supports multiple relays and continues if one relay fails.
- Environment variable configuration for flexibility.
- Store all published events in markdown files as metadata (nostr_id).


---

## Environment Configuration

You can configure your project using environment variables in a `.env` file or export them before running scripts.

Example `.env` file:

```bash
# Path to Hugo posts
POSTS_DIR="FULLPATH_PROJECT_DIR/content/posts"

# Comma-separated list of relays
RELAY_LIST="wss://relay.emre.xyz"

# Dry-run mode (1 = enable, 0 = disable)
DRY_RUN=1

# Your Nostr private key (nsec...)
NOSTR_PRIVATE_KEY="nsecXXX"
```

Load these variables automatically using [`dotenv`](https://www.npmjs.com/package/dotenv) or export them in your shell:

```bash
export POSTS_DIR="/home/delirehberi/www/hugo-emrexyz/content/posts"
export RELAY_LIST="wss://relay.emre.xyz"
export DRY_RUN=1
export NOSTR_PRIVATE_KEY="nsecXXX"
```

Copy `.env.example` to `.env` and modify as needed.

---

## Scripts

### 1. `index.js` – Publish posts

Publishes your Hugo posts to the Nostr network.

**Command:**

```bash
npm run publish
```

**Features:**

* Reads all Markdown files in `POSTS_DIR`.
* Normalizes dates (default time `08:00` if missing).
* Parses tags (comma or space separated, strips `#` if present).
* Supports dry-run mode:

```bash
npm run dry-run
```

---

### 2. `debug.js` – Fetch existing articles

Fetches all existing `kind:30023` articles by your pubkey from configured relays. 

**Command:**

```bash
npm run debug
```

**Behavior:**

* Connects to all relays in `RELAY_LIST`.
* Continues fetching even if a relay fails.

---

### 3. `delete.js` – Delete articles

Sends a Nostr deletion event (`kind:5`) for all articles.

**Command:**

```bash
npm run delete
```

**Behavior:**

* Sends a deletion request per event to all configured relays.
* Continues if a relay fails.
* Requires your private key to sign the deletion events.

---

## Example Workflow

# 1. Preview posts without publishing
`npm run dry-run`

# 2. Publish posts to Nostr
`npm run publish`

# 3. Debug / fetch existing articles
`npm run debug`

# 4. Delete all articles if needed
`npm run delete`

---

## Notes

* Dry-run mode is recommended before publishing to avoid mistakes.
* Posts with very old dates may be rejected by some relays; the script normalizes to a safe range.
* Deletion events only work if your pubkey originally published the events.
* Supports multiple relays and continues publishing even if one relay fails.

---

## Dependencies

* Node.js (ESM)
* [nostr-tools](https://www.npmjs.com/package/nostr-tools)
* glob
* fs (built-in)
* dotenv (optional, for `.env` support)

## Contributing
Feel free to open issues or submit pull requests for improvements or bug fixes.
