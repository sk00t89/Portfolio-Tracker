export default function ManualAssetsStatus({ state, email }) {
    if (state.error) return <section className="card manual-assets-status" role="alert"><p>{state.error}</p><p>Lokala original och säkerhetskopior behålls. Ladda om efter att schema eller anslutning har åtgärdats.</p></section>;
    if (!state.pending) return null;
    return <section className="card manual-assets-status">
        <h2>Flytta dina manuella tillgångar</h2>
        <p>{state.pending.assets.length} lokala tillgångar saknar kontokoppling. Bekräfta att de tillhör {email ?? "det inloggade kontot"} innan de flyttas till Supabase.</p>
        <ul>{state.pending.assets.map((asset, index) => <li key={index}>{asset.name} · {asset.value.toLocaleString("sv-SE")} kr</li>)}</ul>
        <div className="manual-assets-actions">
            <button className="primary-button" type="button" disabled={state.busy} onClick={() => void state.migrate()}>Flytta till detta konto</button>
            <button className="ghost-button" type="button" disabled={state.busy} onClick={() => void state.useCloudOnly()}>Tillhör ett annat konto</button>
        </div>
        <p>Ingen automatisk tilldelning görs. Originalet tas bort först efter lyckad import; en lokal säkerhetskopia behålls.</p>
    </section>;
}
