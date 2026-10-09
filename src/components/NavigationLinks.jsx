import { NavLink } from "react-router-dom";

const destinations = [
    {to:"/",label:"Dashboard",path:"M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z"},
    {to:"/holdings",label:"Innehav",path:"M4 20V12h4v8z M10 20V7h4v13z M16 20V3h4v17z"},
    {to:"/import",label:"Import",path:"M12 3v12 M7 10l5 5 5-5 M4 16v5h16v-5"},
    {to:"/help",label:"Hjälp",desktop:true},
    {to:"/settings",label:"Inställningar",path:"M3 6h18 M3 12h18 M3 18h18 M8 3v6 M16 9v6 M8 15v6"},
];

export default function NavigationLinks({holdingsAttentionCount=0}) {
    return <ul className="nav-links">{destinations.map(item => <li key={item.to} className={item.desktop ? "nav-help-link" : undefined}>
        <NavLink to={item.to} end={item.to === "/"} className={({isActive}) => isActive ? "nav-link active" : "nav-link"}>
            {item.path && <svg className="nav-mobile-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d={item.path}/></svg>}
            <span>{item.label}</span>
            {item.to === "/holdings" && holdingsAttentionCount>0 && <span className="nav-notification-badge" title={`${holdingsAttentionCount} saker behöver din uppmärksamhet`}>{holdingsAttentionCount}</span>}
        </NavLink>
    </li>)}</ul>;
}
