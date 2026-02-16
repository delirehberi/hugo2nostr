#!/bin/env node

import { publish } from "./publish.js";
import { delete_marked } from "./delete.js";
import { update_nevents } from "./update.js";
import { delete_all } from "./delete-all.js";
import { sync } from "./to_hugo.js";
import { debug } from "./debug.js";
import { preview } from "./preview.js";
import { initCommand, configCommand, addSiteCommand } from "./setup.js";
import { options } from "./init.js";
import { getSiteNames, getDefaultSite, configExists } from "./config.js";

// Parse CLI arguments
function parseArgs(args) {
    const result = { command: null, flags: {}, positional: [] };
    
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg.startsWith('--')) {
            const eqIndex = arg.indexOf('=');
            if (eqIndex !== -1) {
                const key = arg.slice(2, eqIndex);
                const value = arg.slice(eqIndex + 1);
                result.flags[key] = isNaN(value) ? value : Number(value);
            } else {
                const key = arg.slice(2);
                // Check if next arg is the value (for --site notes format)
                if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
                    const nextArg = args[i + 1];
                    // Only treat as value if it's not a command
                    if (['site'].includes(key)) {
                        result.flags[key] = nextArg;
                        i++;
                        continue;
                    }
                }
                result.flags[key] = true;
            }
        } else if (arg.startsWith('-') && arg.length === 2) {
            // Short flags: -v, -q, -y
            const flag = arg[1];
            const map = { v: 'verbose', q: 'quiet', y: 'yes' };
            if (map[flag]) result.flags[map[flag]] = true;
        } else if (!result.command) {
            result.command = arg;
        } else {
            result.positional.push(arg);
        }
    }
    
    return result;
}

function help() {
    let siteHelp = '';
    if (configExists()) {
        const sites = getSiteNames();
        const defaultSite = getDefaultSite();
        if (sites.length > 0) {
            siteHelp = `
Sites:
  Available: ${sites.join(', ')}
  Default: ${defaultSite || sites[0]}
`;
        }
    }
    
    console.log(`
Usage: hugo2nostr <command> [options]

Commands:
  publish              Publish posts to Nostr network
  preview <file>       Preview a post as HTML (opens in browser)
  delete               Delete posts marked with delete: true
  delete-all           Delete all published posts from Nostr
  update               Update nevent IDs in frontmatter
  sync                 Sync posts from Nostr to Hugo
  debug                Fetch and display existing articles
  init                 Set up hugo2nostr configuration
  config               Show current configuration
  add-site [name]      Add a new site to configuration
  help                 Show this help message

Options:
  --site <name>        Select site to operate on
  --all                Operate on all configured sites
  -v, --verbose        Show detailed output
  -q, --quiet          Only show errors and summary (default)
  -y, --yes            Skip confirmation prompts
  --delay=<ms>         Delay between publishes (default: 3000)
${siteHelp}
Examples:
  hugo2nostr publish              # publish default site
  hugo2nostr publish --site notes # publish notes site
  hugo2nostr publish --all        # publish all sites
  hugo2nostr preview my-post.md
`);
}

async function runForAllSites(commandFn) {
    const sites = getSiteNames();
    if (sites.length === 0) {
        console.error('❌ No sites configured. Run `hugo2nostr init` first.');
        return 1;
    }
    
    let exitCode = 0;
    for (const site of sites) {
        console.log(`\n📂 Site: ${site}\n`);
        options.site = site;
        const result = await commandFn();
        if (result !== 0) exitCode = result;
    }
    return exitCode;
}

async function main() {
    const args = process.argv.slice(2);
    const { command, flags, positional } = parseArgs(args);
    
    // Apply flags to global options
    if (flags.verbose) options.verbose = true;
    if (flags.quiet) options.quiet = true;
    if (flags.yes) options.yes = true;
    if (flags.delay !== undefined) options.delay = flags.delay;
    if (flags.site) options.site = flags.site;
    
    // quiet is default unless verbose is set
    if (!flags.verbose && !flags.quiet) options.quiet = true;
    
    let exitCode = 0;
    
    try {
        // Commands that don't need site config
        if (command === 'init') {
            exitCode = await initCommand();
        } else if (command === 'config') {
            exitCode = await configCommand();
        } else if (command === 'add-site') {
            exitCode = await addSiteCommand(positional[0]);
        } else if (command === 'help' || !command) {
            help();
        } else {
            // Commands that operate on sites
            const runAll = flags.all;
            
            switch (command) {
                case "publish":
                    exitCode = runAll ? await runForAllSites(publish) : await publish();
                    break;
                case "preview":
                    exitCode = await preview(positional[0]);
                    break;
                case "delete":
                    exitCode = runAll ? await runForAllSites(delete_marked) : await delete_marked();
                    break;
                case "update":
                    exitCode = runAll ? await runForAllSites(update_nevents) : await update_nevents();
                    break;
                case "delete-all":
                    exitCode = runAll ? await runForAllSites(delete_all) : await delete_all();
                    break;
                case "sync":
                    exitCode = runAll ? await runForAllSites(sync) : await sync();
                    break;
                case "debug":
                    exitCode = await debug();
                    break;
                default:
                    console.error(`Unknown command: ${command}`);
                    help();
                    exitCode = 1;
                    break;
            }
        }
    } catch (err) {
        console.error("❌ Fatal error:", err.message);
        if (options.verbose) console.error(err.stack);
        exitCode = 2;
    }
    
    process.exit(exitCode ?? 0);
}

main();
