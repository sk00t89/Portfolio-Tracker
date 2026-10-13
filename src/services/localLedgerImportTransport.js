// The local adapter remains the default. A future staging adapter must be
// explicitly supplied; this module never selects a cloud URL from configuration.
export function createLocalLedgerImportTransport(client, fetcher = fetch) {
    return {
        async fixtures() {
            const response = await fetcher('/api/local-test/fixtures');
            if (!response.ok) throw new Error('Starta den lokala testservern.');
            return (await response.json()).files;
        },
        async request(action, files, answers) {
            if (!['preview', 'commit'].includes(action)) throw new Error('Ogiltigt importsteg.');
            const session = await client.auth.getSession();
            const token = session.data?.session?.access_token;
            if (session.error || !token) throw new Error('Logga in innan du importerar.');
            const response = await fetcher(`/api/local-test/import/${action}`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json', Authorization: `Bearer ${token}`},
                body: JSON.stringify({files, answers}),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error);
            return data;
        },
    };
}
