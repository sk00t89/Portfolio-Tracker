import {useState} from "react";

function AssetForm({ addAsset}) {

    const [assetName, setAssetName] = useState("");

    const [assetValue, setAssetValue] = useState("");

    const [assetCategory, setAssetCategory] = useState("");

    const [alertVisible, setAlertVisibility] = useState(false);

    const isBtnDisabled =

        assetName.trim() === "" ||
        assetCategory === "" ||
        Number(assetValue) < 1
    ;



    const addNewAsset = (event) => {
        event.preventDefault();
        if (
            assetCategory.trim() === "" ||
            Number(assetValue) < 1 ||
            assetName.trim() === ""
        ) {
            setAlertVisibility(true);
            return;
        }

        const cleanName = assetName.trim();

        const formattedName =
            cleanName.charAt(0).toUpperCase() +
            cleanName.slice(1);

        const newAsset = {
            name: formattedName,
            category: assetCategory,
            value: Number(assetValue),
            source: "manual"
        };

        addAsset(newAsset);

        setAssetValue("");
        setAssetName("");
        setAssetCategory("");
        setAlertVisibility(false);
    };


    return (
        <div className="card">
            <form onSubmit={addNewAsset} className="asset-form">

                {alertVisible && <p>Fel inmatning, försök igen!</p>}
                <select
                    value={assetCategory}
                    onChange={(event) => {
                        setAssetCategory(event.target.value)

                    }}
                >
                    <option value=""> Välj tillgångstyp</option>
                    <option value="crypto">Crypto</option>
                    <option value="cash">Cash</option>
                    <option value="other">Annat</option>
                </select>
                <input
                    type="text"
                    placeholder="Fyll i tillgångens namn"
                    value={assetName}
                    onChange={(event) => {


                        setAssetName(event.target.value);
                    }}
                />

                <input
                    type="number"
                    value={assetValue}
                    placeholder="Fyll i tillgångens värde"
                    onChange={(event) => {
                        setAssetValue(event.target.value);

                    }}

                />


                <button className="primary-button"
                    type="submit"
                    disabled={isBtnDisabled}

                >
                    Lägg till manuell tillgång
                </button>
            </form>

        </div>
    )

}


export default AssetForm;

