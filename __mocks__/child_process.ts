
import { jest } from '@jest/globals';

export const execSync = jest.fn();

const cp = {
    execSync
};

export default cp;
