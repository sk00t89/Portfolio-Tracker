import {isDate} from '../../../src/utils/performanceLedger.js';
import {stockholmDate} from '../../../src/utils/calendarDate.js';
import {latestCompletedSession,holdingMarket,LISTING_CALENDARS,normalizeMarketCode} from './marketCalendar.js';

// Service-only composition for the existing verified providers and durable archive.
// No user credentials or portfolio data are inputs. No deployment is configured.
export async function collectPublishedMarket({catalog,provider,archive,now=Date.now()}) {
    const points=[],failures=[],seen=new Set(),today=stockholmDate(now);
    for(const listing of catalog) {
        const key=JSON.stringify([listing.instrumentId,listing.currency]);
        try {
            if(listing.identityVerified!==true||!listing.instrumentId||!listing.isin||!listing.currency)
                throw new Error('instrument_identity_unverified');
            if(seen.has(key))continue;seen.add(key);
            const fund=listing.assetType==='FUND',option=listing.assetType==='SUBSCRIPTION_OPTION';
            if(!fund&&!['STOCK','CERTIFICATE','ETP','TRACKER','EXCHANGE_TRADED_PRODUCT','SUBSCRIPTION_OPTION'].includes(listing.assetType))
                throw new Error('instrument_type_unsupported');
            if(option&&(listing.lifecycleVerified!==true||!isDate(listing.reviewRequiredFrom)||today>=listing.reviewRequiredFrom))
                throw new Error('corporate_action_review_required');
            if(!fund&&!LISTING_CALENDARS[normalizeMarketCode(listing.market)])throw new Error('listing_calendar_unverified');
            const session=fund?null:latestCompletedSession(holdingMarket(listing),now);
            if(!fund&&!session)throw new Error('completed_session_unavailable');
            const point=fund?await provider.fund(listing,now):await provider.close(option?{...listing,productType:'ETP'}:listing,session);
            if(point.currency!==listing.currency||typeof point.price!=='number'||!Number.isFinite(point.price)||point.price<=0
                ||!isDate(point.date)||point.date>today||Date.parse(today)-Date.parse(point.date)>7*86400000
                ||(fund&&(point.isin!==listing.isin||point.kind!=='published_nav'))
                ||(!fund&&(point.kind!=='session_close'||point.date!==session.date)))throw new Error('dated_source_unverified');
            points.push({instrumentId:listing.instrumentId,isin:listing.isin,currency:listing.currency,date:point.date,price:point.price,
                source:point.source==='synthetic_test'?'synthetic_test':`${point.provider??'Yahoo'} / ${point.kind}`,
                verified:true,collectedAt:new Date(now).toISOString(),...(point.sourceMetadata?{sourceMetadata:point.sourceMetadata}:{})});
        } catch(error) { failures.push({instrumentId:listing.instrumentId,reason:error.message}); }
    }
    return {points,failures,committed:points.length?await archive.commitBatch(points):null};
}
