import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { localCredentials } from './localPerformanceEnvironment.mjs';
import {createLocalPerformanceClient} from '../src/services/localPerformanceClient.js';
import {performanceFromStoredInput} from '../src/services/portfolioPerformance.js';
import {fetchPerformanceBenchmark} from '../src/services/performanceBenchmarks.js';
import {buildDailyPerformanceView} from '../src/utils/performanceComparison.js';
import {stockholmDate} from '../src/utils/calendarDate.js';
import {ledgerCostBasis} from '../src/utils/ledgerCostBasis.js';

const credentials=localCredentials();
const demo=JSON.parse(readFileSync('supabase-test/demo-users.local','utf8'));
for(const user of demo.users){
    const client=createLocalPerformanceClient(credentials.url,credentials.anonKey);
    const login=await client.auth.signInWithPassword({email:user.email,password:demo.password});assert.ifError(login.error);
    const response=await fetch('http://127.0.0.1:55801/api/local-test/recalculate',{method:'POST',headers:{Authorization:`Bearer ${login.data.session.access_token}`}});
    const result=await response.json();assert.equal(response.ok,true,result.error);
    const stored=await client.rpc('get_portfolio_performance_input');assert.ifError(stored.error);
    if(user.email.startsWith('csv-alice-')) {
        const costs=ledgerCostBasis(stored.data.baseline,stored.data.events);
        const stock=[...costs.values()].find(p=>p.instrumentId==='synthetic-sek-equity');
        const sold=[...costs.values()].find(p=>p.instrumentId==='synthetic-nordnet-equity');
        assert.equal(stock.averagePriceSek,79.5,'Corrected buy: (10×75 + 2×102) / 12');
        assert.equal(sold.averagePriceSek,40,'Partial sale preserves average acquisition cost');
        console.log('PASS LOCAL corrected journal GAV: 79.5 SEK; partial-sale GAV: 40 SEK.');
    }
    const portfolio=performanceFromStoredInput(stored.data);assert.equal(portfolio.available,true);
    if(user.email.startsWith('bob-')||user.email.startsWith('csv-bob-'))assert.equal(portfolio.method,'TWR','Portfolio without external flows has exact TWR');
    for(const id of ['OMXS30','SP500']){
        const benchmark=await fetchPerformanceBenchmark((url,options)=>fetch(`http://127.0.0.1:55801${url}`,options),id,'1M',new AbortController().signal);
        const view=buildDailyPerformanceView(portfolio,benchmark,'1M',stockholmDate(),Date.now());
        assert.equal(view.comparison.available,true);assert.equal(view.comparison.series[0].value,0);assert.equal(view.comparison.series[0].benchmark,0);
        if(id==='SP500')assert.ok(benchmark.points.every(p=>p.fxRateToSek>0 && p.value===p.nativeValue*p.fxRateToSek));
        console.log(`PASS LOCAL synthetic portfolio + real ${id}, ${portfolio.method}, ${view.comparison.start} – ${view.comparison.end}, common zero anchor; ${benchmark.fxLabel}`);
    }
}
console.log('All isolated demo users have persisted history and validated actual market index overlays. No production access.');
