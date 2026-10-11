import test from 'node:test';
import assert from 'node:assert/strict';
import {preparePortfolioCsvImport} from '../src/services/portfolioCsvImport.js';
import {syntheticFiles,syntheticCatalog,syntheticImportAnswers} from '../scripts/syntheticPortfolioFixtures.mjs';
import {performanceFromStoredInput} from '../src/services/portfolioPerformance.js';
const files=()=>[syntheticFiles[0],syntheticFiles[1],syntheticFiles[5],syntheticFiles[3]];
test('opening requires no old transactions or sold holdings, and includes current fund units and certificate',()=>{
    const plan=preparePortfolioCsvImport(files(),syntheticImportAnswers,syntheticCatalog);
    assert.equal(plan.ready,true);assert.equal(plan.positions.length,6);assert.equal(plan.cash.length,4);
    assert.ok(plan.positions.some(p=>p.instrumentId==='synthetic-lysa-fund'));
    assert.ok(plan.positions.some(p=>p.assetType==='CERTIFICATE'));
    assert.deepEqual(plan.events,undefined);assert.deepEqual(plan.questions,[]);
});
test('cash and complete-scope confirmation remain required without turning missing GAV into a blocking requirement',()=>{
    const withoutCash=preparePortfolioCsvImport([syntheticFiles[5]],{},syntheticCatalog);
    assert.equal(withoutCash.ready,false);assert.ok(withoutCash.questions.some(q=>q.key==='cash:Lysa-ISK-test:SEK'));
    assert.ok(withoutCash.questions.some(q=>q.key==='scopeConfirmed'));
    const ready=preparePortfolioCsvImport(files(),syntheticImportAnswers,syntheticCatalog);
    assert.equal(ready.ready,true);assert.equal(ready.positions.find(p=>p.instrumentId==='synthetic-lysa-fund').averagePrice,null);
    const conflict=structuredClone(syntheticFiles[5]);conflict.text=conflict.text.replaceAll('2026-10-04','2026-10-05');
    assert.throws(()=>preparePortfolioCsvImport([syntheticFiles[0],conflict,syntheticFiles[3]],syntheticImportAnswers,syntheticCatalog),/samma datum/);
});
test('a corrected opening source blocks performance clearly instead of silently rebasing actual returns',()=>{
    const baseline={verified:true,coverage:'complete',source:'synthetic_test',date:'2026-10-04',positions:[],
        cash:[{accountId:'synthetic-cash',currency:'SEK',amount:100}],sourceReconciliationRequired:true};
    const performance=performanceFromStoredInput({apiVersion:'portfolio-performance-v1',baseline,events:[],observations:[]});
    assert.equal(performance.available,false);assert.match(performance.reason,/öppningsbalansen har rättats/);
});
