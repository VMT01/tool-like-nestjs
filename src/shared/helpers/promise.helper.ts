export const sleep = (ms = 2000) => new Promise(rs => setTimeout(rs, ms));

export async function retry<T>(
    id: string,
    f: () => Promise<T>,
    cond: (e: T | undefined) => boolean,
    maxRetries = 5,
    delay = 1000,
): Promise<T | undefined> {
    let retries = 0;
    let data: T = undefined;

    while (true) {
        try {
            data = await f();
        } catch (err) {
            console.log(`\n[${id} - ERROR]`, err.message);
            if (retries === maxRetries) break;

            console.log(`[${id}] Retry #${++retries} since error occurred`);
            await sleep(delay);
            continue;
        }

        if (cond(data) || retries === maxRetries) break;

        console.log(`[${id}] Retry #${++retries} since failed condition`);
        await sleep(delay);
    }

    console.log(`[${id}] Final data: ${JSON.stringify(data, null, 2)}`);
    return data;
}
