export function getActiveCharacterIdentity(context) {
    if (!context || context.groupId !== null && context.groupId !== undefined && context.groupId !== '') return null;
    const characterId = context.characterId;
    if (characterId === null || characterId === undefined || characterId === '') return null;
    const character = context.characters?.[characterId];
    const key = typeof character?.avatar === 'string' ? character.avatar.trim() : '';
    if (!key || key === 'none') return null;
    const name = typeof character.name === 'string' && character.name.trim()
        ? character.name.trim()
        : (typeof context.name2 === 'string' ? context.name2.trim() : '');
    return { key, name };
}
