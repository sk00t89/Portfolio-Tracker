import test from 'node:test';
import assert from 'node:assert/strict';
import {pendingHistoryMessage} from '../src/utils/localHistoryStatus.js';

test('history notices exclude unfinished days and recovered observations',()=>{
    const run={status:'failed',valuation_date:'2026-10-11',reason:'Invalid finalized observation'};
    assert.equal(pendingHistoryMessage(run,[],'2026-10-11'),null);
    assert.equal(pendingHistoryMessage(run,[],'2026-10-10'),null);
    assert.equal(pendingHistoryMessage(run,[{date:run.valuation_date}],'2026-10-12'),null);
});
test('missing completed-day history remains visible without raw server errors',()=>{
    const run={status:'failed',valuation_date:'2026-10-09',reason:'Invalid finalized observation'};
    const message=pendingHistoryMessage(run,[],'2026-10-11');
    assert.match(message,/2026-10-09/);
    assert.match(message,/kunde inte verifieras/);
    assert.doesNotMatch(message,/Invalid finalized/);
    run.reason='Historisk fond-NAV saknas för 2026-10-09.';
    assert.match(pendingHistoryMessage(run,[],'2026-10-11'),/fond-NAV saknas/);
});
