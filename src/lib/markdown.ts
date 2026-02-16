import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import readline from 'readline';

// --- Types ---

export interface ShortcodeMatch {
    fullMatch: string;
    name: string;
    params: Record<string, string>;
    inner: string | null;
    hasInner: boolean;
}

export interface ShortcodeTemplateInfo {
    path: string;
    content: string;
    hasInner: boolean;
    params: string[];
}

export interface ShortcodeMapping {
    hasInner: boolean;
    params: string[];
    template: string | null; // null means custom prompting needed, but in storage it should be string
}

export interface ShortcodeProcessResult {
    content: string;
    ok: boolean;
}

// --- Constants & Config ---

const CONFIG_DIR = path.join(os.homedir(), '.config', 'hugo2nostr');
const MAPPINGS_FILE = path.join(CONFIG_DIR, 'shortcodes.json');

// Regex to detect shortcodes: {{< name >}}, {{< name param="value" >}}, {{< name >}}inner{{< /name >}}
const SHORTCODE_REGEX = /\{\{<\s*(\w+)([^>]*?)>\}\}([\s\S]*?\{\{<\s*\/\1\s*>\}\})?/g;
const PARAM_REGEX = /(\w+)=["']([^"']+)["']|(\w+)=(\S+)/g;

// --- Shortcode Logic ---

export function loadMappings(): Record<string, Record<string, ShortcodeMapping>> {
    try {
        if (fs.existsSync(MAPPINGS_FILE)) {
            return JSON.parse(fs.readFileSync(MAPPINGS_FILE, 'utf-8'));
        }
    } catch (e: any) {
        // console.warn(`  Could not load shortcode mappings: ${e.message}`);
    }
    return {};
}

export function saveMappings(mappings: Record<string, Record<string, ShortcodeMapping>>) {
    try {
        if (!fs.existsSync(CONFIG_DIR)) {
            fs.mkdirSync(CONFIG_DIR, { recursive: true });
        }
        fs.writeFileSync(MAPPINGS_FILE, JSON.stringify(mappings, null, 2));
    } catch (e: any) {
        console.error(`  Could not save shortcode mappings: ${e.message}`);
    }
}

export function getShortcodePaths(hugoRoot: string | null): string[] {
    if (!hugoRoot) return [];

    const paths: string[] = [];

    try {
        const output = execSync('hugo config mounts', {
            cwd: hugoRoot,
            encoding: 'utf-8',
            stdio: ['pipe', 'pipe', 'pipe'],
        });

        // Hugo outputs pretty-printed JSON objects concatenated
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
    } catch (e: any) {
        // Fallback
        const fallbackPaths = [
            path.join(hugoRoot, 'layouts', 'shortcodes'),
            path.join(hugoRoot, 'themes'),
        ];

        for (const p of fallbackPaths) {
            if (fs.existsSync(p)) {
                if (p.endsWith('shortcodes')) {
                    paths.push(p);
                } else if (p.endsWith('themes')) {
                    try {
                        const themes = fs.readdirSync(p);
                        for (const theme of themes) {
                            const themePath = path.join(p, theme, 'layouts', 'shortcodes');
                            if (fs.existsSync(themePath)) {
                                paths.push(themePath);
                            }
                        }
                    } catch { }
                }
            }
        }
    }

    return paths;
}

export function findShortcodeTemplate(name: string, shortcodePaths: string[]): string | null {
    for (const dir of shortcodePaths) {
        const templatePath = path.join(dir, `${name}.html`);
        if (fs.existsSync(templatePath)) {
            return templatePath;
        }
    }
    return null;
}

export function parseShortcodeTemplate(templatePath: string): ShortcodeTemplateInfo {
    const content = fs.readFileSync(templatePath, 'utf-8');

    const info: ShortcodeTemplateInfo = {
        path: templatePath,
        content: content,
        hasInner: /\{\{\s*\.Inner\s*(\|[^}]*)?\}\}/.test(content),
        params: [],
    };

    // Find .Get "paramName"
    const getRegex = /\{\{\s*\.Get\s+["'](\w+)["']\s*\}\}/g;
    let match;
    while ((match = getRegex.exec(content)) !== null) {
        if (!info.params.includes(match[1])) {
            info.params.push(match[1]);
        }
    }

    // Find .Get 0, .Get 1 (positional)
    const posRegex = /\{\{\s*\.Get\s+(\d+)\s*\}\}/g;
    while ((match = posRegex.exec(content)) !== null) {
        const paramName = `$${match[1]}`;
        if (!info.params.includes(paramName)) {
            info.params.push(paramName);
        }
    }

    return info;
}

function detectShortcodes(content: string): ShortcodeMatch[] {
    const shortcodes: ShortcodeMatch[] = [];
    let match;

    const regex = new RegExp(SHORTCODE_REGEX.source, 'g');
    while ((match = regex.exec(content)) !== null) {
        const name = match[1];
        const paramsStr = match[2].trim();
        const innerWithClosing = match[3];

        const params: Record<string, string> = {};
        let paramMatch;
        const paramRegex = new RegExp(PARAM_REGEX.source, 'g');
        while ((paramMatch = paramRegex.exec(paramsStr)) !== null) {
            const key = paramMatch[1] || paramMatch[3];
            const value = paramMatch[2] || paramMatch[4];
            params[key] = value;
        }

        let inner: string | null = null;
        if (innerWithClosing) {
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

function applyMapping(shortcode: ShortcodeMatch, mapping: ShortcodeMapping): string {
    if (!mapping.template) return '';
    let result = mapping.template;

    if (shortcode.inner !== null) {
        if (result.startsWith('> ${inner}')) {
            const lines = shortcode.inner.split('\n').map(l => `> ${l}`).join('\n');
            result = result.replace('> ${inner}', lines);
        } else {
            result = result.replace(/\$\{inner\}/g, shortcode.inner);
        }
    }

    for (const [key, value] of Object.entries(shortcode.params)) {
        result = result.replace(new RegExp(`\\$\\{${key}\\}`, 'g'), value);
    }

    result = result.replace(/\$\{\w+\}/g, '');
    return result;
}

// User Interaction Helpers for Shortcodes
// Note: We need to pass readline interface or similar if we want to support interactivity cleanly.
// For now, we'll implement simple console prompts using readline.

async function promptChoice(message: string, choices: string[]): Promise<number | null> {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    console.log(`\n${message}\n`);
    choices.forEach((choice, i) => console.log(`  [${i + 1}] ${choice}`));
    console.log();

    return new Promise((resolve) => {
        rl.question(`Choice [1-${choices.length}]: `, (answer) => {
            rl.close();
            const idx = parseInt(answer, 10) - 1;
            if (idx >= 0 && idx < choices.length) resolve(idx);
            else resolve(null);
        });
    });
}

async function promptInput(message: string): Promise<string | null> {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise((resolve) => {
        rl.question(`${message}: `, (answer) => {
            rl.close();
            resolve(answer.trim() || null);
        });
    });
}

function suggestMappings(templateInfo: ShortcodeTemplateInfo): Array<{ label: string, template: string | null }> {
    const content = templateInfo.content.toLowerCase();
    const suggestions: Array<{ label: string, template: string | null }> = [];

    if (templateInfo.hasInner) {
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
        if (content.includes('hr') || content.includes('separator')) {
            suggestions.push({ label: 'Horizontal rule', template: '\n* * *\n' });
        }
        if (content.includes('youtube') || content.includes('video')) {
            suggestions.push({ label: 'YouTube link', template: 'https://youtube.com/watch?v=${id}' });
        }
        if (content.includes('<img') || content.includes('image')) {
            suggestions.push({ label: 'Markdown image', template: '![${alt}](${src})' });
        }
        if (content.includes('<a ') || content.includes('href')) {
            suggestions.push({ label: 'Markdown link', template: '[${title}](${url})' });
        }
    }

    suggestions.push({ label: 'Remove entirely', template: '' });
    suggestions.push({ label: 'Custom template', template: null });

    return suggestions;
}

export async function processShortcodes(
    content: string,
    hugoRoot: string | null,
    blogUrl: string,
    interactive: boolean = true
): Promise<ShortcodeProcessResult> {
    if (!content) return { content: '', ok: true };

    const shortcodes = detectShortcodes(content);
    if (shortcodes.length === 0) return { content, ok: true };

    const mappings = loadMappings();
    const siteKey = hugoRoot || 'default';
    const siteMappings = mappings[siteKey] || {};
    const shortcodePaths = getShortcodePaths(hugoRoot);

    let processedContent = content;
    const uniqueNames = [...new Set(shortcodes.map(s => s.name))];

    for (const name of uniqueNames) {
        if (!siteMappings[name]) {
            // Need mapping
            const templatePath = findShortcodeTemplate(name, shortcodePaths);
            const templateInfo = templatePath ? parseShortcodeTemplate(templatePath) : null;

            if (!interactive) {
                console.error(`  ❌ Unknown shortcode '${name}' and interactive mode disabled`);
                return { content: processedContent, ok: false };
            }

            console.log(`\n${'─'.repeat(60)}`);
            console.log(`Unknown shortcode: {{< ${name} >}}`);
            if (templateInfo) {
                console.log(`Template: ${templateInfo.path}`);
                console.log(`Params: ${templateInfo.params.join(', ')}`);
            } else {
                console.log('No template found in Hugo.');
            }
            console.log(`${'─'.repeat(60)}`);

            const suggestions = templateInfo ? suggestMappings(templateInfo) : [
                { label: 'Keep inner content', template: '${inner}' },
                { label: 'Remove entirely', template: '' },
                { label: 'Custom template', template: null },
            ];

            const choice = await promptChoice('How should this convert to markdown?', suggestions.map(s => s.label));
            if (choice === null) return { content: processedContent, ok: false };

            const selected = suggestions[choice];
            let template = selected.template;

            if (template === null) {
                console.log('Available vars: ${inner}' + (templateInfo?.params.map(p => ` \${${p}}`).join('') || ''));
                template = await promptInput('Enter template');
                if (template === null) return { content: processedContent, ok: false };
            }

            const mapping: ShortcodeMapping = {
                hasInner: templateInfo?.hasInner || false,
                params: templateInfo?.params || [],
                template: template
            };

            siteMappings[name] = mapping;
            mappings[siteKey] = siteMappings;
            saveMappings(mappings);
            console.log(`  ✅ Saved mapping for '${name}'`);
        }
    }

    // Apply
    for (const shortcode of shortcodes) {
        const mapping = siteMappings[shortcode.name];
        if (mapping && mapping.template !== null) {
            let replacement = applyMapping(shortcode, mapping);
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

// --- Markdown Helpers ---

export function resolveUrl(path: string, baseUrl: string): string {
    if (!path || !baseUrl) return path || "";
    if (/^https?:\/\//.test(path)) return path;
    if (path.startsWith('/')) return baseUrl.replace(/\/$/, '') + path;
    return baseUrl.replace(/\/$/, '') + '/' + path;
}

export function resolveContentUrls(content: string, baseUrl: string): string {
    if (!content || !baseUrl) return content;
    return content.replace(
        /(\[.*?\])\((?!https?:\/\/|mailto:|tel:|#)([^)]+)\)/g,
        (match, text, path) => `${text}(${resolveUrl(path, baseUrl)})`
    );
}

export function convertFootnotes(content: string): string {
    if (!content) return content;
    const superscripts = ['⁰', '¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹'];
    const toSuperscript = (num: number) => String(num).split('').map(d => superscripts[parseInt(d)]).join('');

    const footnotes: Record<string, string> = {};
    const defPattern = /^\[\^(\d+)\]:\s*(.+)$/gm;
    let match;
    while ((match = defPattern.exec(content)) !== null) {
        footnotes[match[1]] = match[2].trim();
    }
    if (Object.keys(footnotes).length === 0) return content;

    let result = content.replace(/^\[\^(\d+)\]:\s*.+$/gm, '').trim();
    result = result.replace(/\[\^(\d+)\]/g, (_, num) => toSuperscript(parseInt(num)));

    const footnoteNums = Object.keys(footnotes).sort((a, b) => parseInt(a) - parseInt(b));
    if (footnoteNums.length > 0) {
        result += '\n\n---\n\n';
        for (const num of footnoteNums) {
            result += `${toSuperscript(parseInt(num))} ${footnotes[num]}\n\n`;
        }
    }
    return result;
}

export function convertSmartPunctuation(content: string): string {
    if (!content) return content;
    let result = content;
    result = result.replace(/---/g, '\u2014');
    result = result.replace(/--/g, '\u2013');
    result = result.replace(/\.\.\./g, '\u2026');
    result = result.replace(/(^|[\s(\[{])"(\S)/gm, '$1\u201C$2');
    result = result.replace(/(\S)"([\s)\]},.:;!?\-]|$)/gm, '$1\u201D$2');
    result = result.replace(/(\w)'(\w)/g, '$1\u2019$2');
    result = result.replace(/(^|[\s(\[{])'(\S)/gm, '$1\u2018$2');
    result = result.replace(/(\S)'([\s)\]},.:;!?\-]|$)/gm, '$1\u2019$2');
    return result;
}

export function markdownToHtml(content: string): string {
    let html = content;
    html = html.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
    html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/__(.+?)__/g, '<strong>$1</strong>');
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
    html = html.replace(/_(.+?)_/g, '<em>$1</em>');
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
    html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<figure><img src="$2" alt="$1"><figcaption>$1</figcaption></figure>');
    html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');
    html = html.replace(/<\/blockquote>\n<blockquote>/g, '\n');
    html = html.replace(/^---+$/gm, '<hr>');
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code class="language-$1">$2</code></pre>');
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');

    const lines = html.split('\n\n');
    html = lines.map(block => {
        block = block.trim();
        if (!block) return '';
        if (block.startsWith('<h') || block.startsWith('<ul') ||
            block.startsWith('<blockquote') || block.startsWith('<pre') ||
            block.startsWith('<hr') || block.startsWith('<figure')) {
            return block;
        }
        return `<p>${block.replace(/\n/g, '<br>')}</p>`;
    }).join('\n\n');

    return html;
}

export function getSummary(content: string): string {
    if (!content) return "";
    const text = content.replace(/\r\n/g, "\n").trim();
    const paragraphs = text.split(/\n/);
    return paragraphs.length > 0 ? paragraphs[0].trim() : "";
}
