export function chunking<T>(arr: T[], chunkSize = 50): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < arr.length; i += chunkSize) {
        const chunk = arr.splice(i, chunkSize);
        chunks.push(chunk);
    }
    return chunks;
}
