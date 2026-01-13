import readline from 'readline';
import * as nip19 from 'nostr-tools/nip19';
import {
    configExists,
    loadConfig,
    saveConfig,
    loadPrivateKey,
    savePrivateKey,
    createInitialConfig,
    getSiteNames,
    CONFIG_FILE,
    SECRETS_FILE,
} from './config.js';

function prompt(question) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    return new Promise(resolve => {
        rl.question(question, answer => {
            rl.close();
            resolve(answer.trim());
        });
    });
}

function promptPassword(question) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    
    return new Promise(resolve => {
        // Hide input on supported terminals
        if (process.stdin.isTTY) {
            process.stdout.write(question);
            const stdin = process.stdin;
            stdin.setRawMode(true);
            stdin.resume();
            stdin.setEncoding('utf8');
            
            let password = '';
            const onData = (char) => {
                if (char === '\n' || char === '\r' || char === '\u0004') {
                    stdin.setRawMode(false);
                    stdin.removeListener('data', onData);
                    process.stdout.write('\n');
                    rl.close();
                    resolve(password);
                } else if (char === '\u0003') {
                    // Ctrl+C
                    process.exit(1);
                } else if (char === '\u007F' || char === '\b') {
                    // Backspace
                    if (password.length > 0) {
                        password = password.slice(0, -1);
                    }
                } else {
                    password += char;
                }
            };
            stdin.on('data', onData);
        } else {
            // Fallback for non-TTY
            rl.question(question, answer => {
                rl.close();
                resolve(answer.trim());
            });
        }
    });
}

function validateNsec(nsec) {
    if (!nsec.startsWith('nsec1')) {
        return { valid: false, error: 'Private key must start with nsec1' };
    }
    try {
        const decoded = nip19.decode(nsec);
        if (decoded.type !== 'nsec') {
            return { valid: false, error: 'Invalid nsec format' };
        }
        return { valid: true };
    } catch (e) {
        return { valid: false, error: `Invalid nsec: ${e.message}` };
    }
}

export async function initCommand() {
    console.log('\n🔧 hugo2nostr setup\n');
    
    // Check if already configured
    if (configExists()) {
        const overwrite = await prompt('Config already exists. Overwrite? [y/N] ');
        if (overwrite.toLowerCase() !== 'y') {
            console.log('Cancelled.');
            return 0;
        }
    }
    
    // Private key
    console.log('\n📝 Step 1: Nostr Private Key\n');
    let privateKey = loadPrivateKey();
    if (privateKey) {
        console.log('  Found existing private key.');
        const useExisting = await prompt('  Use existing key? [Y/n] ');
        if (useExisting.toLowerCase() === 'n') {
            privateKey = null;
        }
    }
    
    if (!privateKey) {
        const nsec = await promptPassword('  Enter your nsec (hidden): ');
        const validation = validateNsec(nsec);
        if (!validation.valid) {
            console.error(`\n❌ ${validation.error}`);
            return 1;
        }
        savePrivateKey(nsec);
        console.log(`  ✅ Saved to ${SECRETS_FILE}`);
    }
    
    // Sites
    console.log('\n📝 Step 2: Configure Sites\n');
    
    const sites = {};
    let addMore = true;
    let firstSite = null;
    
    while (addMore) {
        const siteName = await prompt('  Site name (e.g., essays, notes, blog): ');
        if (!siteName) {
            if (Object.keys(sites).length === 0) {
                console.log('  At least one site is required.');
                continue;
            }
            break;
        }
        
        if (!firstSite) firstSite = siteName;
        
        const postsDir = await prompt(`  Posts directory for "${siteName}": `);
        const blogUrl = await prompt(`  Blog URL for "${siteName}" (optional): `);
        
        sites[siteName] = {
            posts_dir: postsDir,
        };
        if (blogUrl) {
            sites[siteName].blog_url = blogUrl;
        }
        
        const another = await prompt('\n  Add another site? [y/N] ');
        addMore = another.toLowerCase() === 'y';
    }
    
    // Default site
    let defaultSite = firstSite;
    if (Object.keys(sites).length > 1) {
        const siteList = Object.keys(sites).join(', ');
        defaultSite = await prompt(`\n  Default site (${siteList}): `) || firstSite;
    }
    
    // Relays
    console.log('\n📝 Step 3: Relays\n');
    const defaultRelays = 'wss://relay.damus.io,wss://nos.lol';
    const relaysInput = await prompt(`  Relays (comma-separated) [${defaultRelays}]: `);
    const relays = (relaysInput || defaultRelays).split(',').map(r => r.trim()).filter(Boolean);
    
    // Image host
    console.log('\n📝 Step 4: Image Hosting\n');
    const imageHost = await prompt('  Image host [nostr.build]: ') || 'nostr.build';
    
    // Author ID
    console.log('\n📝 Step 5: Author\n');
    const authorId = await prompt('  Author ID (email or identifier, optional): ');
    
    // Build and save config
    const config = {
        default_site: defaultSite,
        sites,
        relays,
        image_host: imageHost,
    };
    if (authorId) {
        config.author_id = authorId;
    }
    
    saveConfig(config);
    
    console.log(`\n✅ Config saved to ${CONFIG_FILE}`);
    console.log('\nYou can now run:');
    console.log(`  hugo2nostr publish              # publish ${defaultSite}`);
    if (Object.keys(sites).length > 1) {
        const otherSite = Object.keys(sites).find(s => s !== defaultSite);
        console.log(`  hugo2nostr publish --site ${otherSite}   # publish ${otherSite}`);
        console.log('  hugo2nostr publish --all        # publish all sites');
    }
    console.log('');
    
    return 0;
}

export async function addSiteCommand(siteName) {
    if (!configExists()) {
        console.log('No config found. Running init first...\n');
        return initCommand();
    }
    
    const config = loadConfig();
    
    if (!siteName) {
        siteName = await prompt('Site name: ');
        if (!siteName) {
            console.log('Cancelled.');
            return 0;
        }
    }
    
    if (config.sites?.[siteName]) {
        const overwrite = await prompt(`Site "${siteName}" already exists. Overwrite? [y/N] `);
        if (overwrite.toLowerCase() !== 'y') {
            console.log('Cancelled.');
            return 0;
        }
    }
    
    const postsDir = await prompt('Posts directory: ');
    const blogUrl = await prompt('Blog URL (optional): ');
    
    if (!config.sites) config.sites = {};
    config.sites[siteName] = { posts_dir: postsDir };
    if (blogUrl) {
        config.sites[siteName].blog_url = blogUrl;
    }
    
    saveConfig(config);
    console.log(`✅ Added site "${siteName}"`);
    
    return 0;
}

export async function configCommand() {
    if (!configExists()) {
        console.log('No config found. Run `hugo2nostr init` to set up.');
        return 0;
    }
    
    const config = loadConfig();
    const hasKey = !!loadPrivateKey();
    
    console.log('\n📋 hugo2nostr config\n');
    console.log(`Config file: ${CONFIG_FILE}`);
    console.log(`Private key: ${hasKey ? '✅ configured' : '❌ not set'}`);
    console.log(`Default site: ${config.default_site || 'not set'}`);
    console.log('\nSites:');
    
    if (config.sites) {
        for (const [name, site] of Object.entries(config.sites)) {
            const isDefault = name === config.default_site ? ' (default)' : '';
            console.log(`  ${name}${isDefault}`);
            console.log(`    posts_dir: ${site.posts_dir}`);
            if (site.blog_url) console.log(`    blog_url: ${site.blog_url}`);
        }
    }
    
    console.log('\nRelays:');
    for (const relay of (config.relays || [])) {
        console.log(`  ${relay}`);
    }
    
    console.log(`\nImage host: ${config.image_host || 'nostr.build'}`);
    if (config.author_id) console.log(`Author ID: ${config.author_id}`);
    console.log('');
    
    return 0;
}
