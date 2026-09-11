function Settings({ resetPortfolio }) {

    const warning = () => {
        if (confirm("Återställ portfölj?")) {
            resetPortfolio();
        }
    };
    return (
        <div>
            <h1>Settings</h1>

            <button onClick={warning} type="button"

            >
                Återställ testdata
            </button>
        </div>
    );
}
export default  Settings ;