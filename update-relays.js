import fs from "fs";
import { glob } from "glob";
import matter from "gray-matter";
import toml from "toml";
import * as nip19 from "nostr-tools/nip19";

// CONFIG
const POSTS_DIR = process.env.POSTS_DIR || "./posts";
const RELAYS = process.env.RELAY_LIST.split(",");
console.log("Using relays:", RELAYS);

function parseFrontmatter(content) {
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

function stringifyFrontmatter(data, body, type) {
  // Create a copy and remove `body` to prevent including it in frontmatter
  const fmData = { ...data };
  delete fmData.body;

  if (type === "yaml") {
    return matter.stringify(body, fmData);
  } else if (type === "toml") {
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

function rewriteNevent(file) {
  const raw = fs.readFileSync(file, "utf-8");
  const meta = parseFrontmatter(raw);

  if (!meta.nostr_id) {
    console.log(`⚠️ No nostr_id found in ${file}, skipping`);
    return;
  }

  try {
    const decoded = nip19.decode(meta.nostr_id);
    if (decoded.type !== "nevent") {
      console.log(`⚠️ Not an nevent in ${file}, skipping`);
      return;
    }

    const newNevent = nip19.neventEncode({
      id: decoded.data.id,
      relays: RELAYS,
      kind: decoded.data.kind || 30023,
    });

    if (meta.nostr_id === newNevent) {
      console.log(`↔️ Already up to date: ${file}`);
      return;
    }

    meta.nostr_id = newNevent;
    const updated = stringifyFrontmatter(meta, meta.body, meta.type);
    fs.writeFileSync(file, updated, "utf-8");

    console.log(`✅ Updated nostr_id in ${file}`);
  } catch (err) {
    console.error(`❌ Failed to decode nostr_id in ${file}:`, err.message);
  }
}

async function main() {
  console.log(`🔄 Rewriting nevents in ${POSTS_DIR}`);
  const files = glob.sync(`${POSTS_DIR}/*.md`);
  for (const file of files) {
    rewriteNevent(file);
  }
  console.log("🎉 Done");
}

main();

