export function inspectSillyTavernBranchContext(context) {
    const value = context?.chatMetadata?.main_chat;
    const mainChatId = value === null || value === undefined || value === '' ? null : String(value);
    const branchPoint = Array.isArray(context?.chat) ? Math.max(-1, context.chat.length - 1) : -1;
    return { mainChatId, branchPoint };
}
