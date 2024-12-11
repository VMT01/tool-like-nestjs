type Message = { message: any; isError: boolean };
type Messages = { service: Message[]; instances: { [id: string]: Message[] } };

function log({ service, instances }: Messages) {
    process.stdout.cursorTo(0, 0);
    process.stdout.clearScreenDown();

    // Print service logs
    service.forEach(({ isError, message }) => console.log(`${isError ? '[ERROR] ' : ''}${message}`));

    // Print instances logs
    Object.entries(instances).forEach(([key, logs]) => {
        console.log(`\n[${key}]`);
        logs.forEach(({ isError, message }) => console.log(`${isError ? '[ERROR] ' : ''}${message}`));
    });
}

export function createLogger() {
    const messages: Messages = { service: [], instances: {} };

    return {
        service: {
            log: (message: any) => {
                const lastMessageIndex = messages.service.length - 1;
                if (lastMessageIndex >= 0) messages.service[lastMessageIndex] = { message, isError: false };
                else messages.service.push({ message, isError: false });

                log(messages);
            },
            error: (message: any) => {
                const lastMessageIndex = messages.service.length - 1;
                if (lastMessageIndex >= 0) messages.service[lastMessageIndex] = { message, isError: true };
                else messages.service.push({ message, isError: true });
                messages.service.push({} as Message); // Empty message for later replacement

                log(messages);
            },
            // reset: () => (messages.service = []),
        },
        instance: (id: string) => {
            if (!messages.instances[id]) {
                messages.instances[id] = [] as Message[];
            }

            return {
                log: (message: any) => {
                    const lastMessageIndex = messages.instances[id].length - 1;
                    if (lastMessageIndex >= 0) messages.instances[id][lastMessageIndex] = { message, isError: false };
                    else messages.instances[id].push({ message, isError: false });

                    log(messages);
                },
                error: (message: any) => {
                    const lastMessageIndex = messages.instances[id].length - 1;
                    if (lastMessageIndex >= 0) messages.instances[id][lastMessageIndex] = { message, isError: true };
                    else messages.instances[id].push({ message, isError: true });
                    messages.instances[id].push({} as Message); // Empty message for later replacement

                    log(messages);
                },
                reset: () => (messages.instances[id] = []),
            };
        },
    };
}
