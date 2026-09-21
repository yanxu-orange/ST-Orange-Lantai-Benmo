export class SummaryDomainError extends Error {
    constructor(code, message, details = {}) {
        super(message);
        this.name = 'SummaryDomainError';
        this.code = code;
        Object.assign(this, details);
    }
}
