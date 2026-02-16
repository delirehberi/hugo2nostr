
import { jest } from '@jest/globals';

export const readFileSync = jest.fn();
export const existsSync = jest.fn();
export const linkSync = jest.fn();
export const unlinkSync = jest.fn();
export const mkdirSync = jest.fn();
export const writeFileSync = jest.fn();

const fs = {
    readFileSync,
    existsSync,
    linkSync,
    unlinkSync,
    mkdirSync,
    writeFileSync,
    promises: {
        readFile: jest.fn(),
        writeFile: jest.fn()
    }
};

export default fs;
