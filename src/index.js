#!/bin/env node

import { publish } from "./publish.js";
import { delete_marked } from "./delete.js";
import { update_nevents } from "./update.js";
import { delete_all } from "./delete_all.js";
import { to_hugo } from "./to_hugo.js";
import { debug } from "./debug.js";


function help() {
  console.log(`
Usage: cli <command> [options]

Commands:
  publish              Publish new posts on nostr network
  delete               Delete marked posts from nostr network
  update               Update nevents for all posts
  delete-all           Delete all posts from nostr network
  sync                 Sync posts to Hugo site
  debug                Debug mode to test configurations
  
  help                 Show this help message
  `);
}

function main() {
  const args = process.argv.slice(2); // skip "node" and script name
  const command = args[0];

  switch (command) {
    case "publish":
          publish();
      break;
    case "delete":
          delete_marked();
          break;
    case "update":
          update_nevents();
          break;
    case "delete-all":
          delete_all();
          break;
    case "sync":
          to_hugo();
          break;
    case "debug":
          debug();
          break;
    case "help":
    default:
      help();
      break;
  }
}

main();
