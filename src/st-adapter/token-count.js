export async function countTextTokens(context, text) {
    if (typeof context?.getTokenCountAsync !== 'function') {
        return Math.ceil(String(text ?? '').length / 2);
    }
    return context.getTokenCountAsync(String(text ?? ''));
}
