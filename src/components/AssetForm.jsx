import {useState} from "react";

function AssetForm({addAsset}) {
    const [assetName, setAssetName] = useState("");
    const [assetValue, setAssetValue] = useState("");
    const [assetCategory, setAssetCategory] = useState("");
    const [alertVisible, setAlertVisibility] = useState(false);

    const isBtnDisabled =
        assetName.trim() === "" ||
        assetCategory === "" ||
        Number(assetValue) < 1;

    const addNewAsset = (event) => {
        event.preventDefault();

        if (isBtnDisabled) {
            setAlertVisibility(true);
            return;
        }

        const cleanName = assetName.trim();

        const formattedName =
            cleanName.charAt(0).toUpperCase() +
            cleanName.slice(1);

        addAsset({
            name: formattedName,
            category: assetCategory,
            value: Number(assetValue),
            source: "manual"
        });

        setAssetValue("");
        setAssetName("");
        setAssetCategory("");
        setAlertVisibility(false);
    };

    return (
        <section className="card">
            <div className="section-heading">
                <div>
                    <span className="eyebrow">Övriga tillgångar</span>
                    <h2>Lägg till manuellt</h2>
                </div>
            </div>

            <form onSubmit={addNewAsset} className="asset-form">
                {alertVisible && (
                    <p className="form-message">
                        Kontrollera namn, kategori och värde.
                    </p>
                )}

                <select
                    value={assetCategory}
                    onChange={(event) =>
                        setAssetCategory(event.target.value)
                    }
                >
                    <option value="">Välj tillgångstyp</option>
                    <option value="crypto">Crypto</option>
                    <option value="cash">Cash</option>
                    <option value="other">Annat</option>
                </select>

                <input
                    type="text"
                    placeholder="Tillgångens namn"
                    value={assetName}
                    onChange={(event) =>
                        setAssetName(event.target.value)
                    }
                />

                <input
                    type="number"
                    min="0"
                    step="any"
                    value={assetValue}
                    placeholder="Värde i SEK"
                    onChange={(event) =>
                        setAssetValue(event.target.value)
                    }
                />

                <button
                    className="primary-button"
                    type="submit"
                    disabled={isBtnDisabled}
                >
                    Lägg till tillgång
                </button>
            </form>
        </section>
    );
}

export default AssetForm;
