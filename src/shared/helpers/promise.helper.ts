export function retryPromise<T>(
    f: () => Promise<T>,
    condition: (e: T) => boolean,
    maxRetries: number,
    delay: number,
    resolveError = false,
) {
    let retries = 0;
    return new Promise<T>((rs, rj) => {
        async function onCall() {
            const data = await f();
            if (condition(data)) rs(data);
            else {
                if (retries == maxRetries) {
                    if (resolveError) rs(null);
                    else rj(data);
                } else {
                    retries++;
                    setTimeout(onCall, delay);
                }
            }
        }
        onCall();
    });
}
