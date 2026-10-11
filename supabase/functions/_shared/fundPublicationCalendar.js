import {isDate} from '../../../src/utils/performanceLedger.js';
// A fund's bank-day valuation rule is independent of exchange opening times.
// Only issuer-reviewed closures authorize carry; an unknown holiday stays pending.
export function reviewedFundPublicationCalendar(rules){
    return async(listing,date)=>{
        const rule=rules.find(r=>r.isin===listing.isin&&r.currency===listing.currency);
        if(!isDate(date)||!rule?.sourceUrl?.startsWith('https://')||!rule.reviewedAt||date<rule.from||date>rule.through)
            return {verified:false,publicationExpected:null};
        const weekday=new Date(`${date}T12:00:00Z`).getUTCDay();
        if(rule.bankDaysOnly===true&&[0,6].includes(weekday)||rule.closedDates?.includes(date))
            return {verified:true,publicationExpected:false,source:rule.sourceUrl};
        // Actual availability can lag valuation; never declare that a missing NAV
        // is a closed fund day solely because its provider has not returned it.
        return {verified:true,publicationExpected:true,source:rule.sourceUrl,maxPublicationDelayBankDays:rule.maxPublicationDelayBankDays??null};
    };
}
export const reviewedPublicFundRules=[{isin:'SE0001718388',currency:'SEK',bankDaysOnly:true,closedDates:[],
    from:'2026-03-09',through:'2026-12-31',reviewedAt:'2026-10-10',maxPublicationDelayBankDays:2,
    sourceUrl:'https://investors.avanza.se/files/Avanza_fonder/Informationsbroschyr/informationsbroschyr_avanza-zero_2026-03-09.pdf'},
    {isin:'SE0004297927',currency:'SEK',bankDaysOnly:true,closedDates:['2026-01-01','2026-01-06','2026-04-03','2026-04-06','2026-05-01','2026-05-14','2026-06-19','2026-12-24','2026-12-25','2026-12-31'],
        from:'2026-05-06',through:'2026-12-31',reviewedAt:'2026-10-11',maxPublicationDelayBankDays:1,
        sourceUrl:'https://www.spiltanfonder.se/upl/files/260326/informationsbroschyr.pdf?t=835459500',
        closureSourceUrl:'https://www.spiltanfonder.se/upl/files/262046.pdf'},
    // Issuer explicitly rules out NAV on this date. Do not infer the other
    // Asian holidays or a full annual calendar from this one dated notice.
    {isin:'SE0007074117',currency:'SEK',closedDates:['2026-10-09'],from:'2026-10-09',through:'2026-10-09',reviewedAt:'2026-10-11',
        sourceUrl:'https://www.swedbank.se/news.e7903d95-4cc2-467d-af08-3666517e6ebd.html'}];
