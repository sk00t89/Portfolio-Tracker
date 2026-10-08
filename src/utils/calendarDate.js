export function stockholmDate(value = new Date()) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return null;
    return new Intl.DateTimeFormat("sv-SE", {
        timeZone: "Europe/Stockholm", year: "numeric", month: "2-digit", day: "2-digit",
    }).format(date);
}
