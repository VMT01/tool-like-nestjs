export function createLogger(line: number, id: string) {
    return function (message: any, isError = false) {
        process.stdout.cursorTo(0, line);
        process.stdout.clearLine(1);
        console.log(`[${id}${isError ? ' - ERROR' : ''}] ${message}`);
    };
}
