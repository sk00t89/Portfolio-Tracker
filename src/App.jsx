import AccountList from './components/AccountList.jsx';
import Allocation from "./components/Allocation.jsx";
import { useState } from 'react';

function App() {
    const [showAllocation, setShowAllocation] = useState(true);

    const [accounts, setAccounts] = useState( [
      {
          id: 1,
          name: "Avanza",
          type: "broker",
          value: 500000
      },
      {
          id: 2,
          name: "Nordnet",
          type: "broker",
          value: 200000
      },
      {
          id: 3,
          name: "Lysa",
          type: "fund",
          value: 200000
      },
      {
          id: 4,
          name: "Krypto",
          type: "crypto",
          value: 100000
      },
      {
          id: 5,
          name: "Sparkonto",
          type: "cash",
          value: 150000
      }
  ]);



  const portfolioValue = accounts.reduce((total, account) => {
    return total + account.value;
  }, 0);

  const totalsByType = accounts.reduce((total, account) => {
      total[account.type] = (total[account.type] || 0) + account.value;
      return total;
  }, {});



  const investedCapital = 800000;

  return (
      <div>
        <h1>Portfolio Tracker</h1>

        <h2>Totalt portföljvärde</h2>
        <p>{portfolioValue.toLocaleString("sv-SE")} kr</p>
        <p>Insatt kapital {investedCapital.toLocaleString("sv-SE")} kr</p>

        <h2>Fördelning</h2>
        <AccountList
            accounts={accounts}
            portfolioValue={portfolioValue}
        />

          <button onClick={() => {
              setAccounts(previousAccounts => [
                  ...previousAccounts,
                  {
                      id: previousAccounts.length + 1,
                      name: "Testkonto",
                      type: "broker",
                      value: 50000
                  }
              ]);
          }}>
              Lägg till testkonto
          </button>

        <h2>Konton som är lika med eller överstiger 200 000 kr</h2>
        {accounts.filter(account => account.value >= 200000 ).map(account => {
            return (
                <p> {account.name}: {account.value.toLocaleString("sv-SE")} kr </p>
        )})}

        <h2>Summa alla konton 200 000 kr eller mer</h2>
        <p>
        {accounts.filter(account => account.value >= 200000)
            .reduce((total, account) => {

          return total + account.value;
        },0).toLocaleString("sv-SE")

        } kr
        </p>


        <h2>Kapitalförändring</h2>
        <p>+ {((portfolioValue / investedCapital -1)  * 100 ).toFixed(2)} %</p>
        <p>+ {(portfolioValue - investedCapital).toLocaleString("sv-SE")} kr</p>

        <h2>Allokering per kategori</h2>
          {showAllocation ? <Allocation
              totalsByType={totalsByType}
              portfolioValue={portfolioValue}
          /> : null}


        <button onClick={() => {
            setShowAllocation(previous => !previous);

        }}>
            {showAllocation ? "Dölj allokering" : "Visa allokering"}
        </button>

      </div>
  );
}

export default App;