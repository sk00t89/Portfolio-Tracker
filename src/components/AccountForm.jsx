import {useState} from "react";

function AccountForm({ addAccount}) {

    const [accountName, setAccountName] = useState("");

    const [accountValue, setAccountValue] = useState("");

    const [accountCategory, setAccountCategory] = useState("");

    const [alertVisible, setAlertVisibility] = useState(false);

    const isBtnDisabled =

        accountName.trim() === "" ||
        accountCategory === "" ||
        Number(accountValue) < 1
    ;



    const addNewAccount = (event) => {
        event.preventDefault();
        if (
            accountCategory.trim() === "" ||
            Number(accountValue) < 1 ||
            accountName.trim() === ""
        ) {
            setAlertVisibility(true);
            return;
        }

        const cleanName = accountName.trim();

        const formattedName =
            cleanName.charAt(0).toUpperCase() +
            cleanName.slice(1);

        const newAccount = {
            name: formattedName,
            category: accountCategory,
            value: Number(accountValue),
            type: "manual"
        };

        addAccount(newAccount);

        setAccountValue("");
        setAccountName("");
        setAccountCategory("");
        setAlertVisibility(false);
    };


    return (
        <div className="card">
            <form onSubmit={addNewAccount} className="account-form">

                {alertVisible && <p>Fel inmatning, försök igen!</p>}
                <select
                    value={accountCategory}
                    onChange={(event) => {
                        setAccountCategory(event.target.value)

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

