export class TkmError extends Error {
    constructor(message, {
        code = 'unknown',
        scope = 'application',
        retryable = false,
        cause,
    } = {}) {
        super(message, { cause });
        this.name = 'TkmError';
        this.code = code;
        this.scope = scope;
        this.retryable = retryable;
    }
}

export function toSafeErrorRecord(error) {
    return {
        name: typeof error?.name === 'string' ? error.name : 'Error',
        message: typeof error?.message === 'string' ? error.message : '未知错误。',
        code: typeof error?.code === 'string' ? error.code : 'unknown',
        scope: typeof error?.scope === 'string' ? error.scope : 'application',
        retryable: error?.retryable === true,
    };
}
