export const sleep = (ms = 2000) => new Promise(rs => setTimeout(rs, ms));

export async function retry<T>(
    f: () => Promise<T>,
    logger: { error: (message: any) => void; reset: () => void },
    cond: (e: T | undefined) => boolean,
    maxRetries = 5,
    delay = 5000,
): Promise<T | undefined> {
    let retries = 0;
    let data: T = undefined;

    while (retries < maxRetries) {
        try {
            data = await f();
            if (cond(data)) break;
        } catch (err) {
            logger.error(err.message);
        } finally {
            retries++;
            logger.reset();
            await sleep(delay);
        }
    }

    return data;
}
