
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockReadFileSync = jest.fn();
const mockExistsSync = jest.fn();
const mockExecSync = jest.fn();

jest.unstable_mockModule('fs', () => ({
    readFileSync: mockReadFileSync,
    existsSync: mockExistsSync,
    default: {
        readFileSync: mockReadFileSync,
        existsSync: mockExistsSync,
    }
}));

jest.unstable_mockModule('child_process', () => ({
    execSync: mockExecSync,
    default: {
        execSync: mockExecSync
    }
}));

jest.unstable_mockModule('os', () => ({
    homedir: () => '/home/user',
    default: {
        homedir: () => '/home/user'
    }
}));

const {
    processShortcodes,
    resolveContentUrls,
    convertFootnotes,
    markdownToHtml
} = await import('../../lib/markdown.js');

describe('Markdown Library', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockReadFileSync.mockReset();
        mockExistsSync.mockReset();
        mockExecSync.mockReset();
    });

    describe('resolveContentUrls', () => {
        it('should resolve relative URLs', () => {
            const content = '[Link](/post/1)';
            const baseUrl = 'https://example.com';
            const result = resolveContentUrls(content, baseUrl);
            expect(result).toContain('(https://example.com/post/1)');
        });
    });

    describe('processShortcodes', () => {
        it('should replace figure shortcode with image markdown', async () => {
            const content = '{{< figure src="img.jpg" title="Title" >}}';

            mockExistsSync.mockReturnValue(true);
            mockReadFileSync.mockReturnValue(JSON.stringify({
                'default': {
                    'figure': { template: '![${title}](${src})', hasInner: false, params: ['src', 'title'] }
                }
            }));
            mockExecSync.mockReturnValue('');

            const result = await processShortcodes(content, null, 'https://blog.com', false);
            expect(result.content).toContain('![Title](https://blog.com/img.jpg)');
        });

        it('should replace youtube shortcode', async () => {
            const content = '{{< youtube id="id123" >}}';

            mockExistsSync.mockReturnValue(true);
            mockReadFileSync.mockReturnValue(JSON.stringify({
                'default': {
                    'youtube': { template: 'https://youtu.be/${id}', hasInner: false, params: ['id'] }
                }
            }));

            const result = await processShortcodes(content, null, '', false);
            expect(result.content).toContain('https://youtu.be/id123');
        });
    });

    describe('convertFootnotes', () => {
        it('should convert footnotes', () => {
            const content = 'Text[^1]\n\n[^1]: Footnote';
            const result = convertFootnotes(content);
            expect(result).not.toContain('[^1]:');
            expect(result).toContain('Footnote');
        });
    });

    describe('markdownToHtml', () => {
        it('should convert markdown to html', () => {
            const content = '# Title\n\nBold **text**';
            const html = markdownToHtml(content);
            expect(html).toContain('<h1>Title</h1>');
            expect(html).toContain('<strong>text</strong>');
        });
    });
});
