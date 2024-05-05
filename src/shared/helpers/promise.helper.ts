export const waiter = (ms = 1000) => new Promise(rs => setTimeout(rs, ms));

export async function retry<T>(id: any, f: () => Promise<T>, cond: (e: T) => boolean, maxRetries = 5, delay = 1000) {
    let retries = 0;
    let data: T = undefined;

    while (true) {
        try {
            data = await f();
        } catch (err) {
            console.log(`[${id} - ERROR]`, err.message);
            if (retries === maxRetries) break;

            console.log(`[${id}] Retry #${retries++} since error occurred`);
            await waiter(delay);
            continue;
        }

        if (cond(data) || retries === maxRetries) break;

        console.log(`[${id}] Retry #${retries++} since failed condition`);
        await waiter(delay);
    }

    console.log(`[${id}] Final data: ${JSON.stringify(data)}`);
    return data;
}
