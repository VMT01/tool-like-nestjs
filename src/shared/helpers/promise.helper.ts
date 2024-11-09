export const sleep = (ms = 2000) => new Promise(rs => setTimeout(rs, ms));

export async function retry<T>(
    log: (message: any, isError?: boolean) => void,
    f: () => Promise<T>,
    cond: (e: T | undefined) => boolean,
    maxRetries = 5,
    delay = 1000,
): Promise<T | undefined> {
    let retries = 0;
    let data: T = undefined;

    while (retries < maxRetries) {
        try {
            data = await f();
            if (cond(data)) break;
        } catch (err) {
            log(err.message, true);
        } finally {
            retries++;
            await sleep(delay);
        }
    }

    return data;
}
