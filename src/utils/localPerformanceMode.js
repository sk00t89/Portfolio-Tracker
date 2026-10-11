import {assertLocalPerformanceUrl} from '../services/localPerformanceClient.js';

// No remote activation switch: this integration is confined to the approved local build.
export function localPerformanceMode(env, origin) {
    if (env.VITE_LOCAL_PERFORMANCE_TEST !== 'true') return false;
    assertLocalPerformanceUrl(env.VITE_LOCAL_TEST_SUPABASE_URL);
    if (env.VITE_SUPABASE_URL) assertLocalPerformanceUrl(env.VITE_SUPABASE_URL);
    if (origin !== 'http://127.0.0.1:55800') throw new Error('Journalintegrationen är endast godkänd i lokal testmiljö.');
    return true;
}
