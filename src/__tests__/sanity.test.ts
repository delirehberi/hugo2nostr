
import { jest, describe, it, expect } from '@jest/globals';

// Define mocks shared between exports
jest.unstable_mockModule('fs', () => {
    const mockRead = jest.fn();
    return {
        readFileSync: mockRead,
        default: {
            readFileSync: mockRead,
        }
    };
});

const fs = await import('fs');

describe('Sanity', () => {
    it('fs mock works with shared instance', () => {
        // Configure the mock via the imported module
        (fs.default.readFileSync as jest.Mock).mockReturnValue('mocked');

        expect(fs.default.readFileSync('foo')).toBe('mocked');
        // @ts-ignore
        expect(fs.readFileSync('foo')).toBe('mocked');
    });
});
