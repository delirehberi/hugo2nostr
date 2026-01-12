import { finalizeEvent } from "nostr-tools/pure";
import matter from "gray-matter"; 
import toml from "toml";
import fs from "fs";
import path from "path";
import readline from "readline";
import { RELAYS, AUTHOR_PRIVATE_KEY, getPool, options, IMAGE_HOST } from "./init.js";

// Logging helpers that respect quiet/verbose modes
export function log(msg) {
    if (!options.quiet) console.log(msg);
}

export function logVerbose(msg) {
    if (options.verbose) console.log(msg);
}

export function logError(msg) {
    console.error(msg);
}

// Confirmation prompt
export async function confirm(message) {
    if (options.yes) return true;
    
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    
    return new Promise((resolve) => {
        rl.question(`${message} [y/N] `, (answer) => {
            rl.close();
            resolve(answer.toLowerCase() === 'y');
        });
    });
}

//convert iso to "2013-10-15T14:39:55-04:00"
export function ISO2Date(isoString) {
    const date = new Date(isoString);
    const tzOffset = -date.getTimezoneOffset();
    const diff = tzOffset >= 0 ? '+' : '-';
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}${diff}${pad(Math.floor(Math.abs(tzOffset) / 60))}:${pad(Math.abs(tzOffset) % 60)}`;
}

export function parseFrontmatter(content) {
  if (content.startsWith("---")) {
    const parsed = matter(content);
    return { ...parsed.data, body: parsed.content, type: "yaml" };
  } else if (content.startsWith("+++")) {
    const fm = content.substring(3, content.indexOf("+++", 3));
    const body = content.substring(content.indexOf("+++", 3) + 3).trim();
    const data = toml.parse(fm);
    return { ...data, body, type: "toml" };
  } else {
    return { body: content, type: "plain" };
  }
}

export function normalizeTags(tags) {
  if (!tags) return [];

  if (Array.isArray(tags)) {
    // Hugo sometimes parses YAML/TOML arrays automatically
    return tags.map((t) => t.replace(/^#/, "").trim()).filter(Boolean);
  }

  // Split by commas or spaces (one or more)
  return tags
    .split(/[\s,]+/)
    .map((t) => t.replace(/^#/, "").trim())
    .filter(Boolean);
}

export function normalizeDate(dateStr) {
    try {
        if (!dateStr) throw new Error("No date provided");

        // If the date is already ISO format with time, just use it
        const hasTime = /\d{2}:\d{2}/.test(dateStr);
        let d = new Date(dateStr);

        if (isNaN(d)) throw new Error("Invalid date");

        // If no time, set default 08:00
        if (!hasTime) {
            d.setHours(8, 0, 0, 0);
        }

        return d.toISOString();
    } catch {
        logVerbose(`  ⚠️ Could not parse date: ${dateStr}`);
        return new Date().toISOString();
    }
}
// Publish to a single relay with retry on rate limit
async function publishToRelayWithRetry(pool, relay, event, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            await pool.publish([relay], event)[0];
            logVerbose(`  ✅ Accepted by ${relay}`);
            return { relay, success: true };
        } catch (err) {
            const errMsg = err.message || String(err);
            const isRateLimited = errMsg.toLowerCase().includes('rate');
            
            if (isRateLimited && attempt < maxRetries) {
                const delay = attempt * 5000; // 5s, 10s, 15s
                logVerbose(`  ⏳ Rate limited by ${relay}, waiting ${delay/1000}s (attempt ${attempt}/${maxRetries})`);
                await sleep(delay);
            } else {
                logVerbose(`  ⚠️ Rejected by ${relay}: ${errMsg}`);
                return { relay, success: false, error: errMsg };
            }
        }
    }
    return { relay, success: false, error: 'Max retries exceeded' };
}

export async function publishToNostr(event) {
    const pool = getPool();
    
    try {
        const results = await Promise.all(
            RELAYS.map(relay => publishToRelayWithRetry(pool, relay, event))
        );
        
        const accepted = results.filter(r => r.success).length;
        const successRelays = results.filter(r => r.success).map(r => r.relay);
        
        if (accepted > 0) {
            log(`  ✅ Published to ${accepted}/${RELAYS.length} relays`);
        } else {
            logError(`  ❌ Failed to publish to any relay`);
        }
        
        return successRelays;
    } catch (err) {
        logError(`  ❌ Publish error: ${err.message || err}`);
        return [];
    }
}

export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
export function getSummary(content) {
  if (!content) return "";

  // Normalize line endings
  const text = content.replace(/\r\n/g, "\n").trim();

  // Split by blank lines
  const paragraphs = text.split(/\n/);

  // Return the first non-empty paragraph
  return paragraphs.length > 0 ? paragraphs[0].trim() : "";
}

export function removeFile(file) {
  try {
    fs.unlinkSync(file);
    logVerbose(`  🗑️  Removed file: ${file}`);
  } catch (e) {
    logError(`  ⚠️ Could not remove file ${file}: ${e.message}`);
  }
}

export function updateFrontmatter(file, updates) {
  const raw = fs.readFileSync(file, "utf-8");
  const meta = parseFrontmatter(raw);
  
  // Apply updates to frontmatter data
  const updatedData = { ...meta, ...updates };
  delete updatedData.body;
  delete updatedData.type;
  
  const updated = stringifyFrontmatter(updatedData, meta.body, meta.type);
  fs.writeFileSync(file, updated, "utf-8");
}

export function stringifyFrontmatter(data, body, type) {
  // Create a copy and remove `body` to prevent including it in frontmatter
  const fmData = { ...data };
  delete fmData.body;

  if (type === "yaml") {
    delete fmData.type;
    return matter.stringify(body, fmData);
  } else if (type === "toml") {
    delete fmData.type;
    let newFm = Object.entries(fmData)
      .map(([k, v]) => {
        if (Array.isArray(v)) return `${k} = [${v.map((x) => `"${x}"`).join(", ")}]`;
        if (typeof v === "string") {
          const escaped = v.replace(/"/g, '\\"'); // escape quotes
          return `${k} = "${escaped}"`;
        }
        return `${k} = ${v}`;
      })
      .join("\n");
    return `+++\n${newFm}\n+++\n\n${body}\n`;
  } else {
    return body;
  }
}

export async function deleteNote(noteId) {
    const deleteEvent = {
        kind: 5, // deletion event
        created_at: Math.floor(Date.now() / 1000),
        tags: [["e", noteId]],
        content: ""
    };

    const signedEvent = finalizeEvent(deleteEvent, AUTHOR_PRIVATE_KEY);
    return await publishToNostr(signedEvent);
}

// Resolve a relative path to a full URL
export function resolveUrl(path, baseUrl) {
    if (!path || !baseUrl) return path || "";
    if (/^https?:\/\//.test(path)) return path;  // already absolute
    if (path.startsWith('/')) return baseUrl + path;
    return baseUrl + '/' + path;
}

// Resolve relative URLs in markdown content (links and images)
export function resolveContentUrls(content, baseUrl) {
    if (content == null) return content;
    if (!content || !baseUrl) return content;
    
    // Match markdown links and images with relative paths
    // [text](path) or ![alt](path)
    // Skip: absolute URLs (http/https), mailto:, tel:, anchors (#)
    return content.replace(
        /(\[.*?\])\((?!https?:\/\/|mailto:|tel:|#)([^)]+)\)/g,
        (match, text, path) => `${text}(${resolveUrl(path, baseUrl)})`
    );
}

// Convert markdown footnotes to superscript format
// [^1] references become ¹, and [^1]: definitions become a Footnotes section
export function convertFootnotes(content) {
    if (!content) return content;
    
    const superscripts = ['⁰', '¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹'];
    
    // Convert number to superscript
    const toSuperscript = (num) => {
        return String(num).split('').map(d => superscripts[parseInt(d)]).join('');
    };
    
    // Extract footnote definitions [^n]: text
    const footnotes = {};
    const defPattern = /^\[\^(\d+)\]:\s*(.+)$/gm;
    let match;
    while ((match = defPattern.exec(content)) !== null) {
        footnotes[match[1]] = match[2].trim();
    }
    
    // If no footnotes, return unchanged
    if (Object.keys(footnotes).length === 0) return content;
    
    // Remove footnote definitions from content
    let result = content.replace(/^\[\^(\d+)\]:\s*.+$/gm, '').trim();
    
    // Replace inline references [^n] with superscript
    result = result.replace(/\[\^(\d+)\]/g, (_, num) => toSuperscript(parseInt(num)));
    
    // Build footnotes section
    const footnoteNums = Object.keys(footnotes).sort((a, b) => parseInt(a) - parseInt(b));
    if (footnoteNums.length > 0) {
        result += '\n\n---\n\n';
        for (const num of footnoteNums) {
            result += `${toSuperscript(parseInt(num))} ${footnotes[num]}\n\n`;
        }
        result = result.trim();
    }
    
    return result;
}

// Interactive prompt with options
export async function promptChoice(message, choices) {
    if (options.yes) return null;  // Can't prompt in non-interactive mode
    
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    
    console.log(`\n${message}\n`);
    choices.forEach((choice, i) => {
        console.log(`  [${i + 1}] ${choice}`);
    });
    console.log();
    
    return new Promise((resolve) => {
        rl.question(`Choice [1-${choices.length}]: `, (answer) => {
            rl.close();
            const idx = parseInt(answer, 10) - 1;
            if (idx >= 0 && idx < choices.length) {
                resolve(idx);
            } else {
                resolve(null);
            }
        });
    });
}

// Interactive prompt for custom input
export async function promptInput(message) {
    if (options.yes) return null;
    
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    
    return new Promise((resolve) => {
        rl.question(`${message}: `, (answer) => {
            rl.close();
            resolve(answer.trim() || null);
        });
    });
}

// Create NIP-98 auth header for HTTP requests
function createNip98Auth(url, method, privateKey) {
    const event = {
        kind: 27235,
        created_at: Math.floor(Date.now() / 1000),
        tags: [
            ['u', url],
            ['method', method],
        ],
        content: '',
    };
    const signedEvent = finalizeEvent(event, privateKey);
    return 'Nostr ' + btoa(JSON.stringify(signedEvent));
}

// Read Hugo config and extract params (supports toml, yaml, json)
export function getHugoParams(hugoRoot) {
    if (!hugoRoot) return {};
    
    const configFiles = ['hugo.toml', 'hugo.yaml', 'hugo.json', 'config.toml', 'config.yaml', 'config.json'];
    
    for (const configFile of configFiles) {
        const configPath = path.join(hugoRoot, configFile);
        if (!fs.existsSync(configPath)) continue;
        
        try {
            const content = fs.readFileSync(configPath, 'utf-8');
            
            // For TOML, just extract [params] section with regex (avoids parser issues with dotted keys)
            if (configFile.endsWith('.toml')) {
                const params = {};
                // Match [params] section until next section or EOF
                const paramsMatch = content.match(/\[params\]([\s\S]*?)(?=\n\[|$)/);
                if (paramsMatch) {
                    const paramsSection = paramsMatch[1];
                    // Extract simple key = "value" pairs
                    const kvMatches = paramsSection.matchAll(/^\s*(\w+)\s*=\s*"([^"]+)"/gm);
                    for (const match of kvMatches) {
                        params[match[1]] = match[2];
                    }
                }
                return params;
            } else if (configFile.endsWith('.yaml')) {
                // gray-matter can parse yaml
                const config = matter(`---\n${content}\n---`).data;
                return config.params || {};
            } else {
                const config = JSON.parse(content);
                return config.params || {};
            }
        } catch (e) {
            logVerbose(`  Could not parse ${configFile}: ${e.message}`);
        }
    }
    
    return {};
}

// Upload image to configured host (default: nostr.build)
export async function uploadImage(filePath) {
    if (!fs.existsSync(filePath)) {
        logError(`  Image not found: ${filePath}`);
        return null;
    }
    
    const filename = path.basename(filePath);
    const fileBuffer = fs.readFileSync(filePath);
    const blob = new Blob([fileBuffer]);
    
    const formData = new FormData();
    formData.append('file', blob, filename);
    
    // Determine API endpoint based on IMAGE_HOST
    let apiUrl;
    if (IMAGE_HOST === 'nostr.build' || !IMAGE_HOST) {
        apiUrl = 'https://nostr.build/api/v2/upload/files';
    } else if (IMAGE_HOST.startsWith('http')) {
        apiUrl = IMAGE_HOST;
    } else {
        apiUrl = `https://${IMAGE_HOST}/api/v2/upload/files`;
    }
    
    try {
        logVerbose(`  Uploading ${filename} to ${IMAGE_HOST}...`);
        
        // Create NIP-98 auth header
        const authHeader = createNip98Auth(apiUrl, 'POST', AUTHOR_PRIVATE_KEY);
        
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Authorization': authHeader,
            },
            body: formData,
        });
        
        if (!response.ok) {
            logError(`  Upload failed: ${response.status} ${response.statusText}`);
            return null;
        }
        
        const result = await response.json();
        
        if (result.status === 'success' && result.data?.[0]?.url) {
            const url = result.data[0].url;
            logVerbose(`  Uploaded: ${url}`);
            return url;
        } else {
            logError(`  Upload failed: ${result.message || 'Unknown error'}`);
            return null;
        }
    } catch (e) {
        logError(`  Upload error: ${e.message}`);
        return null;
    }
}
