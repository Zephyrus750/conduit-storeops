// Shared reducer helpers. A reducer returns null on success or a rejection
// { code, message }; it must validate before it mutates.
export function reject(code, message) { return { code, message }; }
