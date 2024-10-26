export const sleep = (ms = 2000) => new Promise(rs => setTimeout(rs, ms));

export async function retry<T>(
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
        } catch (err) {
            await sleep(delay);
            continue;
        }

        if (cond(data)) break;

        retries++;
        await sleep(delay);
    }

    return data;
}
