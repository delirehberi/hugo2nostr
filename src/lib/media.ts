import fs from 'fs';
import path from 'path';
import { createNip98Auth } from './nostr.js';

interface UploadResult {
    url: string;
}

interface NostrBuildResponse {
    status: string;
    message?: string;
    data?: Array<{
        url: string;
        [key: string]: any;
    }>;
}

export async function uploadImage(
    filePath: string,
    imageHost: string,
    privateKey: string,
    verbose: boolean = false
): Promise<string | null> {
    if (!fs.existsSync(filePath)) {
        console.error(`  Image not found: ${filePath}`);
        return null;
    }

    const filename = path.basename(filePath);
    const fileBuffer = fs.readFileSync(filePath);
    const blob = new Blob([fileBuffer]);

    const formData = new FormData();
    formData.append('file', blob, filename);

    // Determine API endpoint based on IMAGE_HOST
    let apiUrl: string;
    if (imageHost === 'nostr.build' || !imageHost) {
        apiUrl = 'https://nostr.build/api/v2/upload/files';
    } else if (imageHost.startsWith('http')) {
        apiUrl = imageHost;
    } else {
        apiUrl = `https://${imageHost}/api/v2/upload/files`;
    }

    try {
        if (verbose) console.log(`  Uploading ${filename} to ${imageHost}...`);

        // Create NIP-98 auth header
        const authHeader = createNip98Auth(apiUrl, 'POST', privateKey);

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Authorization': authHeader,
            },
            body: formData,
        });

        if (!response.ok) {
            console.error(`  Upload failed: ${response.status} ${response.statusText}`);
            return null;
        }

        const result = await response.json() as NostrBuildResponse;

        if (result.status === 'success' && result.data?.[0]?.url) {
            const url = result.data[0].url;
            if (verbose) console.log(`  Uploaded: ${url}`);
            return url;
        } else {
            console.error(`  Upload failed: ${result.message || 'Unknown error'}`);
            return null;
        }
    } catch (e: any) {
        console.error(`  Upload error: ${e.message}`);
        return null;
    }
}
