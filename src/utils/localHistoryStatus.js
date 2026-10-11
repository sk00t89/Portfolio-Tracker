export function pendingHistoryMessage(run, observations, today) {
    if(run?.status!=='failed'||!run.valuation_date||run.valuation_date>=today
        ||observations.some(o=>o.date===run.valuation_date))return null;
    const reason=String(run.reason??'');
    const readable=/[åäöÅÄÖ]/.test(reason)?reason:'Dagsvärderingen kunde inte verifieras. Försök uppdatera historiken igen.';
    return `Historiken är ännu inte komplett för ${run.valuation_date}: ${readable} Senast verifierade värden visas.`;
}
