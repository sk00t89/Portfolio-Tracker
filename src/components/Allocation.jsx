import {formatSek} from "../utils/formatting.js";

function Allocation({ portfolioValue, totalsByCategory }) {
    return (
        <div className="card">
            {Object.entries(totalsByCategory).map(([type, value]) => (
                <p key={type}>
                    {type}: {formatSek(value)}  -{" "}
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