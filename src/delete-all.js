import fs from "fs";
import matter from "gray-matter";
import toml from "toml";
import {glob} from "glob";
import * as nip19 from 'nostr-tools/nip19'
import {deleteNote, parseFrontmatter} from "./utils.js";
import { POSTS_DIR, init} from "./init.js";

init();

function published_posts() {
    let published = { posts: [] };
    const files = glob.sync(`${POSTS_DIR}/*.md`);
    for (const file of files) {
        const raw = fs.readFileSync(file, "utf-8");
        const meta = parseFrontmatter(raw);
        const alreadyPublished = meta.nostr_id && meta.nostr_id.length === 63 && meta.nostr_id.startsWith("nevent1"); 
        if(alreadyPublished){
            published.posts.push({ 
                id: meta.nostr_id, 
                title: meta.title || "Untitled" ,
                file: file
            });
        }
    }
    return published;
}

function updateFrontmatter(file) {
    let raw = fs.readFileSync(file, "utf-8");

    function updateData(data) {
        data.nostr_id = "";
        return data;
    }
    if (raw.startsWith("---")) {
        // YAML frontmatter
        const parsed = matter(raw);
        parsed.data=updateData(parsed.data);
        const updated = matter.stringify(parsed.content, parsed.data);
        fs.writeFileSync(file, updated, "utf-8");

    } else if (raw.startsWith("+++")) {
        // TOML frontmatter
        const fm = raw.substring(3, raw.indexOf("+++", 3));
        const body = raw.substring(raw.indexOf("+++", 3) + 3).trim();

        let data = toml.parse(fm);
        data = updateData(data);

        // Reconstruct TOML + body
        let newFm = Object.entries(data)
            .map(([k, v]) => {
                if (Array.isArray(v)) return `${k} = [${v.map(x => `"${x}"`).join(", ")}]`;
                if (typeof v === "string") return `${k} = "${v}"`;
                return `${k} = ${v}`;
            })
            .join("\n");

        const updated = `+++\n${newFm}\n+++\n\n${body}\n`;
        fs.writeFileSync(file, updated, "utf-8");
    } else {
        console.warn(`⚠️ Could not update frontmatter for ${file}, unknown format`);
    }
}
// run script
export async function delete_all(){
    let published = published_posts();

    for (const post of published.posts) {
        try{
            console.log(post.id, post.title); 

            let {eventType, data}= nip19.decode(post.id);
            if(eventType !== "nevent"){
                console.error("Invalid note id", post.id);
                continue;
            }

            await deleteNote(data.id);
            //update frontMatter 
            updateFrontmatter(post.file);
            await sleep(5000);
        }catch(e){
            console.error("Error deleting post", post.id, e);
            continue;
        }
    }

    console.log("All done!");
}
