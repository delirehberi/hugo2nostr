import fs from 'fs';
import path from 'path';
import os from 'os';
import yaml from 'yaml';

const CONFIG_DIR = path.join(os.homedir(), '.config', 'hugo2nostr');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.yaml');
const SECRETS_FILE = path.join(CONFIG_DIR, 'secrets');

// Expand ~ in paths
function expandPath(p) {
    if (!p) return p;
    if (p.startsWith('~/')) {
        return path.join(os.homedir(), p.slice(2));
    }
    return p;
}

// Load private key from environment or secrets file
export function loadPrivateKey() {
    // 1. Check environment variable first
    if (process.env.NOSTR_PRIVATE_KEY) {
        return process.env.NOSTR_PRIVATE_KEY;
    }
    
    // 2. Check secrets file
    if (fs.existsSync(SECRETS_FILE)) {
        const content = fs.readFileSync(SECRETS_FILE, 'utf-8').trim();
        // Secrets file format: just the nsec on a single line
        // or key=value format
        if (content.startsWith('nsec1')) {
            return content;
        }
        const match = content.match(/^NOSTR_PRIVATE_KEY=(.+)$/m);
        if (match) {
            return match[1].trim().replace(/^["']|["']$/g, '');
        }
    }
    
    return null;
}

// Save private key to secrets file
export function savePrivateKey(nsec) {
    ensureConfigDir();
    fs.writeFileSync(SECRETS_FILE, nsec, { mode: 0o600 });
}

// Ensure config directory exists
export function ensureConfigDir() {
    if (!fs.existsSync(CONFIG_DIR)) {
        fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
    }
}

// Check if config file exists
export function configExists() {
    return fs.existsSync(CONFIG_FILE);
}

// Load config from file
export function loadConfig() {
    if (!fs.existsSync(CONFIG_FILE)) {
        return null;
    }
    
    const content = fs.readFileSync(CONFIG_FILE, 'utf-8');
    const config = yaml.parse(content);
    
    // Expand paths in sites
    if (config.sites) {
        for (const [name, site] of Object.entries(config.sites)) {
            if (site.posts_dir) {
                site.posts_dir = expandPath(site.posts_dir);
            }
        }
    }
    
    return config;
}

// Save config to file
export function saveConfig(config) {
    ensureConfigDir();
    const content = yaml.stringify(config);
    fs.writeFileSync(CONFIG_FILE, content, 'utf-8');
}

// Get config for a specific site
export function getSiteConfig(siteName = null) {
    const config = loadConfig();
    
    if (!config) {
        // Fall back to environment variables (backwards compatibility)
        return {
            posts_dir: process.env.POSTS_DIR || './posts',
            blog_url: process.env.BLOG_URL || '',
            author_id: process.env.AUTHOR_ID || '',
            relays: process.env.RELAY_LIST?.split(',') || [],
            image_host: process.env.IMAGE_HOST || 'nostr.build',
        };
    }
    
    // Determine which site to use
    const targetSite = siteName || config.default_site;
    
    if (!targetSite || !config.sites?.[targetSite]) {
        const available = config.sites ? Object.keys(config.sites).join(', ') : 'none';
        throw new Error(`Site "${targetSite}" not found. Available sites: ${available}`);
    }
    
    const site = config.sites[targetSite];
    
    // Merge site-specific config with global defaults
    return {
        name: targetSite,
        posts_dir: site.posts_dir,
        blog_url: site.blog_url || config.blog_url || '',
        author_id: site.author_id || config.author_id || '',
        relays: site.relays || config.relays || [],
        image_host: site.image_host || config.image_host || 'nostr.build',
    };
}

// Get all site names
export function getSiteNames() {
    const config = loadConfig();
    if (!config?.sites) return [];
    return Object.keys(config.sites);
}

// Get default site name
export function getDefaultSite() {
    const config = loadConfig();
    return config?.default_site || null;
}

// Create initial config from current .env settings
export function createInitialConfig(options = {}) {
    const config = {
        default_site: options.default_site || 'default',
        sites: {
            [options.default_site || 'default']: {
                posts_dir: options.posts_dir || process.env.POSTS_DIR || '~/posts',
                blog_url: options.blog_url || process.env.BLOG_URL || '',
            }
        },
        relays: options.relays || process.env.RELAY_LIST?.split(',') || [
            'wss://relay.damus.io',
            'wss://nos.lol',
        ],
        image_host: options.image_host || process.env.IMAGE_HOST || 'nostr.build',
        author_id: options.author_id || process.env.AUTHOR_ID || '',
    };
    
    return config;
}

export { CONFIG_DIR, CONFIG_FILE, SECRETS_FILE };
