// Let vertical page scrolling remain native; only deliberate horizontal movement scrubs the chart.
export function chartPointerDirection(start, current) {
    const dx = Math.abs(current.x - start.x), dy = Math.abs(current.y - start.y);
    if (Math.max(dx, dy) < 6) return "pending";
    return dx > dy ? "horizontal" : "vertical";
}
