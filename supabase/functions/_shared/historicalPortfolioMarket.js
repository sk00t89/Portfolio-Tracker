import {createSnapshotProviders} from './snapshotProviders.js';
import {latestCompletedSession,holdingMarket,zonedInstant,addCalendarDays} from './marketCalendar.js';
import {isDate} from '../../../src/utils/performanceLedger.js';
import {expectedEcbReferenceDate} from './ecbPublicationCalendar.js';

// Prepared adapter, not activated for real portfolios. Only verified listing mappings
// from a server catalog are accepted. Current NAV/FX are never used for past dates.
export function createHistoricalPortfolioMarket({catalog,fetcher=fetch,historicalNav,clock=Date.now}) {
    const evidence=(day,date,source)=>({date:day,valuationDate:date,verified:true,source,
        ...(day!==date?{carryPolicy:'last_published',calendarVerified:true}:{})});
    return {source:'verified_historical_market',async price(position,date) {
        const listing=catalog.find(i=>i.instrumentId===position.instrumentId&&i.currency===position.currency&&i.identityVerified===true);
        if(!listing)throw new Error('Värdepapprets identitet och handelsplats behöver bekräftas.');
        if(!['STOCK','FUND','CERTIFICATE','ETP','TRACKER','EXCHANGE_TRADED_PRODUCT'].includes(listing.assetType))
            throw new Error('Instrumenttypen kräver en verifierad historikkälla och hantering av bolagshändelser.');
        if(listing.assetType==='FUND') {
            if(!historicalNav)throw new Error('Historiskt fond-NAV saknas. Dagens NAV kan inte användas bakåt i tiden.');
            const point=await historicalNav(listing,date);
            if(point?.verified!==true||point.instrumentId!==listing.instrumentId||point.currency!==listing.currency||!point.source
                ||!isDate(point.date)||point.date>date||Date.parse(date)-Date.parse(point.date)>7*86400000
                ||typeof point.price!=='number'||!Number.isFinite(point.price)||point.price<=0
                ||(point.date!==date&&point.calendarVerified!==true))throw new Error('Fondens historiska publiceringsdatum behöver verifieras.');
            return {...point,...evidence(point.date,date,point.source)};
        }
        const session=latestCompletedSession(holdingMarket(listing),zonedInstant(date,'23:30','Europe/Stockholm'));
        if(!session)throw new Error('Verifierad börskalender saknas för perioden.');
        const point=await createSnapshotProviders({fetcher,clock}).close(listing,session);
        if(point.currency!==listing.currency||point.date!==session.date||typeof point.price!=='number'||!Number.isFinite(point.price)||point.price<=0)throw new Error('Verifierad historisk stängningskurs saknas.');
        const source=point.sourceMetadata?.provenance==='broker_latest_after_close'?'Broker / verified latest closing quote':'Yahoo / verified listing';
        return {...evidence(point.date,date,source),instrumentId:position.instrumentId,currency:point.currency,price:point.price,
            ...(point.sourceMetadata?{sourceMetadata:point.sourceMetadata}:{})};
    },async fx(currency,date) {
        // A weekend/holiday lower bound may cause the provider to include the
        // preceding publication. Request that verified source date explicitly.
        const from=expectedEcbReferenceDate(addCalendarDays(date,-7));
        const params=new URLSearchParams({base:currency,quotes:'SEK',from,to:date,providers:'ecb',expand:'providers'});
        const response=await fetcher(`https://api.frankfurter.dev/v2/rates?${params}`,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(12000)});
        if(!response.ok)throw new Error('Historisk valutakurs kunde inte hämtas.');
        const rows=await response.json();
        if(!Array.isArray(rows)||!rows.length)throw new Error('Historisk valutakurs saknas.');
        let previous='';for(const row of rows) {
            const provider=row.providers?.[0];
            if(row.base!==currency||row.quote!=='SEK'||!isDate(row.date)||row.date>date||row.date<from||row.date<=previous
                ||typeof row.rate!=='number'||!Number.isFinite(row.rate)||row.rate<=0||row.providers?.length!==1
                ||provider?.key!=='ECB'||provider.date!==row.date||provider.rate!==row.rate)throw new Error('Historisk valutakurs kunde inte verifieras.');
            previous=row.date;
        }
        const row=rows.at(-1);
        if(row.date!==expectedEcbReferenceDate(date))throw new Error('Förväntad historisk ECB-valutakurs saknas.');
        return {...evidence(row.date,date,'Frankfurter / ECB'),from:currency,to:'SEK',rate:row.rate};
    }};
}
