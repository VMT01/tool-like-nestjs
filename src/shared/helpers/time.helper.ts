export const waiter = (ms = 2000) => new Promise(rs => setTimeout(rs, ms));
