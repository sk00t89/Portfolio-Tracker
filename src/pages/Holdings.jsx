import {formatSek} from "../utils/formatting.js";
function Holdings({ holdings }) {
    return (
        <div className="holdings-page">
            <h1>Innehav</h1>

            <div className="holdings-list">
                {holdings.map((holding) => (
                    <div className="holding-card" key={holding.id}>
                        <div>
                            <h3>{holding.name}</h3>
                            <p>{holding.platform}</p>
                        </div>

                        <div>
                            <p>
                                {holding.quantity.toLocaleString("sv-SE")} st
                            </p>

                            <strong>
                                {formatSek(holding.valueSek)} kr
                            </strong>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

export default Holdings;