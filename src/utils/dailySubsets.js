// Never combine positions whose comparison sessions differ. Amounts and percentage belong only to this group.
export function buildDailySubsets(positions, { totalValueSek, coverageKnown, flowsUnverified, today }) {
    if (flowsUnverified) return [];
    const groups = new Map();
    for (const position of positions.filter(p => p.covered)) {
        const key = `${position.previousDate}/${position.currentDate}`;
        if (!groups.has(key)) groups.set(key, { previousDate: position.previousDate, currentDate: position.currentDate,
            currentValueSek: 0, previousValueSek: 0, portfolioValueSek: 0, positionIds: [] });
        const group = groups.get(key);
        group.currentValueSek += position.currentValue;
        group.previousValueSek += position.previousValue;
        group.portfolioValueSek += position.portfolioValueSek;
        group.positionIds.push(position.id);
    }
    return [...groups.values()].filter(group => Number.isFinite(group.currentValueSek) && group.currentValueSek > 0
        && Number.isFinite(group.previousValueSek) && group.previousValueSek > 0 && Number.isFinite(group.portfolioValueSek))
        .map(group => ({ ...group, available: true, scope: "subset", positionCount: group.positionIds.length,
            changeSek: group.currentValueSek - group.previousValueSek,
            changePercent: (group.currentValueSek / group.previousValueSek - 1) * 100,
            coveragePercent: coverageKnown && totalValueSek > 0 ? group.portfolioValueSek / totalValueSek * 100 : null }))
        .sort((a,b) => Number(b.currentDate === today) - Number(a.currentDate === today)
            || b.currentDate.localeCompare(a.currentDate) || b.portfolioValueSek - a.portfolioValueSek);
}
