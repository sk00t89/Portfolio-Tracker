import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewedFundPublicationCalendar,reviewedPublicFundRules} from '../supabase/functions/_shared/fundPublicationCalendar.js';
const calendar=reviewedFundPublicationCalendar(reviewedPublicFundRules);
test('issuer closure for Access Asien is narrowly scoped and never inferred for other days or classes',async()=>{
    const listing={isin:'SE0007074117',currency:'SEK'};
    assert.equal((await calendar(listing,'2026-10-09')).publicationExpected,false);
    assert.equal((await calendar(listing,'2026-10-12')).verified,false);
    assert.equal((await calendar({...listing,currency:'USD'},'2026-10-09')).verified,false);
});
test('Spiltan issuer bank days, no-NAV closure and half day are separate',async()=>{
    const listing={isin:'SE0004297927',currency:'SEK'};
    assert.equal((await calendar(listing,'2026-06-19')).publicationExpected,false);
    assert.equal((await calendar(listing,'2026-10-10')).publicationExpected,false);
    assert.equal((await calendar(listing,'2026-10-30')).publicationExpected,true);
    assert.equal((await calendar(listing,'2026-10-08')).maxPublicationDelayBankDays,1);
    assert.equal((await calendar(listing,'2027-01-01')).verified,false);
});
