export const searchInstrument = async (query) => {
    const response = await fetch(
        `http://localhost:3001/api/search/${encodeURIComponent(query)}`
    );

    const data = await response.json();

    console.log("Market data:", data);

    return data;
};