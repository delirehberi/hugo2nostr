
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockExistsSync = jest.fn();
const mockReadFileSync = jest.fn();
const mockParse = jest.fn();
const mockStringify = jest.fn();

jest.unstable_mockModule('fs', () => ({
    existsSync: mockExistsSync,
    readFileSync: mockReadFileSync,
    default: {
        existsSync: mockExistsSync,
        readFileSync: mockReadFileSync,
    }
}));

jest.unstable_mockModule('yaml', () => ({
    parse: mockParse,
    stringify: mockStringify,
    default: {
        parse: mockParse,
        stringify: mockStringify
    }
}));

jest.unstable_mockModule('os', () => ({
    homedir: () => '/home/test',
    default: {
        homedir: () => '/home/test'
    }
}));

const { ConfigManager } = await import('../../core/config.js');
const { readFileSync, existsSync } = await import('fs');
const yaml = (await import('yaml')).default;

describe('ConfigManager', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should load config from file if exists', () => {
        const configData = { relays: ['wss://test.com'] };
        mockExistsSync.mockReturnValue(true);
        mockReadFileSync.mockReturnValue('yaml content');
        mockParse.mockReturnValue(configData);

        const cm = new ConfigManager();

        expect(cm.config.relays).toContain('wss://test.com');
        expect(mockReadFileSync).toHaveBeenCalled();
        expect(mockParse).toHaveBeenCalledWith('yaml content');
    });

    it('should use default config if file missing', () => {
        mockExistsSync.mockReturnValue(false);

        const cm = new ConfigManager();

        expect(cm.config.relays).toEqual([]);
        expect(cm.config.sites).toEqual({});
    });

    it('should resolve site config merging defaults', () => {
        mockExistsSync.mockReturnValue(false);
        const cm = new ConfigManager();
        cm.config.relays = ['wss://global.com'];
        cm.config.sites = {
            'blog': { posts_dir: '/posts/blog', relays: ['wss://blog.com'] }
        };

        const siteConfig = cm.resolveSiteConfig('blog');
        expect(siteConfig.name).toBe('blog');
        expect(siteConfig.relays).toContain('wss://blog.com');
        expect(siteConfig.relays).not.toContain('wss://global.com');
    });
});
