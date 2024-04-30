export const waiter = (ms = 1000) => new Promise(rs => setTimeout(rs, ms));

export async function retryPromise<T>(
    f: () => Promise<T>,
    condition: (e: T) => boolean,
    combineData?: (newData: T, oldData?: T) => T,
    maxRetries = 5,
    delay = 1000,
) {
    let retries = 0;
    let data: T = undefined;

    while (true) {
        try {
            const newData = await f();

            if (combineData) data = combineData(newData, data);
            else data = newData;

            if (condition(data) || retries === maxRetries) {
                console.log('Response:', JSON.stringify(newData), 'Stored Response:', JSON.stringify(data));
                return data;
            }

            console.log('Response:', JSON.stringify(newData));
            console.log(`Retry #${retries++} since failed condition`);
            await new Promise(rs => setTimeout(rs, delay));
        } catch (err) {
            console.log('[ERROR] 17 ---', err.message);
            if (retries === maxRetries) return undefined;
            console.log(`Retry #${retries++} since error occurred`);
            await new Promise(rs => setTimeout(rs, delay));
        }
    }
}
