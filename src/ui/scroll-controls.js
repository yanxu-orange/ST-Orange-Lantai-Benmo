export function getScrollControlState({
    scrollTop = 0,
    scrollHeight = 0,
    clientHeight = 0,
    edgeThreshold = 24,
} = {}) {
    const maxScroll = Math.max(0, Number(scrollHeight) - Number(clientHeight));
    const top = Math.max(0, Number(scrollTop) || 0);
    const visible = maxScroll > 1;
    return {
        visible,
        showTop: visible && top > edgeThreshold,
        showBottom: visible && maxScroll - top > edgeThreshold,
    };
}
