import fs from 'fs';
import path from 'path';
import os from 'os';
import yaml from 'yaml';
import * as nip19 from 'nostr-tools/nip19';
import { bytesToHex } from '@noble/hashes/utils';

export const CONFIG_DIR = path.join(os.homedir(), '.config', 'hugo2nostr');
export const CONFIG_FILE = path.join(CONFIG_DIR, 'config.yaml');
export const SECRETS_FILE = path.join(CONFIG_DIR, 'secrets');

export interface SiteConfig {
    posts_dir: string;
    blog_url?: string;
    author_id?: string;
    relays?: string[];
    image_host?: string;
}

export interface AppConfig {
    default_site?: string;
    sites?: Record<string, SiteConfig>;
    relays?: string[]; // Global relays
    image_host?: string; // Global image host
    author_id?: string; // Global author ID
    // Runtime resolved values
    _siteName?: string;
    _hugoRoot?: string | null;
}

export interface RuntimeOptions {
    verbose?: boolean;
    quiet?: boolean;
    yes?: boolean;
    delay?: number;
    site?: string;
}

export class ConfigManager {
    public config: AppConfig;
    public options: RuntimeOptions;
    private _privateKey: string | null = null;
    private _pubkey: string | null = null;

    constructor(options: RuntimeOptions = {}) {
        this.options = {
            delay: 3000,
            verbose: false,
            quiet: false,
            yes: false,
            ...options
        };
        this.config = this.loadConfig() || this.createDefaultConfig();
        this.loadSecrets();
    }

    // Reload config for a specific site and merge values
    public resolveSiteConfig(siteName: string | null = null): SiteConfig & { name: string } {
        const targetSite = siteName || this.options.site || this.config.default_site;

        // If no site specified and only one exists, use it
        let siteKey = targetSite;
        if (!siteKey && this.config.sites) {
            const keys = Object.keys(this.config.sites);
            if (keys.length === 1) siteKey = keys[0];
        }

        if (!siteKey || !this.config.sites?.[siteKey]) {
            // Fallback for unconfigured setup or single-run environment variables
            const envConfig = this.loadFromEnv();
            return {
                name: 'default',
                ...envConfig
            };
        }

        const site = this.config.sites[siteKey];
        this.config._siteName = siteKey;

        // Merge site specifics with globals
        return {
            name: siteKey,
            posts_dir: this.expandPath(site.posts_dir),
            blog_url: site.blog_url || this.config.default_site === siteKey ? (site.blog_url || '') : '', // Logic from old code usually preferred site specific
            author_id: site.author_id || this.config.author_id || '',
            relays: site.relays || this.config.relays || [],
            image_host: site.image_host || this.config.image_host || 'nostr.build',
        };
    }

    public getHugoRoot(postsDir: string): string | null {
        if (!postsDir) return null;
        let dir = path.resolve(postsDir);
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

    public getPrivateKey(): string | null {
        return this._privateKey;
    }

    // Load raw config from file
    private loadConfig(): AppConfig | null {
        if (!fs.existsSync(CONFIG_FILE)) return null;
        try {
            const file = fs.readFileSync(CONFIG_FILE, 'utf-8');
            const config = yaml.parse(file) as AppConfig;
            return config;
        } catch (e) {
            console.error("Failed to parse config:", e);
            return null;
        }
    }

    private createDefaultConfig(): AppConfig {
        return {
            relays: [],
            sites: {}
        };
    }

    private loadFromEnv(): SiteConfig {
        return {
            posts_dir: process.env.POSTS_DIR || './posts',
            blog_url: process.env.BLOG_URL,
            author_id: process.env.AUTHOR_ID,
            relays: process.env.RELAY_LIST?.split(',').filter(Boolean) || [],
            image_host: process.env.IMAGE_HOST
        };
    }

    private loadSecrets() {
        // 1. Env var
        if (process.env.NOSTR_PRIVATE_KEY) {
            this._privateKey = this.processKey(process.env.NOSTR_PRIVATE_KEY);
            return;
        }

        // 2. File
        if (fs.existsSync(SECRETS_FILE)) {
            const content = fs.readFileSync(SECRETS_FILE, 'utf-8').trim();
            if (content.startsWith('nsec1')) {
                this._privateKey = this.processKey(content);
                return;
            }
            const match = content.match(/^NOSTR_PRIVATE_KEY=(.+)$/m);
            if (match) {
                this._privateKey = this.processKey(match[1].trim().replace(/^["']|["']$/g, ''));
            }
        }
    }

    private processKey(key: string): string | null {
        try {
            if (key.startsWith('nsec1')) {
                const { data } = nip19.decode(key);
                return bytesToHex(data as Uint8Array);
            }
            return key; // Assume hex if not nsec
        } catch (e) {
            console.error("Invalid private key format");
            return null;
        }
    }

    private expandPath(p: string): string {
        if (!p) return p;
        if (p.startsWith('~/')) {
            return path.join(os.homedir(), p.slice(2));
        }
        return p;
    }

    public static ensureConfigDir() {
        if (!fs.existsSync(CONFIG_DIR)) {
            fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
        }
    }

    public saveConfig(config: AppConfig) {
        ConfigManager.ensureConfigDir();
        fs.writeFileSync(CONFIG_FILE, yaml.stringify(config), 'utf-8');
    }

    public savePrivateKey(nsec: string) {
        ConfigManager.ensureConfigDir();
        fs.writeFileSync(SECRETS_FILE, nsec, { mode: 0o600 });
        this._privateKey = this.processKey(nsec);
    }
}
