import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { finalizeEvent } from "nostr-tools/pure";
import * as nip19 from "nostr-tools/nip19";
import {
    parseFrontmatter,
    normalizeTags,
    normalizeDate,
    getSummary,
    resolveUrl,
    resolveContentUrls,
    log,
    logError,
} from "./utils.js";
import * as config from "./init.js";
import { processShortcodes } from "./shortcodes.js";

// Convert markdown to HTML (basic implementation)
function markdownToHtml(content) {
    let html = content;
    
    // Escape HTML
    html = html.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    
    // Headers
    html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
    
    // Bold and italic
    html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/__(.+?)__/g, '<strong>$1</strong>');
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
    html = html.replace(/_(.+?)_/g, '<em>$1</em>');
    
    // Links
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
    
    // Images
    html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<figure><img src="$2" alt="$1"><figcaption>$1</figcaption></figure>');
    
    // Blockquotes
    html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');
    // Merge consecutive blockquotes
    html = html.replace(/<\/blockquote>\n<blockquote>/g, '\n');
    
    // Horizontal rules
    html = html.replace(/^---+$/gm, '<hr>');
    
    // Code blocks
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code class="language-$1">$2</code></pre>');
    
    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    
    // Lists
    html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');
    
    // Paragraphs - wrap text blocks
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

// Generate HTML preview
function generateHtml(event, meta, previewImageUrl) {
    const tags = Object.fromEntries(event.tags.filter(t => t.length >= 2).map(t => [t[0], t[1]]));
    const allTags = event.tags.filter(t => t[0] === 't').map(t => t[1]);
    
    const title = tags.title || meta.title || 'Untitled';
    const image = previewImageUrl || tags.image || '';  // Prefer local preview URL
    const imageInEvent = tags.image || '';  // What's actually in the event
    const summary = tags.summary || '';
    const canonicalUrl = tags.r || '';
    const publishedAt = tags.published_at ? new Date(parseInt(tags.published_at) * 1000).toLocaleDateString('en-US', {
        year: 'numeric', month: 'long', day: 'numeric'
    }) : '';
    const author = tags.author || AUTHOR_ID || '';
    const npub = nip19.npubEncode(event.pubkey);
    const nevent = nip19.neventEncode({ id: event.id, kind: 30023 });
    
    const contentHtml = markdownToHtml(event.content);
    
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title} - Nostr Preview</title>
    <style>
        :root {
            --bg: #0f0f0f;
            --bg-secondary: #1a1a1a;
            --text: #e0e0e0;
            --text-muted: #888;
            --accent: #8b5cf6;
            --border: #333;
        }
        
        * { box-sizing: border-box; margin: 0; padding: 0; }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: var(--bg);
            color: var(--text);
            line-height: 1.7;
            padding: 2rem 1rem;
        }
        
        .container {
            max-width: 720px;
            margin: 0 auto;
        }
        
        .preview-badge {
            color: var(--text-muted);
            font-size: 0.7rem;
            font-weight: 500;
            letter-spacing: 0.05em;
            text-transform: uppercase;
            margin-bottom: 1.5rem;
            padding: 0.4rem 0.7rem;
            border: 1px solid var(--border);
            border-radius: 3px;
            display: inline-block;
        }
        
        .hero-image {
            width: 100%;
            max-height: 400px;
            object-fit: cover;
            border-radius: 12px;
            margin-bottom: 2rem;
        }
        
        h1 {
            font-size: 2.5rem;
            font-weight: 700;
            margin-bottom: 1rem;
            line-height: 1.2;
        }
        
        .meta {
            color: var(--text-muted);
            font-size: 0.95rem;
            margin-bottom: 1.5rem;
            display: flex;
            flex-wrap: wrap;
            gap: 1rem;
        }
        
        .meta-item {
            display: flex;
            align-items: center;
            gap: 0.4rem;
        }
        
        .canonical {
            margin-bottom: 1.5rem;
            font-size: 0.9rem;
        }
        
        .canonical a {
            color: var(--accent);
            text-decoration: none;
        }
        
        .canonical a:hover {
            text-decoration: underline;
        }
        
        .canonical.warning {
            color: #f59e0b;
            font-style: italic;
        }
        
        .tags {
            display: flex;
            flex-wrap: wrap;
            gap: 0.5rem;
            margin-bottom: 2rem;
        }
        
        .tag {
            background: var(--bg-secondary);
            border: 1px solid var(--border);
            padding: 0.3rem 0.8rem;
            border-radius: 20px;
            font-size: 0.85rem;
            color: var(--text-muted);
        }
        
        .summary {
            font-size: 1.15rem;
            color: var(--text-muted);
            border-left: 3px solid var(--accent);
            padding-left: 1rem;
            margin-bottom: 2rem;
            font-style: italic;
        }
        
        hr {
            border: none;
            border-top: 1px solid var(--border);
            margin: 2rem 0;
        }
        
        .content {
            font-size: 1.1rem;
        }
        
        .content h1, .content h2, .content h3 {
            margin-top: 2rem;
            margin-bottom: 1rem;
        }
        
        .content h2 { font-size: 1.6rem; }
        .content h3 { font-size: 1.3rem; }
        
        .content p {
            margin-bottom: 1.5rem;
        }
        
        .content a {
            color: var(--accent);
            text-decoration: none;
        }
        
        .content a:hover {
            text-decoration: underline;
        }
        
        .content blockquote {
            border-left: 3px solid var(--accent);
            padding-left: 1rem;
            margin: 1.5rem 0;
            color: var(--text-muted);
            font-style: italic;
        }
        
        .content ul, .content ol {
            margin: 1.5rem 0;
            padding-left: 2rem;
        }
        
        .content li {
            margin-bottom: 0.5rem;
        }
        
        .content pre {
            background: var(--bg-secondary);
            border: 1px solid var(--border);
            border-radius: 8px;
            padding: 1rem;
            overflow-x: auto;
            margin: 1.5rem 0;
        }
        
        .content code {
            font-family: 'SF Mono', Consolas, monospace;
            font-size: 0.9em;
        }
        
        .content p code {
            background: var(--bg-secondary);
            padding: 0.2rem 0.4rem;
            border-radius: 4px;
        }
        
        .content figure {
            margin: 2rem 0;
        }
        
        .content img {
            max-width: 100%;
            border-radius: 8px;
        }
        
        .content figcaption {
            text-align: center;
            color: var(--text-muted);
            font-size: 0.9rem;
            margin-top: 0.5rem;
        }
        
        .content strong {
            font-weight: 600;
        }
        
        .footer {
            margin-top: 3rem;
            padding-top: 2rem;
            border-top: 1px solid var(--border);
        }
        
        .event-info {
            background: var(--bg-secondary);
            border: 1px solid var(--border);
            border-radius: 8px;
            padding: 1rem;
            font-family: monospace;
            font-size: 0.8rem;
            word-break: break-all;
        }
        
        .event-info dt {
            color: var(--text-muted);
            margin-top: 0.5rem;
        }
        
        .event-info dd {
            margin-left: 0;
            margin-bottom: 0.5rem;
        }
        
        .kind-badge {
            color: var(--text-muted);
            font-size: 0.85rem;
        }
        
        .kind-badge code {
            background: var(--bg-secondary);
            padding: 0.15rem 0.4rem;
            border-radius: 3px;
            font-family: 'SF Mono', Consolas, monospace;
            font-size: 0.8rem;
            margin-right: 0.3rem;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="preview-badge">PREVIEW - Not Published</div>
        
        ${image ? `<img class="hero-image" src="${image}" alt="${title}">` : ''}
        
        <h1>${title}</h1>
        
        <div class="meta">
            ${publishedAt ? `<span class="meta-item">${publishedAt}</span>` : ''}
            ${author ? `<span class="meta-item">by ${author}</span>` : ''}
            <span class="meta-item kind-badge"><code>kind:30023</code> Long-form article</span>
        </div>
        
        ${canonicalUrl ? `<div class="canonical"><a href="${canonicalUrl}">${canonicalUrl}</a></div>` : '<div class="canonical warning">No BLOG_URL set - canonical URL will be missing</div>'}
        
        ${allTags.length > 0 ? `
        <div class="tags">
            ${allTags.map(t => `<span class="tag">#${t}</span>`).join('')}
        </div>
        ` : ''}
        
        ${summary ? `<div class="summary">${summary}</div>` : ''}
        
        <hr>
        
        <div class="content">
            ${contentHtml}
        </div>
        
        <div class="footer">
            <h3>Event Details</h3>
            <dl class="event-info">
                <dt>Event ID</dt>
                <dd>${event.id}</dd>
                <dt>d-tag (slug)</dt>
                <dd>${tags.d || ''}</dd>
                <dt>Canonical URL (r tag)</dt>
                <dd>${canonicalUrl || '<span style="color:#f59e0b">NOT SET - add BLOG_URL to .env</span>'}</dd>
                <dt>Author pubkey</dt>
                <dd>${npub}</dd>
                <dt>nevent</dt>
                <dd>${nevent}</dd>
                <dt>Image URL (image tag)</dt>
                <dd>${imageInEvent || '<span style="color:#f59e0b">NOT SET</span>'}</dd>
                <dt>created_at</dt>
                <dd>${new Date(event.created_at * 1000).toISOString()}</dd>
                <dt>Content length</dt>
                <dd>${event.content.length.toLocaleString()} characters</dd>
            </dl>
        </div>
    </div>
</body>
</html>`;
}

export async function preview(targetFile) {
    config.init();
    const { POSTS_DIR, BLOG_URL, AUTHOR_ID, AUTHOR_PRIVATE_KEY, HUGO_ROOT } = config;
    
    if (!targetFile) {
        logError("Usage: hugo2nostr preview <file.md>");
        logError("  Provide a path to a Hugo post to preview");
        return 1;
    }
    
    // Resolve file path
    let filePath = targetFile;
    if (!path.isAbsolute(filePath)) {
        // Try relative to POSTS_DIR first
        const inPostsDir = path.join(POSTS_DIR, targetFile);
        if (fs.existsSync(inPostsDir)) {
            filePath = inPostsDir;
        } else if (!fs.existsSync(filePath)) {
            // Try with .md extension
            const withExt = targetFile.endsWith('.md') ? targetFile : `${targetFile}.md`;
            const inPostsDirWithExt = path.join(POSTS_DIR, withExt);
            if (fs.existsSync(inPostsDirWithExt)) {
                filePath = inPostsDirWithExt;
            } else {
                logError(`File not found: ${targetFile}`);
                logError(`  Checked: ${inPostsDir}`);
                logError(`  Checked: ${inPostsDirWithExt}`);
                return 1;
            }
        }
    }
    
    if (!fs.existsSync(filePath)) {
        logError(`File not found: ${filePath}`);
        return 1;
    }
    
    log(`Generating preview for: ${filePath}`);
    
    const raw = fs.readFileSync(filePath, "utf-8");
    const meta = parseFrontmatter(raw);
    const title = meta.title || "Untitled";
    
    // Extract metadata
    const filename = path.basename(filePath, '.md');
    const slug = meta.slug || filename;
    const heroImage = meta.hero_image || meta.image || meta.featured_image;
    
    // Resolve image URL - for preview, always try local files first
    let imageUrl = null;
    let imageUrlForEvent = null;  // The URL that will go in the actual event
    if (heroImage) {
        if (heroImage.startsWith('http://') || heroImage.startsWith('https://')) {
            imageUrl = heroImage;
            imageUrlForEvent = heroImage;
        } else {
            // For the event, use BLOG_URL if available
            if (BLOG_URL) {
                imageUrlForEvent = resolveUrl(heroImage, BLOG_URL);
            }
            // For preview display, try to find local file
            if (HUGO_ROOT) {
                const staticPath = path.join(HUGO_ROOT, 'static', heroImage);
                const assetsPath = path.join(HUGO_ROOT, 'assets', heroImage);
                if (fs.existsSync(staticPath)) {
                    imageUrl = `file://${staticPath}`;
                } else if (fs.existsSync(assetsPath)) {
                    imageUrl = `file://${assetsPath}`;
                }
            }
            // Fallback to event URL if no local file found
            if (!imageUrl) {
                imageUrl = imageUrlForEvent;
            }
        }
    }
    
    // Merge tags and topics
    const allTags = [
        ...normalizeTags(meta.tags),
        ...normalizeTags(meta.topics),
    ].filter((v, i, a) => a.indexOf(v) === i);
    
    const summary = meta.summary || meta.description || "";
    
    // Process content
    let content = meta.body || "";
    content = content.replace(/<!--more-->/g, "").trim();
    
    // Process shortcodes
    const shortcodeResult = await processShortcodes(content, HUGO_ROOT, BLOG_URL);
    if (!shortcodeResult.ok) {
        logError("Failed to process shortcodes");
        return 1;
    }
    content = shortcodeResult.content;
    
    // Resolve URLs
    content = resolveContentUrls(content, BLOG_URL);
    
    const finalSummary = summary || getSummary(content);
    
    // Timestamps
    const now = Math.floor(Date.now() / 1000);
    const publishedAt = Math.floor(new Date(normalizeDate(meta.date)).getTime() / 1000);
    
    // Build canonical URL
    const canonicalUrl = BLOG_URL ? `${BLOG_URL.replace(/\/$/, '')}/${slug}/` : null;

    // Build tags array
    const tagsArray = [
        ["d", slug],
        ["title", title],
    ];
    
    if (AUTHOR_ID) {
        tagsArray.push(["author", AUTHOR_ID]);
    }
    
    if (canonicalUrl) {
        tagsArray.push(["r", canonicalUrl]);
    }
    
    if (imageUrlForEvent || imageUrl) {
        tagsArray.push(["image", imageUrlForEvent || imageUrl]);
    }
    
    if (finalSummary) {
        tagsArray.push(["summary", finalSummary]);
    }
    
    tagsArray.push(["published_at", String(publishedAt)]);
    
    for (const tag of allTags) {
        tagsArray.push(["t", tag]);
    }
    
    const nostrEvent = {
        kind: 30023,
        created_at: now,
        tags: tagsArray,
        content,
    };
    const signedEvent = finalizeEvent(nostrEvent, AUTHOR_PRIVATE_KEY);
    
    // Generate HTML (pass local image URL for preview display)
    const html = generateHtml(signedEvent, meta, imageUrl);
    
    // Write to temp file
    const previewPath = path.join('/tmp', `nostr-preview-${slug}.html`);
    fs.writeFileSync(previewPath, html);
    
    log(`Preview saved to: ${previewPath}`);
    
    // Open in browser
    try {
        const cmd = process.platform === 'darwin' ? 'open' : 'xdg-open';
        execSync(`${cmd} "${previewPath}"`, { stdio: 'ignore' });
        log(`Opened in browser`);
    } catch {
        log(`Open manually: file://${previewPath}`);
    }
    
    return 0;
}
