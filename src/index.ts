#!/usr/bin/env node

import { parseArgs } from 'util';
import { ConfigManager } from './core/config.js';
import { publishCommand } from './commands/publish.js';
import { syncCommand } from './commands/sync.js';
import { deleteCommand, deleteAllCommand } from './commands/delete.js';
import { previewCommand } from './commands/preview.js';
import { initCommand, configCommand, addSiteCommand } from './commands/setup.js';
import { debugCommand } from './commands/debug.js';

interface ParsedArgs {
    command: string | null;
    positional: string[];
    values: {
        verbose?: boolean;
        quiet?: boolean;
        yes?: boolean; // confirm
        site?: string;
        all?: boolean;
        delay?: string;
        help?: boolean;
        version?: boolean;
    }
}

function printHelp() {
    console.log(`
hugo2nostr - Publish Hugo posts to Nostr

Usage:
  hugo2nostr <command> [options]

Commands:
  publish     Publish posts to Nostr
  sync        Sync posts from Nostr to Hugo (import)
  delete      Delete posts marked with delete: true
  delete-all  Delete ALL published posts from Nostr (destructive)
  preview     Preview posts locally with shortcode rendering
  init        Initialize configuration
  config      Show current configuration
  add-site    Add a new site to configuration
  debug       Debug network/relay usage

Options:
  --site <name>   Select a specific site from config
  --all           Run command for all configured sites (publish only)
  --verbose, -v   Verbose output
  --quiet, -q     Quiet output
  --yes, -y       Skip confirmations
  --delay <ms>    Delay between operations (default: 3000ms)
  --help, -h      Show this help message
  --version       Show version
`);
}

async function main() {
    let args;
    try {
        args = parseArgs({
            options: {
                site: { type: 'string' },
                all: { type: 'boolean' },
                verbose: { type: 'boolean', short: 'v' },
                quiet: { type: 'boolean', short: 'q' },
                yes: { type: 'boolean', short: 'y' },
                delay: { type: 'string' },
                help: { type: 'boolean', short: 'h' },
                version: { type: 'boolean' }
            },
            allowPositionals: true
        });
    } catch (e: any) {
        console.error(`Error parsing arguments: ${e.message}`);
        process.exit(1);
    }

    if (args.values.help) {
        printHelp();
        process.exit(0);
    }

    if (args.values.version) {
        // We could read package.json, but keep it simple
        console.log('hugo2nostr v1.0.0');
        process.exit(0);
    }

    const command = args.positionals[0];
    const restArgs = args.positionals.slice(1);

    if (!command) {
        printHelp();
        process.exit(0);
    }

    const configManager = new ConfigManager({
        verbose: args.values.verbose,
        quiet: args.values.quiet,
        yes: args.values.yes,
        delay: args.values.delay ? parseInt(args.values.delay, 10) : 3000,
        site: args.values.site,
    });

    let exitCode = 0;

    try {
        switch (command) {
            case 'init':
                exitCode = await initCommand(configManager);
                break;
            case 'config':
                exitCode = await configCommand(configManager);
                break;
            case 'add-site':
                exitCode = await addSiteCommand(configManager, restArgs[0]);
                break;
            case 'publish':
                if (args.values.all) {
                    const sites = configManager.config.sites
                        ? Object.keys(configManager.config.sites)
                        : [];

                    if (sites.length === 0) {
                        console.error("No sites configured.");
                        exitCode = 1;
                        break;
                    }

                    for (const site of sites) {
                        console.log(`\n👉 Site: ${site}`);
                        // Update config manager context for this site
                        configManager.options.site = site;
                        const result = await publishCommand(configManager);
                        if (result !== 0) exitCode = result;
                    }
                } else {
                    exitCode = await publishCommand(configManager);
                }
                break;
            case 'sync':
                exitCode = await syncCommand(configManager);
                break;
            case 'delete':
                exitCode = await deleteCommand(configManager);
                break;
            case 'delete-all':
                exitCode = await deleteAllCommand(configManager);
                break;
            case 'preview':
                exitCode = await previewCommand(configManager);
                break;
            case 'debug':
                exitCode = await debugCommand(configManager);
                break;
            default:
                console.error(`Unknown command: ${command}`);
                printHelp();
                exitCode = 1;
        }
    } catch (e: any) {
        console.error(`❌ Fatal error: ${e.message}`);
        if (args.values.verbose) console.error(e);
        exitCode = 1;
    }

    process.exit(exitCode);
}

main();
