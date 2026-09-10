import {useState} from "react";

function AccountForm({ addAccount}) {

    const [accountName, setAccountName] = useState("");

    const [accountValue, setAccountValue] = useState("");

    const [accountType, setAccountType] = useState("");

    const [alertVisible, setAlertVisibility] = useState(false);

    const isBtnDisabled =

        accountName.trim() === "" ||
        accountType === "" ||
        Number(accountValue) < 1
    ;



    const addNewAccount = (event) => {
        event.preventDefault();
        if (
            accountType.trim() === "" ||
            Number(accountValue) < 1 ||
            accountName.trim() === ""
        ) {
            setAlertVisibility(true);
            return;
        }

        const cleanName = accountName.trim();

        const formattedName =
            cleanName.charAt(0).toUpperCase() +
            cleanName.slice(1).toLowerCase();

        const newAccount = {
            name: formattedName,
            type: accountType,
            value: Number(accountValue)
        };

        addAccount(newAccount);

        setAccountValue("");
        setAccountName("");
        setAccountType("");
        setAlertVisibility(false);
    };


    return (
        <div className="card">
            <form onSubmit={addNewAccount} className="account-form">

                {alertVisible && <p>Fel inmatning, försök igen!</p>}
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
                <input
                    type="text"
                    placeholder="Fyll i kontots namn"
                    value={accountName}
                    onChange={(event) => {


                        setAccountName(event.target.value);
                    }}
                />

                <input
                    type="number"
                    value={accountValue}
                    placeholder="Fyll i kontots värde"
                    onChange={(event) => {
                        setAccountValue(event.target.value);

                    }}

                />


                <button className="primary-button"
                    type="submit"
                    disabled={isBtnDisabled}

                >
                    Lägg till konto
                </button>
            </form>

        </div>
    )

}


export default AccountForm;

