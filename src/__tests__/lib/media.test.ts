
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

// Define mocks
const mockCreateNip98Auth = jest.fn();

// Mock lib/nostr
jest.unstable_mockModule('../../lib/nostr.js', () => ({
    createNip98Auth: mockCreateNip98Auth,
    // Add other exports if needed by media.ts or test
    default: {
        createNip98Auth: mockCreateNip98Auth
    }
}));


// Mock fs
jest.unstable_mockModule('fs', () => ({
    existsSync: jest.fn().mockReturnValue(true),
    readFileSync: jest.fn().mockReturnValue(Buffer.from('test')),
    default: {
        existsSync: jest.fn().mockReturnValue(true),
        readFileSync: jest.fn().mockReturnValue(Buffer.from('test')),
    }
}));


const { uploadImage } = await import('../../lib/media.js');
const { createNip98Auth } = await import('../../lib/nostr.js'); // Import mocked version

describe('Media Library', () => {
    let fetchSpy: any;

    beforeEach(() => {
        jest.clearAllMocks();
        fetchSpy = jest.spyOn(global, 'fetch');
        mockCreateNip98Auth.mockReturnValue('Nostr token');
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('uploadImage', () => {
        it('should upload image successfully', async () => {
            const mockResponse = {
                ok: true,
                json: async () => ({
                    status: 'success',
                    data: [{ url: 'https://cdn.com/img.jpg' }]
                })
            };
            fetchSpy.mockResolvedValue(mockResponse);

            const url = await uploadImage('path/to/img.jpg', 'nostr.build', 'privkey');
            expect(url).toBe('https://cdn.com/img.jpg');
            expect(mockCreateNip98Auth).toHaveBeenCalled();
            expect(fetchSpy).toHaveBeenCalledWith('https://nostr.build/api/v2/upload/files', expect.any(Object));
        });

        it('should throw error on failure', async () => {
            const mockResponse = {
                ok: false,
                statusText: 'Bad Request'
            };
            fetchSpy.mockResolvedValue(mockResponse);

            const result = await uploadImage('path/to/img.jpg', 'nostr.build', 'privkey');
            expect(result).toBeNull();
        });
    });
});
