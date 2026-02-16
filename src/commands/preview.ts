import http from 'http';
import fs from 'fs';
import path from 'path';
import { glob } from 'glob';
import { ConfigManager } from '../core/config.js';
import { parseFrontmatter, normalizeDate } from '../lib/fs.js';
import {
  processShortcodes,
  resolveContentUrls,
  convertFootnotes,
  convertSmartPunctuation,
  markdownToHtml
} from '../lib/markdown.js';
// Wait, I added `normalizeTags` to `src/lib/fs.ts`, I should import it from there.
import { normalizeTags as normalizeTagsFS } from '../lib/fs.js';

// Re-assign for convenience
const normalizeTags = normalizeTagsFS;

const PORT = 3000;
const CLIENT_JS = `
<script>
  const evtSource = new EventSource("/events");
  evtSource.onmessage = function(event) {
    if (event.data === "reload") {
      location.reload();
    }
  }
</script>
`;

export async function previewCommand(configManager: ConfigManager): Promise<number> {
  const siteConfig = configManager.resolveSiteConfig();
  const postsDir = siteConfig.posts_dir;
  const hugoRoot = configManager.getHugoRoot(postsDir);
  const blogUrl = siteConfig.blog_url || '';

  if (!postsDir || !fs.existsSync(postsDir)) {
    console.error(`❌ Posts directory not found: ${postsDir}`);
    return 1;
  }

  console.log(`\n🚀 Starting preview server at http://localhost:${PORT}`);
  console.log(`   Watching ${postsDir}`);

  // Clients for SSE
  const clients: http.ServerResponse[] = [];

  const sendReload = () => {
    clients.forEach(res => res.write('data: reload\n\n'));
  };

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://localhost:${PORT}`);
    let pathname = url.pathname;

    // SSE Endpoint
    if (pathname === '/events') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      });
      res.write('\n');
      clients.push(res);
      req.on('close', () => {
        const idx = clients.indexOf(res);
        if (idx !== -1) clients.splice(idx, 1);
      });
      return;
    }

    // Static files (images)
    if (hugoRoot && pathname.match(/\.(png|jpg|jpeg|gif|svg|webp)$/)) {
      // Check static/ and assets/
      const staticPath = path.join(hugoRoot, 'static', pathname);
      const assetsPath = path.join(hugoRoot, 'assets', pathname);

      let filePath: string | null = null;
      if (fs.existsSync(staticPath)) filePath = staticPath;
      else if (fs.existsSync(assetsPath)) filePath = assetsPath;

      if (filePath) {
        const ext = path.extname(filePath).slice(1);
        res.writeHead(200, { 'Content-Type': `image/${ext === 'svg' ? 'svg+xml' : ext}` });
        fs.createReadStream(filePath).pipe(res);
        return;
      }
    }

    // List pages or Render page
    if (pathname === '/' || pathname === '/index.html') {
      const files = glob.sync(`${postsDir}/*.md`)
        .filter(f => !f.endsWith('_index.md'))
        .map(f => {
          const raw = fs.readFileSync(f, 'utf-8');
          const meta = parseFrontmatter(raw);
          const filename = path.basename(f, '.md');
          const slug = meta.slug || filename;
          return { slug, title: meta.title || filename, date: meta.date };
        })
        .sort((a, b) => new Date(normalizeDate(b.date)).getTime() - new Date(normalizeDate(a.date)).getTime());

      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(renderList(files, siteConfig.name));
      return;
    }

    // Render Post
    // pathname might be /slug/ or /slug
    const slug = pathname.replace(/^\/|\/$/g, '');
    if (slug) {
      // Find file by slug or filename
      const files = glob.sync(`${postsDir}/*.md`);
      let targetFile: string | null = null;

      for (const f of files) {
        if (path.basename(f, '.md') === slug) {
          targetFile = f;
          break;
        }
        const raw = fs.readFileSync(f, 'utf-8');
        const meta = parseFrontmatter(raw);
        if (meta.slug === slug) {
          targetFile = f;
          break;
        }
      }

      if (targetFile) {
        const raw = fs.readFileSync(targetFile, 'utf-8');
        const meta = parseFrontmatter(raw);

        // Process content
        let content = meta.body || '';
        const shortcodeResult = await processShortcodes(content, hugoRoot, blogUrl, false);
        content = shortcodeResult.content;
        content = resolveContentUrls(content, blogUrl || ''); // local preview might need handling relative URLs differently?
        // For preview, we might want to keep relative URLs working if they point to other valid routes.
        // But resolveContentUrls in markdown.ts resolves against baseUrl. 
        // If baseUrl is empty string, it might just strip slash.
        // Let's pass empty string or '/' if we want relative to root.

        content = convertFootnotes(content);
        content = convertSmartPunctuation(content);
        const html = markdownToHtml(content);

        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(renderPost(meta, html));
        return;
      }
    }

    res.writeHead(404);
    res.end('Not Found');
  });

  server.listen(PORT);

  // Watch for changes
  let fsWait: NodeJS.Timeout | null = null;
  fs.watch(postsDir, (eventType, filename) => {
    if (filename && filename.endsWith('.md')) {
      if (fsWait) return;
      fsWait = setTimeout(() => {
        fsWait = null;
        console.log(`  File changed: ${filename}, reloading...`);
        sendReload();
      }, 100);
    }
  });

  // Keep process logic simple, node will keep running until Ctrl+C
  return new Promise(() => { });
}

function renderList(posts: any[], siteName: string) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Preview - ${siteName}</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 800px; margin: 0 auto; padding: 2rem; line-height: 1.5; }
    h1 { border-bottom: 1px solid #eee; padding-bottom: 0.5rem; }
    ul { list-style: none; padding: 0; }
    li { margin: 0.5rem 0; }
    a { text-decoration: none; color: #0066cc; }
    a:hover { text-decoration: underline; }
    .date { color: #666; font-size: 0.9em; margin-right: 0.5rem; }
  </style>
  ${CLIENT_JS}
</head>
<body>
  <h1>${siteName} Preview</h1>
  <ul>
    ${posts.map(p => `
      <li>
        <span class="date">${normalizeDate(p.date || '').split('T')[0]}</span>
        <a href="/${p.slug}">${p.title}</a>
      </li>
    `).join('')}
  </ul>
</body>
</html>
    `;
}

function renderPost(meta: any, contentHtml: string) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${meta.title}</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 800px; margin: 0 auto; padding: 2rem; line-height: 1.6; color: #333; }
    img { max-width: 100%; height: auto; border-radius: 4px; }
    pre { background: #f4f4f4; padding: 1rem; overflow-x: auto; border-radius: 4px; }
    blockquote { border-left: 4px solid #ddd; margin: 0; padding-left: 1rem; color: #666; }
    hr { border: 0; border-top: 1px solid #eee; margin: 2rem 0; }
    .meta { color: #666; font-size: 0.9em; margin-bottom: 2rem; }
    h1 { margin-bottom: 0.5rem; }
  </style>
  ${CLIENT_JS}
</head>
<body>
  <header>
    <h1>${meta.title}</h1>
    <div class="meta">
      Posted on ${normalizeDate(meta.date || '').split('T')[0]}
      ${meta.tags ? `| Tags: ${normalizeTagsFS(meta.tags).join(', ')}` : ''}
    </div>
    ${meta.description ? `<p class="lead">${meta.description}</p>` : ''}
  </header>
  <hr>
  <main>
    ${contentHtml}
  </main>
</body>
</html>
    `;
}
