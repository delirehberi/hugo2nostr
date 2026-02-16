
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// Define mocks before imports
const mockQuestion = jest.fn();
const mockClose = jest.fn();
const mockLink = jest.fn();

const mockRl = {
    question: mockQuestion,
    close: mockClose,
    on: jest.fn(),
    setPrompt: jest.fn(),
    prompt: jest.fn(),
};

jest.unstable_mockModule('readline', () => ({
    createInterface: jest.fn().mockReturnValue(mockRl),
    default: {
        createInterface: jest.fn().mockReturnValue(mockRl)
    }
}));

jest.unstable_mockModule('fs', () => ({
    default: {
        existsSync: jest.fn().mockReturnValue(false),
        readFileSync: jest.fn(),
        writeFileSync: jest.fn(),
        mkdirSync: jest.fn(),
    },
    existsSync: jest.fn().mockReturnValue(false),
    readFileSync: jest.fn(),
    writeFileSync: jest.fn(),
    mkdirSync: jest.fn(),
    promises: {
        readFile: jest.fn(),
        writeFile: jest.fn(),
    }
}));


jest.unstable_mockModule('nostr-tools/nip19', () => ({
    decode: jest.fn().mockReturnValue({ type: 'nsec', data: new Uint8Array(32) })
}));

const { initCommand } = await import('../../commands/setup.js');
const { ConfigManager } = await import('../../core/config.js');
const fs = (await import('fs')).default;
const { createInterface } = await import('readline');

describe.skip('Setup Command', () => {
    let mockConfigManager: any;

    beforeEach(() => {
        jest.clearAllMocks();

        // Mock ConfigManager instance passed to initCommand
        mockConfigManager = {
            getPrivateKey: jest.fn(),
            savePrivateKey: jest.fn(),
            saveConfig: jest.fn(),
            config: {},
        } as unknown as typeof ConfigManager;

        (fs.existsSync as jest.Mock).mockReturnValue(false);

        // Mock stdin isTTY to false to force promptPassword to use readline fallback
        Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true });
    });

    it('should run init flow successfully', async () => {
        const answers = [
            'y', // Config overwrite? (if exists, but we mocked existsSync false so this is skipped)
            // Wait, logic says: if (fs.existsSync(CONFIG_FILE)) prompt overwrite.
            // We mocked existsSync(false). Use logic:

            // Step 1: Private Key
            // getPrivateKey returns undef?
            // "Enter your nsec"
            'nsec1start',

            // Step 2: Configure Sites
            // "Site name"
            'blog',
            // "Posts directory"
            'content/posts',
            // "Blog URL"
            '',
            // "Add another site?"
            'n',

            // Step 3: Default site (skipped if only 1 site)

            // Step 4: Relays
            // "Relays"
            '',

            // Step 5: Image Host
            // "Image host"
            '',

            // Step 6: Author ID
            // "Author ID"
            ''
        ];

        mockQuestion.mockImplementation((q: any, cb: any) => {
            const ans = answers.shift();
            console.log(`[MockQuestion] Q: "${q}" -> A: "${ans}"`);
            if (ans !== undefined) {
                cb(ans);
            } else {
                cb('');
            }
        });

        await initCommand(mockConfigManager);

        expect(mockConfigManager.savePrivateKey).toHaveBeenCalledWith('nsec1start');
        expect(mockConfigManager.saveConfig).toHaveBeenCalled();
        expect(mockConfigManager.saveConfig).toHaveBeenCalledWith(expect.objectContaining({
            sites: expect.objectContaining({
                blog: expect.objectContaining({ posts_dir: 'content/posts' })
            })
        }));
    });
});
