import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { bytesToHex } from '@noble/hashes/utils';
import { getPublicKey } from "nostr-tools/pure";
import { useWebSocketImplementation, SimplePool } from 'nostr-tools/pool';
import WebSocket from 'ws';
import * as nip19 from 'nostr-tools/nip19';
import { loadPrivateKey, getSiteConfig, configExists } from './config.js';

// CLI options (set by index.js before commands run)
export const options = {
    verbose: false,
    quiet: false,
    yes: false,
    delay: 3000,  // ms between publish operations (helps avoid rate limits)
    site: null,   // selected site name
};

// Shared pool instance (lazy initialized)
let pool = null;

// Configuration - exported directly, populated by init()
export let POSTS_DIR = null;
export let RELAYS = [];
export let BLOG_URL = '';
export let AUTHOR_ID = '';
export let IMAGE_HOST = 'nostr.build';
export let HUGO_ROOT = null;
export let AUTHOR_PRIVATE_KEY = null;
export let pubkey = null;
export let SITE_NAME = null;
export const DRY_RUN = process.env.DRY_RUN === "1";

// Find Hugo root by walking up from POSTS_DIR looking for hugo config
export function getHugoRoot(startDir) {
    if (!startDir) return null;
    let dir = path.resolve(startDir);
    const root = path.parse(dir).root;
    
    while (dir !== root) {
        for (const configName of ['hugo.toml', 'hugo.yaml', 'hugo.json', 'config.toml', 'config.yaml', 'config.json']) {
            if (fs.existsSync(path.join(dir, configName))) {
                return dir;
            }
        }
        dir = path.dirname(dir);
    }
    return null;
}

// Initialize WebSocket and load config for a site
export function init(siteName = null) {
    useWebSocketImplementation(WebSocket);
    
    const targetSite = siteName || options.site;
    
    let config;
    try {
        config = getSiteConfig(targetSite);
        SITE_NAME = config.name || targetSite || 'default';
    } catch (e) {
        // If no config file, fall back to env vars
        if (!configExists()) {
            config = {
                posts_dir: process.env.POSTS_DIR || './posts',
                blog_url: process.env.BLOG_URL || '',
                author_id: process.env.AUTHOR_ID || '',
                relays: process.env.RELAY_LIST?.split(',').filter(Boolean) || [],
                image_host: process.env.IMAGE_HOST || 'nostr.build',
            };
            SITE_NAME = 'default';
        } else {
            throw e;
        }
    }
    
    POSTS_DIR = config.posts_dir;
    BLOG_URL = config.blog_url || '';
    AUTHOR_ID = config.author_id || '';
    RELAYS = config.relays || [];
    IMAGE_HOST = config.image_host || 'nostr.build';
    HUGO_ROOT = getHugoRoot(POSTS_DIR);
    
    // Load private key
    const privateKeyNsec = loadPrivateKey();
    if (privateKeyNsec) {
        try {
            const { data } = nip19.decode(privateKeyNsec);
            AUTHOR_PRIVATE_KEY = bytesToHex(data);
            pubkey = getPublicKey(AUTHOR_PRIVATE_KEY);
        } catch (e) {
            console.error(`❌ Invalid private key: ${e.message}`);
            process.exit(1);
        }
    }
    
    if (!DRY_RUN && !AUTHOR_PRIVATE_KEY) {
        console.error("❌ No private key found. Run `hugo2nostr init` or set NOSTR_PRIVATE_KEY.");
        process.exit(1);
    }
}

export function getPool() {
    if (!pool) {
        pool = new SimplePool();
        pool.trackRelays = true;
    }
    return pool;
}

export async function closePool() {
    if (pool && RELAYS.length > 0) {
        await pool.close(RELAYS);
        pool = null;
    }
}
