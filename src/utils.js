import {SimplePool} from "nostr-tools/pool";
import matter from "gray-matter"; 
import toml from "toml";
import fs from "fs";

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

export  function normalizeDate(dateStr) {
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
        console.warn("⚠️ Could not parse date:", dateStr);
        return new Date().toISOString();
    }
}
export async function publishToNostr(event) {
    try{
        await sleep(4000);
        const pool = new SimplePool();
        pool.trackRelays = true;
        await Promise.all(pool.publish(RELAYS,event).map(async (promise) => {
            try {
                await promise;
                console.log(`✅ Event ${event.id} accepted by relay`);
            } catch (err) {
                console.warn(`⚠️ Event ${event.id} rejected by relay:`, err);
            }     
        }));
        let seenon = pool.seenOn.get(event.id);//Set<AbstractRelay>
        let relays = [];
        for (const r of seenon.values()) {
            relays.push(r.url);
            console.log(`✅ Event seen on relay: ${r.url}`);
        }
        console.log(`Event sent to all relays via SimplePool.`);
        return relays;
    }catch(err){
        console.log(err);
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
    console.log(`🗑️  Removed file: ${file}`);
  } catch (e) {
    console.error(`⚠️ Could not remove file ${file}:`, e);
  }
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
    publishToNostr(signedEvent);
}
