import {isDate} from '../../../src/utils/performanceLedger.js';
import {addCalendarDays} from './marketCalendar.js';

// Server-reviewed source archives only. This is not a current-NAV backfill or a
// public upload endpoint. Provider ingestion/review must establish these attestations.
export function createHistoricalNavSeries({catalog,series,publicationCalendar}) {
    const archives=new Map();
    for(const archive of series) {
        const listing=catalog.find(p=>p.instrumentId===archive.instrumentId&&p.identityVerified===true&&p.assetType==='FUND');
        if(!listing||archive.isin!==listing.isin||archive.currency!==listing.currency||archive.reviewed!==true
            ||typeof archive.source!=='string'||!archive.source.trim()||!/^https:\/\//.test(archive.sourceUrl??'')
            ||!/^[a-f0-9]{64}$/.test(archive.contentSha256??'')||!Array.isArray(archive.points)||!archive.points.length
            ||archives.has(archive.instrumentId))throw new Error('Fondhistoriken saknar granskad källa för rätt andelsklass.');
        let previous='';
        for(const point of archive.points) {
            if(!isDate(point.date)||point.date<=previous||typeof point.price!=='number'||!Number.isFinite(point.price)||point.price<=0)
                throw new Error('Fondhistoriken innehåller ogiltiga datum, dubbletter eller NAV.');
            previous=point.date;
        }
        archives.set(archive.instrumentId,structuredClone(archive));
    }
    return async (listing,date)=>{
        const archive=archives.get(listing.instrumentId);
        if(!isDate(date)||!archive||listing.isin!==archive.isin||listing.currency!==archive.currency)
            throw new Error('Verifierad fondhistorik saknas för den här andelsklassen.');
        const point=archive.points.findLast(p=>p.date<=date);
        if(!point||Date.parse(date)-Date.parse(point.date)>7*86400000)
            throw new Error('Fond-NAV saknas för perioden.');
        for(let day=addCalendarDays(point.date,1);day<=date;day=addCalendarDays(day,1)) {
            // Unknown calendars and missing expected publication dates fail closed.
            const session=await publicationCalendar?.(listing,day);
            if(session?.verified!==true||session.publicationExpected!==false||!session.source?.trim())
                throw new Error('En förväntad fondkurs saknas. Ingen äldre kurs fyller denna dag.');
        }
        return {instrumentId:listing.instrumentId,currency:archive.currency,date:point.date,price:point.price,
            verified:true,source:archive.source,sourceUrl:archive.sourceUrl,contentSha256:archive.contentSha256,
            ...(point.date!==date?{calendarVerified:true}:{} )};
    };
}
