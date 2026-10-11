import {isDate} from '../../../src/utils/performanceLedger.js';
import {stockholmDate} from '../../../src/utils/calendarDate.js';

// Prepared server collector for history from activation onward. No database,
// scheduler or live users are connected here. Archive must implement an atomic,
// version-preserving commitBatch; it must not overwrite corrected observations.
export async function collectPublishedFundNav({catalog,provider,archive,now=Date.now()}) {
    const today=stockholmDate(now),seen=new Set(),points=[],failures=[];
    for(const listing of catalog.filter(p=>p.assetType==='FUND')) {
        const key=JSON.stringify([listing.isin,listing.currency]);
        if(listing.identityVerified!==true||!listing.instrumentId||!/^[A-Z]{2}[A-Z0-9]{10}$/.test(listing.isin??'')
            ||!/^[A-Z]{3}$/.test(listing.currency??'')) {
            failures.push({instrumentId:listing.instrumentId,reason:'instrument_identity_unverified'});continue;
        }
        if(seen.has(key))continue; // Shared source data, never one fetch per account.
        seen.add(key);
        try {
            const point=await provider.fund(listing,now);
            if(point.isin!==listing.isin||point.currency!==listing.currency||point.kind!=='published_nav'
                ||!['Avanza','Nordnet'].includes(point.provider)||!isDate(point.date)||point.date>today
                ||Date.parse(today)-Date.parse(point.date)>7*86400000
                ||typeof point.price!=='number'||!Number.isFinite(point.price)||point.price<=0)
                throw new Error('Invalid fund source');
            points.push({instrumentId:listing.instrumentId,isin:listing.isin,currency:listing.currency,date:point.date,
                price:point.price,source:`${point.provider} / identity-verified published NAV`,verified:true,collectedAt:new Date(now).toISOString()});
        } catch {
            failures.push({instrumentId:listing.instrumentId,reason:'published_nav_unavailable_or_unverified'});
        }
    }
    // Partial public source collection is allowed, but never certifies a complete portfolio.
    // Publication remains the separate worker's all-instruments/revision-checked operation.
    const committed=points.length?await archive.commitBatch(points):{inserted:0,unchanged:0,corrected:0};
    return {points,failures,committed,portfolioPublicationAllowed:false};
}
