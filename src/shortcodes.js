import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import { HUGO_ROOT, options } from './init.js';
import { log, logVerbose, logError, promptChoice, promptInput, resolveUrl } from './utils.js';

const CONFIG_DIR = path.join(os.homedir(), '.config', 'hugo2nostr');
const MAPPINGS_FILE = path.join(CONFIG_DIR, 'shortcodes.json');

// Regex to detect shortcodes
// Matches: {{< name >}}, {{< name param="value" >}}, {{< name >}}inner{{< /name >}}
const SHORTCODE_REGEX = /\{\{<\s*(\w+)([^>]*?)>\}\}([\s\S]*?\{\{<\s*\/\1\s*>\}\})?/g;

// Regex to extract params from shortcode
const PARAM_REGEX = /(\w+)=["']([^"']+)["']|(\w+)=(\S+)/g;

// Load saved mappings
export function loadMappings() {
    try {
        if (fs.existsSync(MAPPINGS_FILE)) {
            return JSON.parse(fs.readFileSync(MAPPINGS_FILE, 'utf-8'));
        }
    } catch (e) {
        logVerbose(`  Could not load shortcode mappings: ${e.message}`);
    }
    return {};
}

// Save mappings
export function saveMappings(mappings) {
    try {
        if (!fs.existsSync(CONFIG_DIR)) {
            fs.mkdirSync(CONFIG_DIR, { recursive: true });
        }
        fs.writeFileSync(MAPPINGS_FILE, JSON.stringify(mappings, null, 2));
    } catch (e) {
        logError(`  Could not save shortcode mappings: ${e.message}`);
    }
}

// Get shortcode template paths from Hugo
export function getShortcodePaths(hugoRoot) {
    if (!hugoRoot) return [];
    
    const paths = [];
    
    try {
        // Run hugo config mounts to get all module paths
        const output = execSync('hugo config mounts', {
            cwd: hugoRoot,
            encoding: 'utf-8',
            stdio: ['pipe', 'pipe', 'pipe'],
        });
        
        // Hugo outputs pretty-printed JSON objects concatenated together
        // Split on "}\n{" to separate them, then reconstruct valid JSON
        const jsonStrings = output.trim().split(/\}\s*\n\s*\{/).map((s, i, arr) => {
            if (arr.length === 1) return s;
            if (i === 0) return s + '}';
            if (i === arr.length - 1) return '{' + s;
            return '{' + s + '}';
        });
        
        for (const jsonStr of jsonStrings) {
            try {
                const mount = JSON.parse(jsonStr);
                if (mount.dir && mount.mounts) {
                    // Look for layouts mounts
                    for (const m of mount.mounts) {
                        if (m.target === 'layouts' || m.source === 'layouts') {
                            const shortcodesDir = path.join(mount.dir, m.source || 'layouts', 'shortcodes');
                            if (fs.existsSync(shortcodesDir)) {
                                paths.push(shortcodesDir);
                            }
                        }
                    }
                }
            } catch {
                // Skip invalid JSON
            }
        }
    } catch (e) {
        logVerbose(`  Could not get Hugo mounts: ${e.message}`);
        
        // Fallback: check common locations
        const fallbackPaths = [
            path.join(hugoRoot, 'layouts', 'shortcodes'),
            path.join(hugoRoot, 'themes'),
        ];
        
        for (const p of fallbackPaths) {
            if (fs.existsSync(p)) {
                if (p.endsWith('shortcodes')) {
                    paths.push(p);
                } else if (p.endsWith('themes')) {
                    // Check each theme
                    try {
                        const themes = fs.readdirSync(p);
                        for (const theme of themes) {
                            const themePath = path.join(p, theme, 'layouts', 'shortcodes');
                            if (fs.existsSync(themePath)) {
                                paths.push(themePath);
                            }
                        }
                    } catch {}
                }
            }
        }
    }
    
    return paths;
}

// Find shortcode template file
export function findShortcodeTemplate(name, shortcodePaths) {
    for (const dir of shortcodePaths) {
        const templatePath = path.join(dir, `${name}.html`);
        if (fs.existsSync(templatePath)) {
            return templatePath;
        }
    }
    return null;
}

// Parse shortcode template to extract info
export function parseShortcodeTemplate(templatePath) {
    const content = fs.readFileSync(templatePath, 'utf-8');
    
    const info = {
        path: templatePath,
        content: content,
        hasInner: /\{\{\s*\.Inner\s*(\|[^}]*)?\}\}/.test(content),
        params: [],
    };
    
    // Find .Get "paramName" patterns
    const getRegex = /\{\{\s*\.Get\s+["'](\w+)["']\s*\}\}/g;
    let match;
    while ((match = getRegex.exec(content)) !== null) {
        if (!info.params.includes(match[1])) {
            info.params.push(match[1]);
        }
    }
    
    // Find .Get 0, .Get 1, etc. (positional params)
    const posRegex = /\{\{\s*\.Get\s+(\d+)\s*\}\}/g;
    while ((match = posRegex.exec(content)) !== null) {
        const paramName = `$${match[1]}`;
        if (!info.params.includes(paramName)) {
            info.params.push(paramName);
        }
    }
    
    return info;
}

// Suggest markdown mappings based on template HTML
export function suggestMappings(templateInfo) {
    const content = templateInfo.content.toLowerCase();
    const suggestions = [];
    
    if (templateInfo.hasInner) {
        // Templates with inner content
        if (content.includes('blockquote') || content.includes('aside') || content.includes('class="aside"')) {
            suggestions.push({ label: 'Blockquote', template: '> ${inner}' });
        }
        if (content.includes('<em>') || content.includes('<i>') || content.includes('italic')) {
            suggestions.push({ label: 'Italic', template: '*${inner}*' });
        }
        if (content.includes('<strong>') || content.includes('<b>') || content.includes('bold')) {
            suggestions.push({ label: 'Bold', template: '**${inner}**' });
        }
        suggestions.push({ label: 'Plain text (keep inner)', template: '${inner}' });
    } else {
        // Self-closing templates
        if (content.includes('hr') || content.includes('separator') || content.includes('dinkus') || content.includes('divider')) {
            suggestions.push({ label: 'Horizontal rule', template: '\n* * *\n' });
        }
        if (content.includes('youtube') || content.includes('video')) {
            suggestions.push({ label: 'YouTube link', template: 'https://youtube.com/watch?v=${id}' });
        }
        if (content.includes('<img') || content.includes('image') || content.includes('figure')) {
            suggestions.push({ label: 'Markdown image', template: '![${alt}](${src})' });
        }
        if (content.includes('<a ') || content.includes('href')) {
            suggestions.push({ label: 'Markdown link', template: '[${title}](${url})' });
        }
    }
    
    // Always add these options
    suggestions.push({ label: 'Remove entirely', template: '' });
    suggestions.push({ label: 'Custom template', template: null });
    
    return suggestions;
}

// Detect all shortcodes in content
export function detectShortcodes(content) {
    const shortcodes = [];
    let match;
    
    const regex = new RegExp(SHORTCODE_REGEX.source, 'g');
    while ((match = regex.exec(content)) !== null) {
        const name = match[1];
        const paramsStr = match[2].trim();
        const innerWithClosing = match[3];
        
        // Parse params
        const params = {};
        let paramMatch;
        const paramRegex = new RegExp(PARAM_REGEX.source, 'g');
        while ((paramMatch = paramRegex.exec(paramsStr)) !== null) {
            const key = paramMatch[1] || paramMatch[3];
            const value = paramMatch[2] || paramMatch[4];
            params[key] = value;
        }
        
        // Extract inner content if present
        let inner = null;
        if (innerWithClosing) {
            // Remove the closing tag to get just the inner content
            inner = innerWithClosing.replace(new RegExp(`\\{\\{<\\s*/${name}\\s*>\\}\\}$`), '').trim();
        }
        
        shortcodes.push({
            fullMatch: match[0],
            name,
            params,
            inner,
            hasInner: inner !== null,
        });
    }
    
    return shortcodes;
}

// Apply a mapping template to a shortcode
export function applyMapping(shortcode, mapping) {
    let result = mapping.template;
    
    // Replace ${inner}
    if (shortcode.inner !== null) {
        // For blockquotes, prefix each line
        if (result.startsWith('> ${inner}')) {
            const lines = shortcode.inner.split('\n').map(l => `> ${l}`).join('\n');
            result = result.replace('> ${inner}', lines);
        } else {
            result = result.replace(/\$\{inner\}/g, shortcode.inner);
        }
    }
    
    // Replace ${paramName}
    for (const [key, value] of Object.entries(shortcode.params)) {
        result = result.replace(new RegExp(`\\$\\{${key}\\}`, 'g'), value);
    }
    
    // Clean up any unreplaced params
    result = result.replace(/\$\{\w+\}/g, '');
    
    return result;
}

// Prompt user for a shortcode mapping
export async function promptForMapping(name, templateInfo) {
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`Unknown shortcode: {{< ${name} >}}`);
    console.log(`${'─'.repeat(60)}`);
    
    if (templateInfo) {
        console.log(`\nTemplate: ${templateInfo.path}`);
        console.log(`${'─'.repeat(60)}`);
        // Show first 10 lines of template
        const lines = templateInfo.content.split('\n').slice(0, 10);
        for (const line of lines) {
            console.log(line);
        }
        if (templateInfo.content.split('\n').length > 10) {
            console.log('...');
        }
        console.log(`${'─'.repeat(60)}`);
        console.log(`\nHas inner content: ${templateInfo.hasInner ? 'Yes' : 'No'}`);
        if (templateInfo.params.length > 0) {
            console.log(`Parameters: ${templateInfo.params.join(', ')}`);
        }
    } else {
        console.log('\nNo template found in Hugo theme.');
    }
    
    const suggestions = templateInfo ? suggestMappings(templateInfo) : [
        { label: 'Keep inner content', template: '${inner}' },
        { label: 'Remove entirely', template: '' },
        { label: 'Custom template', template: null },
    ];
    
    const choiceLabels = suggestions.map(s => s.label);
    const choice = await promptChoice('How should this convert to markdown?', choiceLabels);
    
    if (choice === null) {
        return null;  // User cancelled or non-interactive
    }
    
    const selected = suggestions[choice];
    
    if (selected.template === null) {
        // Custom template
        console.log('\nAvailable variables:');
        console.log('  ${inner} - content between opening and closing tags');
        if (templateInfo?.params.length > 0) {
            for (const p of templateInfo.params) {
                console.log(`  \${${p}} - parameter value`);
            }
        }
        
        const custom = await promptInput('Enter template');
        if (!custom) return null;
        
        return {
            hasInner: templateInfo?.hasInner || false,
            params: templateInfo?.params || [],
            template: custom,
        };
    }
    
    return {
        hasInner: templateInfo?.hasInner || false,
        params: templateInfo?.params || [],
        template: selected.template,
    };
}

// Main function: process all shortcodes in content
export async function processShortcodes(content, hugoRoot, blogUrl) {
    if (!content) return { content: '', ok: true };
    
    const shortcodes = detectShortcodes(content);
    if (shortcodes.length === 0) {
        return { content, ok: true };
    }
    
    const mappings = loadMappings();
    const siteKey = hugoRoot || 'default';
    const siteMappings = mappings[siteKey] || {};
    const shortcodePaths = getShortcodePaths(hugoRoot);
    
    let modified = false;
    let processedContent = content;
    
    // Process unique shortcode names (may appear multiple times)
    const uniqueNames = [...new Set(shortcodes.map(s => s.name))];
    
    for (const name of uniqueNames) {
        if (!siteMappings[name]) {
            // Unknown shortcode - need to prompt
            const templatePath = findShortcodeTemplate(name, shortcodePaths);
            const templateInfo = templatePath ? parseShortcodeTemplate(templatePath) : null;
            
            if (options.yes) {
                // Non-interactive mode - fail
                logError(`  ❌ Unknown shortcode '${name}' and --yes flag prevents prompting`);
                return { content: processedContent, ok: false };
            }
            
            const mapping = await promptForMapping(name, templateInfo);
            
            if (mapping === null) {
                logError(`  ❌ No mapping provided for shortcode '${name}'`);
                return { content: processedContent, ok: false };
            }
            
            // Save the mapping
            siteMappings[name] = mapping;
            mappings[siteKey] = siteMappings;
            saveMappings(mappings);
            log(`  ✅ Saved mapping for '${name}'`);
            modified = true;
        }
    }
    
    // Apply all mappings
    for (const shortcode of shortcodes) {
        const mapping = siteMappings[shortcode.name];
        if (mapping) {
            let replacement = applyMapping(shortcode, mapping);
            
            // Resolve URLs in the replacement if it contains image/link syntax
            if (blogUrl && (replacement.includes('](') || replacement.includes('!['))) {
                replacement = replacement.replace(
                    /(\[.*?\])\((?!https?:\/\/)([^)]+)\)/g,
                    (match, text, urlPath) => `${text}(${resolveUrl(urlPath, blogUrl)})`
                );
            }
            
            processedContent = processedContent.replace(shortcode.fullMatch, replacement);
        }
    }
    
    return { content: processedContent, ok: true };
}
