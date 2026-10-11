import parseCsv from '../parsers/parseCsv.js';
import {csvObjects,csvNumber} from '../parsers/delimitedCsv.js';
import {isDate} from '../utils/performanceLedger.js';
import {zonedInstant} from '../../supabase/functions/_shared/marketCalendar.js';

const question=(key,label,type='text',options=[])=>({key,label,type,options});
const value=(answers,key)=>answers[key];
export function preparePortfolioCsvImport(files,answers={},catalog=[]) {
    const questions=[],positions=[],cash=[],events=[],dates=new Set(),accounts=new Set();
    const resolve=(holding,key)=>{
        const matching=holding.isin?catalog.find(item=>item.isin===holding.isin&&item.currency===holding.currency):null;
        const chosen=matching??catalog.find(item=>item.instrumentId===value(answers,`instrument:${key}`)&&item.currency===holding.currency);
        if(!chosen)questions.push(question(`instrument:${key}`,`Vilket värdepapper är ”${holding.name}”?`,'select',catalog.filter(i=>i.currency===holding.currency).map(i=>({value:i.instrumentId,label:i.name}))));
        return chosen;
    };
    for(const file of files) {
        if(file.text.replace(/^\uFEFF/,'').startsWith('Konto;ISIN;Namn;Antal;Valuta;Datum')) {
            for(const [index,row] of csvObjects(file.text,';').entries()) {
                const quantity=csvNumber(row.Antal);
                if(!row.Konto||!isDate(row.Datum)||!Number.isFinite(quantity)||quantity<0||!/^[A-Z]{3}$/.test(row.Valuta))
                    throw new Error('Startinnehaven behöver konto, antal, valuta och kontobeskedets datum.');
                const instrument=resolve({isin:row.ISIN,name:row.Namn,currency:row.Valuta},`${file.name}:${index}`);
                if(instrument){positions.push({...instrument,accountId:row.Konto,quantity,averagePrice:null,averagePriceSek:null});accounts.add(row.Konto);dates.add(row.Datum);}
            }
            continue;
        }
        if(file.text.replace(/^\uFEFF/,'').startsWith('Konto;Valuta;Saldo;Datum')) {
            for(const row of csvObjects(file.text,';')) {
                const amount=csvNumber(row.Saldo);
                if(!row.Konto||!/^[A-Z]{3}$/.test(row.Valuta)||!Number.isFinite(amount)||amount<0||!isDate(row.Datum))throw new Error('Kontobeskedet behöver konto, valuta, datum och ett avstämt kassabelopp.');
                cash.push({accountId:row.Konto,currency:row.Valuta,amount});dates.add(row.Datum);
            }
            continue;
        }
        if(file.text.replace(/^\uFEFF/,'').startsWith('Datum;Konto;Typ;ISIN;Antal;Pris;Valuta;Avgift;Referens')) {
            for(const row of csvObjects(file.text,';')) {
                const instrument=catalog.find(item=>item.isin===row.ISIN&&item.currency===row.Valuta);
                if(!['BUY','SELL'].includes(row.Typ)||!instrument||!row.Referens||!row.Konto||!isDate(row.Datum))throw new Error('Affärsfilen behöver kända instrument, konto, datum och en unik affärsreferens.');
                const quantity=csvNumber(row.Antal),unitPrice=csvNumber(row.Pris),fee=csvNumber(row.Avgift);
                if(!(quantity>0)||!(unitPrice>0))throw new Error('Antal och pris saknas i en affär.');
                if(fee==null)questions.push(question(`fee:${row.Referens}`,`Vilket courtage gäller för affär ${row.Referens}? Ange 0 om avgiftsfri.`,'number'));
                const amount=fee??csvNumber(value(answers,`fee:${row.Referens}`));
                if(amount!=null&&(!Number.isFinite(amount)||amount<0))throw new Error('Courtage måste vara ett känt belopp eller 0.');
                events.push({kind:row.Typ,accountId:row.Konto,instrumentId:instrument.instrumentId,currency:row.Valuta,
                    quantity,unitPrice,date:row.Datum,fee:amount==null?null:{amount,currency:row.Valuta},funding:'existing_cash',externalReference:row.Referens});
            }
            continue;
        }
        const parsed=parseCsv(file.text);
        if(parsed.type==='LYSA_PERFORMANCE')throw new Error('Lysas värdekurva visar inte innehav eller kassa. Lägg till transaktionsunderlag och kontobesked.');
        let rows=parsed.data;
        if(parsed.type==='LYSA_TRANSACTIONS') {
            const account=value(answers,`account:${file.name}`),date=value(answers,`date:${file.name}`);
            if(!account)questions.push(question(`account:${file.name}`,'Vilket Lysakonto gäller filen?'));
            if(!date)questions.push(question(`date:${file.name}`,'Vilket datum har ditt öppningskontobesked?','date'));
            if(value(answers,`complete:${file.name}`)!==true)questions.push(question(`complete:${file.name}`,'Innehåller Lysa-filen alla andelsaffärer sedan kontot öppnades?','confirm'));
            if(!account||!date)continue;
            if(!isDate(date))throw new Error('Välj ett giltigt exportdatum.');
            const funds=new Map();
            for(const row of rows) {
                if(!isDate(row.date)||row.date>date)throw new Error('Lysa-transaktionerna måste vara daterade senast på öppningsdagen.');
                const sign=['Buy','Switch buy'].includes(row.type)?1:['Sell','Switch sell'].includes(row.type)?-1:0;
                if(!sign){if(['Deposit','Withdrawal','Fee','Interest'].includes(row.type))continue;throw new Error('En Lysa-händelse behöver stämmas av innan öppningsbalansen kan sparas.');}
                if(!(row.volume>0))throw new Error('Antal fondandelar saknas i Lysa-underlaget.');
                const quantity=(funds.get(row.fundName)??0)+sign*row.volume;if(quantity<0)throw new Error('Lysa-underlaget saknar tidigare fondköp.');funds.set(row.fundName,quantity);
            }
            rows=[...funds].filter(([,quantity])=>quantity>0).map(([name,quantity])=>({name,quantity,currency:'SEK',accountId:account,importDate:date,platform:'Lysa'}));
        } else if(parsed.type!=='HOLDINGS')throw new Error('Filformatet känns inte igen. Använd en innehavsexport från Avanza/Nordnet eller komplett Lysa-underlag.');
        for(const [index,row] of rows.entries()) {
            const key=`${file.name}:${index}`;
            if(!Number.isFinite(row.quantity)||row.quantity<0||!/^[A-Z]{3}$/.test(row.currency??''))throw new Error(`Kontrollera antal och valuta för ”${row.name}”.`);
            const account=row.accountId??value(answers,`account:${file.name}`),date=row.importDate??value(answers,`date:${file.name}`);
            if(!account&&!questions.some(q=>q.key===`account:${file.name}`))questions.push(question(`account:${file.name}`,'Vilket konto gäller filen?'));
            if(!date&&!questions.some(q=>q.key===`date:${file.name}`))questions.push(question(`date:${file.name}`,'Vilket datum gäller exportens innehav?','date'));
            if(date&&!isDate(date))throw new Error('Välj ett giltigt exportdatum.');
            const instrument=resolve(row,key);
            if(account&&date&&instrument){accounts.add(account);dates.add(date);positions.push({...instrument,accountId:account,quantity:row.quantity,
                // Acquisition cost remains separate and never sets the return anchor.
                averagePrice:row.averagePrice??null,averagePriceSek:row.averagePriceSek??null});}
        }
    }
    if(events.length&&(positions.length||cash.length))throw new Error('Importera innehav och affärer separat så att startbalansen inte dubbelräknas.');
    if(events.length) {
        const seen=new Set();for(const event of events){const key=`${event.accountId}:${event.externalReference}`;if(seen.has(key))throw new Error('Samma affärsreferens finns flera gånger i filen.');seen.add(key);}
        return {kind:'transactions',source:'synthetic_test',events,questions:questions.filter(q=>value(answers,q.key)==null),ready:events.every(e=>e.fee!=null)};
    }
    if(dates.size>1)throw new Error('Innehav och kassa måste avse samma datum. Exportera ett gemensamt kontobesked.');
    for(const position of positions) {
        if(!cash.some(c=>c.accountId===position.accountId&&c.currency===position.currency)) {
            const key=`cash:${position.accountId}:${position.currency}`;
            const amount=csvNumber(value(answers,key));
            if(amount==null||!Number.isFinite(amount)||amount<0) {if(!questions.some(q=>q.key===key))questions.push(question(key,`Hur mycket kassa fanns på ${position.accountId} i ${position.currency}? Ange även 0.`,'number'));}
            else cash.push({accountId:position.accountId,currency:position.currency,amount});
        }
    }
    for(const account of new Set(cash.map(c=>c.accountId))) {
        if(accounts.has(account))continue;
        const key=`cashAccount:${account}`;
        if(answers[key]==='cash_only')accounts.add(account);
        else if(answers[key]!=='exclude')questions.push(question(key,`Hur ska kontot ${account} tas med?`,'select',[
            {value:'cash_only',label:'Kontot har enbart kassa – ta med det'},
            {value:'exclude',label:'Importera inte detta konto'},
        ]));
    }
    const scopedCash=cash.filter(c=>accounts.has(c.accountId));
    const keys=new Set();for(const entry of [...positions.map(p=>`p:${p.accountId}:${p.instrumentId}`),...scopedCash.map(c=>`c:${c.accountId}:${c.currency}`)]) {
        if(keys.has(entry))throw new Error('Samma konto eller innehav förekommer i flera filer. Välj en export per konto.');keys.add(entry);
    }
    if(answers.scopeConfirmed!==true)questions.push(question('scopeConfirmed','Är alla innehav och valutor för de valda kontona med i importen?','confirm'));
    const date=[...dates][0];
    return {kind:'opening',date,asOf:date?new Date(zonedInstant(date,'23:30','Europe/Stockholm')).toISOString():null,
        positions,cash:scopedCash,questions,ready:questions.length===0&&scopedCash.length>0,source:'synthetic_test'};
}

export function reconcilePortfolioImport(plan,input) {
    if(!input?.baseline)return {available:false,message:'Importera en komplett öppningsbalans först.'};
    if(plan.date<input.baseline.date)return {available:false,message:'Exporten är äldre än portföljens öppningsbalans. Ingen äldre historik har skapats.'};
    // Never infer trades by subtracting two holdings exports.
    return {available:true,requiresJournalReconciliation:true,message:'Innehavsimporten jämförs med journalen. Eventuella saknade affärer behöver registreras; ingen affär skapas automatiskt.'};
}

export function reconcileManualImportTrades(plan,input,answers={}) {
    if(plan.kind!=='transactions'||!input?.events)return plan;
    const questions=[...plan.questions];
    const same=(a,b)=>a.date===b.date&&a.kind===b.kind&&a.accountId===b.accountId&&a.instrumentId===b.instrumentId
        &&a.currency===b.currency&&a.quantity===b.quantity&&a.unitPrice===b.unitPrice&&a.fee?.amount===b.fee?.amount&&a.fee?.currency===b.fee?.currency;
    const events=plan.events.map(event=>{
        const linked=input.events.find(e=>e.manualImportReference===event.externalReference&&e.accountId===event.accountId);
        if(linked)return {...event,matchEventId:linked.id};
        if(input.events.some(e=>e.externalReference===event.externalReference&&e.accountId===event.accountId))return event;
        const matches=input.events.filter(e=>!e.externalReference&&same(e,event));
        if(!matches.length)return event;
        const key=`match:${event.externalReference}`,answer=answers[key];
        if(matches.some(e=>e.id===answer))return {...event,matchEventId:answer};
        if(answer==='new_trade')return {...event,matchPolicy:'new_trade'};
        questions.push(question(key,`Affären ${event.date}, ${event.quantity} × ${event.unitPrice} ${event.currency}, verkar redan registrerad. Är det samma affär?`,'select',[
            ...matches.map((e,i)=>({value:e.id,label:matches.length===1?'Ja, koppla till den registrerade affären':`Koppla till registrerad affär ${i+1}`})),
            {value:'new_trade',label:'Nej, detta är en separat affär'},
        ]));return event;
    });
    return {...plan,events,questions,ready:plan.ready&&questions.length===0};
}
