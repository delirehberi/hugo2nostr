import fs from "fs";
import matter from "gray-matter";
import toml from "toml";

export interface Frontmatter {
    title?: string;
    date?: string | Date;
    draft?: boolean;
    slug?: string;
    tags?: string[];
    topics?: string[];
    description?: string;
    summary?: string;
    image?: string;
    hero_image?: string;
    featured_image?: string;
    nostr_id?: string;
    nostr_image?: string;
    body?: string; // Content body
    type?: "yaml" | "toml" | "plain";
    [key: string]: any;
}

export function parseFrontmatter(content: string): Frontmatter {
    if (content.startsWith("---")) {
        const parsed = matter(content);
        return { ...parsed.data, body: parsed.content, type: "yaml" };
    } else if (content.startsWith("+++")) {
        const fmEndInfo = content.indexOf("+++", 3);
        const fm = content.substring(3, fmEndInfo);
        const body = content.substring(fmEndInfo + 3).trim();
        try {
            const data = toml.parse(fm);
            return { ...data, body, type: "toml" };
        } catch (e) {
            console.error("Failed to parse TOML frontmatter", e);
            return { body: content, type: "plain" };
        }
    } else {
        return { body: content, type: "plain" };
    }
}

export function stringifyFrontmatter(data: Frontmatter, body: string, type: "yaml" | "toml" | "plain" = "yaml"): string {
    // Create a copy and remove `body`/`type` to prevent including it in frontmatter data
    const fmData = { ...data };
    delete fmData.body;
    delete fmData.type;

    if (type === "yaml") {
        return matter.stringify(body, fmData);
    } else if (type === "toml") {
        const lines = Object.entries(fmData)
            .map(([k, v]) => {
                if (v === undefined || v === null) return '';
                if (Array.isArray(v)) {
                    const arrayContent = v.map((x) => `"${x}"`).join(", ");
                    return `${k} = [${arrayContent}]`;
                }
                if (typeof v === "string") {
                    const escaped = v.replace(/"/g, '\\"'); // escape quotes
                    return `${k} = "${escaped}"`;
                }
                if (v instanceof Date) {
                    return `${k} = "${v.toISOString()}"`;
                }
                return `${k} = ${v}`;
            })
            .filter(line => line !== '')
            .join("\n");
        return `+++\n${lines}\n+++\n\n${body}\n`;
    } else {
        return body;
    }
}

export function removeFile(file: string, verbose?: boolean): void {
    try {
        fs.unlinkSync(file);
        if (verbose) console.log(`  🗑️  Removed file: ${file}`);
    } catch (e: any) {
        console.error(`  ⚠️ Could not remove file ${file}: ${e.message}`);
    }
}

export function updateFrontmatter(file: string, updates: Partial<Frontmatter>) {
    const raw = fs.readFileSync(file, "utf-8");
    const meta = parseFrontmatter(raw);

    // Apply updates to frontmatter data
    const updatedData = { ...meta, ...updates };
    // Ensure body and type are preserved correctly for stringify
    const body = meta.body || '';
    const type = (meta.type as "yaml" | "toml" | "plain") || "yaml";

    const updatedContent = stringifyFrontmatter(updatedData, body, type);
    fs.writeFileSync(file, updatedContent, "utf-8");
}

export function normalizeTags(tags: string | string[] | undefined): string[] {
    if (!tags) return [];
    if (Array.isArray(tags)) {
        return tags.map((t) => t.replace(/^#/, "").trim()).filter(Boolean);
    }
    return tags.split(/[\s,]+/).map((t) => t.replace(/^#/, "").trim()).filter(Boolean);
}

export function normalizeDate(dateStr: string | Date | undefined): string {
    try {
        if (!dateStr) throw new Error("No date provided");
        if (dateStr instanceof Date) return dateStr.toISOString();

        // If the date is already ISO format with time, just use it
        const hasTime = /\d{2}:\d{2}/.test(dateStr);
        let d = new Date(dateStr);

        if (isNaN(d.getTime())) throw new Error("Invalid date");

        // If no time, set default 08:00
        if (!hasTime) {
            d.setHours(8, 0, 0, 0);
        }

        return d.toISOString();
    } catch {
        // console.warn(`  ⚠️ Could not parse date: ${dateStr}`);
        return new Date().toISOString();
    }
}

export function ISO2Date(isoString: string): string {
    const date = new Date(isoString);
    const tzOffset = -date.getTimezoneOffset();
    const diff = tzOffset >= 0 ? '+' : '-';
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}${diff}${pad(Math.floor(Math.abs(tzOffset) / 60))}:${pad(Math.abs(tzOffset) % 60)}`;
}

export function slugify(text: string): string {
    if (!text) return '';

    const charMap: Record<string, string> = {
        'ı': 'i', 'İ': 'i', 'I': 'i',
        'ş': 's', 'Ş': 's',
        'ğ': 'g', 'Ğ': 'g',
        'ü': 'u', 'Ü': 'u',
        'ö': 'o', 'Ö': 'o',
        'ç': 'c', 'Ç': 'c',
    };

    let str = String(text);
    for (const [key, val] of Object.entries(charMap)) {
        str = str.replaceAll(key, val);
    }

    return str
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim()
        .replace(/[^\w\s-]/g, '')
        .replace(/[\s_]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '');
}

export function isHexOrId(str: string): boolean {
    if (!str) return false;
    const clean = str.trim().toLowerCase();
    const hexPattern = /^[0-9a-f]{8,64}$/;
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
    return hexPattern.test(clean) || uuidPattern.test(clean);
}

