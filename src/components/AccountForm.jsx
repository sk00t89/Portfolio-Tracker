import {useState} from "react";

function AccountForm({
                         getNextId,
                         setAccounts,
                     }) {

    const [accountName, setAccountName] = useState("");

    const [accountValue, setAccountValue] = useState("");

    const [accountType, setAccountType] = useState("");

    const [alertVisible, setAlertVisibility] = useState(false)

    return (
        <div>
            <button onClick={() => {
                if (accountType.trim() === "" || Number(accountValue) < 1 || accountName === "") {
                    setAlertVisibility(true)
                    return console.log("FEL inmatning, försök igen")
                }
                const cleanName = accountName.trim();
                const formattedName = cleanName.charAt(0).toUpperCase() +
                    cleanName.slice(1).toLowerCase()

                setAccounts(previousAccounts => [
                    ...previousAccounts,
                    {
                        id: getNextId(previousAccounts),
                        name: formattedName,
                        type: accountType,
                        value: Number(accountValue),

                    }

                ]);
                setAccountValue("");
                setAccountName("");
                setAccountType("");

                setAlertVisibility(false);
            }}>
                Lägg till testkonto
            </button>
            {alertVisible && <p>Fel inmatning, försök igen!</p>}
            <input
                type="text"
                value={accountName}
                onChange={(event) => {


                    setAccountName(event.target.value);
                }}
            />

            <p>Du skriver: {accountName}</p>

            <input
                type="number"
                value={accountValue}
                onChange={(event) => {
                    setAccountValue(event.target.value);

                }}

            />
            <p> Värdet på kontot : {Number(accountValue).toLocaleString("sv-SE")}</p>

            <select
                value={accountType}
                onChange={(event) => {
                    setAccountType(event.target.value)

                }}
            >
                <option value=""> Välj kontotyp</option>
                <option value="broker">Broker</option>
                <option value="crypto">Crypto</option>
                <option value="fund">Fund</option>
                <option value="cash">Cash</option>
            </select>


        </div>
    )

};

export default AccountForm;

