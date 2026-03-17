DIST = dist/index.js
SRC  = $(shell find src -name '*.ts')

# ── build ──────────────────────────────────────────────────────────────────────

.PHONY: build
build: $(DIST)

$(DIST): $(SRC)
	npm run build

# ── primary commands (all depend on a fresh build) ────────────────────────────

.PHONY: sync
sync: build
	node dist/index.js sync

.PHONY: publish
publish: build
	node dist/index.js publish

.PHONY: dry-run
dry-run: build
	DRY_RUN=1 node dist/index.js publish

.PHONY: preview
preview: build
	node dist/index.js preview

.PHONY: delete
delete: build
	node dist/index.js delete

.PHONY: delete-all
delete-all: build
	node dist/index.js delete-all

.PHONY: debug
debug: build
	node dist/index.js debug

.PHONY: debug-sync
debug-sync:
	node --loader ts-node/esm src/debug-sync.ts

# ── config / setup ────────────────────────────────────────────────────────────

.PHONY: init
init: build
	node dist/index.js init

.PHONY: config
config: build
	node dist/index.js config

.PHONY: add-site
add-site: build
	node dist/index.js add-site

# ── dev / test ────────────────────────────────────────────────────────────────

.PHONY: dev
dev:
	node --loader ts-node/esm src/index.ts

.PHONY: test
test:
	node --experimental-vm-modules node_modules/jest/bin/jest.js --config jest.config.cjs

.PHONY: test-watch
test-watch:
	node --experimental-vm-modules node_modules/jest/bin/jest.js --config jest.config.cjs --watch

.PHONY: test-coverage
test-coverage:
	node --experimental-vm-modules node_modules/jest/bin/jest.js --config jest.config.cjs --coverage

# ── housekeeping ──────────────────────────────────────────────────────────────

.PHONY: install
install:
	npm install

.PHONY: clean
clean:
	rm -rf dist

.PHONY: rebuild
rebuild: clean build

.PHONY: help
help:
	@echo ""
	@echo "  hugo2nostr — available targets"
	@echo ""
	@echo "  Build"
	@echo "    build          Compile TypeScript (incremental — only if sources changed)"
	@echo "    rebuild        Clean dist/ and recompile from scratch"
	@echo "    clean          Remove dist/"
	@echo "    install        npm install"
	@echo ""
	@echo "  Commands  (all auto-rebuild if sources changed)"
	@echo "    sync           Sync posts from Nostr → Hugo"
	@echo "    publish        Publish Hugo posts → Nostr"
	@echo "    dry-run        Preview publish without sending events"
	@echo "    preview        Preview posts"
	@echo "    delete         Delete posts marked delete:true in frontmatter"
	@echo "    delete-all     Delete all published posts"
	@echo "    debug          Fetch existing articles from relays"
	@echo "    debug-sync     Run debug-sync diagnostic script (no build needed)"
	@echo ""
	@echo "  Config"
	@echo "    init           Interactive setup wizard"
	@echo "    config         Show current config"
	@echo "    add-site       Add a new site"
	@echo ""
	@echo "  Dev / Test"
	@echo "    dev            Run from source via ts-node (no build needed)"
	@echo "    test           Run test suite"
	@echo "    test-watch     Run tests in watch mode"
	@echo "    test-coverage  Run tests with coverage report"
	@echo ""
