import {isDate} from '../../../src/utils/performanceLedger.js';
import {addCalendarDays} from './marketCalendar.js';
// ECB publishes on TARGET business days, not on each stock exchange's days.
// Reviewed 2026/2027 only; unknown years must not authorize a stale FX rate.
// https://www.ecb.europa.eu/ecb/contacts/working-hours/html/index.en.html
const closed={2026:['2026-01-01','2026-04-03','2026-04-06','2026-05-01','2026-12-25','2026-12-26'],
    2027:['2027-01-01','2027-03-26','2027-03-29','2027-05-01','2027-12-25','2027-12-26']};
export function expectedEcbReferenceDate(date){
    if(!isDate(date))throw new Error('Verifierad ECB-kalender saknas.');
    for(let day=date,count=0;count<7;day=addCalendarDays(day,-1),count++){
        const dates=closed[Number(day.slice(0,4))];if(!dates)throw new Error('Verifierad ECB-kalender saknas.');
        const weekday=new Date(`${day}T12:00:00Z`).getUTCDay();
        if(![0,6].includes(weekday)&&!dates.includes(day))return day;
    }
    throw new Error('Verifierad ECB-kalender saknas.');
}
