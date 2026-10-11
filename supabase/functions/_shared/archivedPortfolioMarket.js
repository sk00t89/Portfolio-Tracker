import {isDate} from '../../../src/utils/performanceLedger.js';
import {addCalendarDays,latestCompletedSession,holdingMarket,zonedInstant} from './marketCalendar.js';

// Valuation reads persisted dated sources, including broker product quotes that
// cannot later be fetched as historical bars. There is no current-price fallback.
export function createArchivedPortfolioMarket({catalog,archive,publicationCalendar,fx}) {
    return {source:'archived_verified_market',fx,async price(position,date) {
        const listing=catalog.find(p=>p.instrumentId===position.instrumentId&&p.currency===position.currency&&p.identityVerified===true);
        if(!listing||!isDate(date))throw new Error('Värdepapprets identitet behöver bekräftas.');
        if(!['STOCK','FUND','CERTIFICATE','ETP','TRACKER','EXCHANGE_TRADED_PRODUCT','SUBSCRIPTION_OPTION'].includes(listing.assetType))
            throw new Error('Instrumenttypen saknar verifierad värdering.');
        const fund=listing.assetType==='FUND';
        if(listing.assetType==='SUBSCRIPTION_OPTION'&&(listing.lifecycleVerified!==true||!isDate(listing.reviewRequiredFrom)||date>=listing.reviewRequiredFrom))
            throw new Error('Teckningsoptionens bolagshändelse behöver stämmas av.');
        const session=fund?null:latestCompletedSession(holdingMarket(listing),zonedInstant(date,'23:59','Europe/Stockholm'));
        if(!fund&&!session)throw new Error('Verifierad börskalender saknas.');
        const point=await archive.latestPrice(listing.instrumentId,listing.currency,fund?date:session.date);
        if(point?.verified!==true||!point.source?.trim()||point.instrumentId!==listing.instrumentId||point.currency!==listing.currency
            ||!isDate(point.date)||point.date>date||Date.parse(date)-Date.parse(point.date)>7*86400000
            ||typeof point.price!=='number'||!Number.isFinite(point.price)||point.price<=0
            ||(!fund&&point.date!==session.date))throw new Error(`Verifierad ${fund?'fond-NAV':'produktkurs'} saknas för ${listing.name??listing.instrumentId} den ${date}.`);
        if(fund)for(let day=addCalendarDays(point.date,1);day<=date;day=addCalendarDays(day,1)) {
            const calendar=await publicationCalendar?.(listing,day);
            if(calendar?.verified!==true||calendar.publicationExpected!==false||!calendar.source?.trim())
                throw new Error(`Fond-NAV för ${listing.name??listing.instrumentId} den ${date} har inte verifierats ännu.`);
        }
        return {...point,valuationDate:date,...(point.date!==date?{carryPolicy:'last_published',calendarVerified:true}:{})};
    }};
}
