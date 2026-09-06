function Allocation({ totalsByType, portfolioValue }) {
    return (
        <div>
            {Object.entries(totalsByType).map(([type, value]) => (
                <p key={type}>
                    {type}: {value.toLocaleString("sv-SE")} kr -{" "}
                    {((value / portfolioValue) * 100).toLocaleString("sv-SE", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2
                    })} %
                </p>
            ))}
        </div>
    );
}

export default Allocation;