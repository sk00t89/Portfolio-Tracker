function Settings({ resetAccounts }) {
    return (
        <div>
            <h1>Settings</h1>

            <button onClick={resetAccounts}>
                Återställ testdata
            </button>
        </div>
    );
}
export default  Settings ;