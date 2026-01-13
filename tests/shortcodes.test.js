// Mock fs before imports
jest.mock("fs", () => ({
    existsSync: jest.fn(),
    readFileSync: jest.fn(),
    writeFileSync: jest.fn(),
    mkdirSync: jest.fn(),
}));

jest.mock("child_process", () => ({
    execSync: jest.fn(),
}));

jest.mock("../src/init.js", () => ({
    HUGO_ROOT: "/mock/hugo/root",
    options: { verbose: false, quiet: true, yes: false },
}));

jest.mock("../src/utils.js", () => ({
    log: jest.fn(),
    logVerbose: jest.fn(),
    logError: jest.fn(),
    promptChoice: jest.fn(),
    promptInput: jest.fn(),
    resolveUrl: (path, base) => {
        if (!path || !base) return path || "";
        if (/^https?:\/\//.test(path)) return path;
        if (path.startsWith('/')) return base + path;
        return base + '/' + path;
    },
}));

import fs from "fs";
import { execSync } from "child_process";
import * as shortcodes from "../src/shortcodes.js";

describe("shortcodes.js functions", () => {

    beforeEach(() => {
        jest.clearAllMocks();
    });

    // ---- detectShortcodes ----
    describe("detectShortcodes", () => {
        test("detects self-closing shortcode", () => {
            const content = "Text {{< dinkus >}} more text";
            const result = shortcodes.detectShortcodes(content);
            expect(result).toHaveLength(1);
            expect(result[0].name).toBe("dinkus");
            expect(result[0].hasInner).toBe(false);
        });

        test("detects block shortcode with inner content", () => {
            const content = "Text {{< aside >}}inner content{{< /aside >}} more";
            const result = shortcodes.detectShortcodes(content);
            expect(result).toHaveLength(1);
            expect(result[0].name).toBe("aside");
            expect(result[0].hasInner).toBe(true);
            expect(result[0].inner).toBe("inner content");
        });

        test("detects shortcode with parameters", () => {
            const content = '{{< youtube id="abc123" title="My Video" >}}';
            const result = shortcodes.detectShortcodes(content);
            expect(result).toHaveLength(1);
            expect(result[0].name).toBe("youtube");
            expect(result[0].params).toEqual({ id: "abc123", title: "My Video" });
        });

        test("detects multiple shortcodes", () => {
            const content = "{{< dinkus >}} text {{< aside >}}note{{< /aside >}}";
            const result = shortcodes.detectShortcodes(content);
            expect(result).toHaveLength(2);
            expect(result[0].name).toBe("dinkus");
            expect(result[1].name).toBe("aside");
        });

        test("returns empty array for no shortcodes", () => {
            const content = "Just regular markdown content";
            const result = shortcodes.detectShortcodes(content);
            expect(result).toHaveLength(0);
        });
    });

    // ---- parseShortcodeTemplate ----
    describe("parseShortcodeTemplate", () => {
        test("detects .Inner usage", () => {
            fs.readFileSync.mockReturnValue('<p class="aside">{{ .Inner | markdownify }}</p>');
            const result = shortcodes.parseShortcodeTemplate("/path/to/aside.html");
            expect(result.hasInner).toBe(true);
        });

        test("detects .Get param usage", () => {
            fs.readFileSync.mockReturnValue('<img src="{{ .Get "src" }}" alt="{{ .Get "alt" }}">');
            const result = shortcodes.parseShortcodeTemplate("/path/to/image.html");
            expect(result.params).toContain("src");
            expect(result.params).toContain("alt");
        });

        test("detects positional params", () => {
            fs.readFileSync.mockReturnValue('<a href="{{ .Get 0 }}">{{ .Get 1 }}</a>');
            const result = shortcodes.parseShortcodeTemplate("/path/to/link.html");
            expect(result.params).toContain("$0");
            expect(result.params).toContain("$1");
        });

        test("returns path and content", () => {
            const templateContent = '<div>test</div>';
            fs.readFileSync.mockReturnValue(templateContent);
            const result = shortcodes.parseShortcodeTemplate("/path/to/test.html");
            expect(result.path).toBe("/path/to/test.html");
            expect(result.content).toBe(templateContent);
        });
    });

    // ---- suggestMappings ----
    describe("suggestMappings", () => {
        test("suggests blockquote for aside-like templates", () => {
            const info = { hasInner: true, content: '<p class="aside">{{ .Inner }}</p>', params: [] };
            const suggestions = shortcodes.suggestMappings(info);
            expect(suggestions.some(s => s.label === "Blockquote")).toBe(true);
        });

        test("suggests horizontal rule for separator templates", () => {
            const info = { hasInner: false, content: '<div class="dinkus"></div>', params: [] };
            const suggestions = shortcodes.suggestMappings(info);
            expect(suggestions.some(s => s.label === "Horizontal rule")).toBe(true);
        });

        test("always includes remove and custom options", () => {
            const info = { hasInner: false, content: '<div>unknown</div>', params: [] };
            const suggestions = shortcodes.suggestMappings(info);
            expect(suggestions.some(s => s.label === "Remove entirely")).toBe(true);
            expect(suggestions.some(s => s.label === "Custom template")).toBe(true);
        });
    });

    // ---- applyMapping ----
    describe("applyMapping", () => {
        test("replaces ${inner} with shortcode inner content", () => {
            const shortcode = { inner: "my note", params: {} };
            const mapping = { template: "> ${inner}" };
            const result = shortcodes.applyMapping(shortcode, mapping);
            expect(result).toBe("> my note");
        });

        test("handles multiline inner content for blockquotes", () => {
            const shortcode = { inner: "line 1\nline 2", params: {} };
            const mapping = { template: "> ${inner}" };
            const result = shortcodes.applyMapping(shortcode, mapping);
            expect(result).toBe("> line 1\n> line 2");
        });

        test("replaces ${param} with parameter values", () => {
            const shortcode = { inner: null, params: { id: "abc123" } };
            const mapping = { template: "https://youtube.com/watch?v=${id}" };
            const result = shortcodes.applyMapping(shortcode, mapping);
            expect(result).toBe("https://youtube.com/watch?v=abc123");
        });

        test("removes unreplaced params", () => {
            const shortcode = { inner: null, params: { src: "/img.png" } };
            const mapping = { template: "![${alt}](${src})" };
            const result = shortcodes.applyMapping(shortcode, mapping);
            expect(result).toBe("![](/img.png)");
        });

        test("handles empty template (removal)", () => {
            const shortcode = { inner: "some content", params: {} };
            const mapping = { template: "" };
            const result = shortcodes.applyMapping(shortcode, mapping);
            expect(result).toBe("");
        });
    });

    // ---- loadMappings / saveMappings ----
    describe("loadMappings", () => {
        test("returns empty object if file doesn't exist", () => {
            fs.existsSync.mockReturnValue(false);
            const result = shortcodes.loadMappings();
            expect(result).toEqual({});
        });

        test("parses JSON file if it exists", () => {
            fs.existsSync.mockReturnValue(true);
            fs.readFileSync.mockReturnValue('{"site": {"aside": {"template": "> ${inner}"}}}');
            const result = shortcodes.loadMappings();
            expect(result.site.aside.template).toBe("> ${inner}");
        });
    });

    // ---- getShortcodePaths ----
    describe("getShortcodePaths", () => {
        test("returns empty array if no hugo root", () => {
            const result = shortcodes.getShortcodePaths(null);
            expect(result).toEqual([]);
        });

        test("parses hugo config mounts output", () => {
            execSync.mockReturnValue(JSON.stringify({
                dir: "/home/user/site",
                mounts: [{ source: "layouts", target: "layouts" }]
            }));
            fs.existsSync.mockReturnValue(true);
            
            const result = shortcodes.getShortcodePaths("/home/user/site");
            // Should attempt to find shortcodes dir
            expect(execSync).toHaveBeenCalled();
        });
    });
});
