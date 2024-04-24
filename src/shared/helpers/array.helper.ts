export function chunking<T>(arr: T[], n: number): T[][] {
    const response: T[][] = [];
    for (let i = 0; i < arr.length; i += n) {
        response.push(arr.slice(i, i + n));
    }
    return response;
}
