// Quote-aware CSV/TSV parsing, shared by the original broker adapters and journal import.
export function delimitedRows(text, separator) {
    const rows=[];let row=[],cell='',quoted=false;
    const input=text.replace(/^\uFEFF/,'').replaceAll('\r\n','\n');
    for(let i=0;i<input.length;i++) {
        const char=input[i];
        if(char==='"') {
            if(quoted&&input[i+1]==='"'){cell+='"';i++;}
            else if(quoted||cell.trim()==='')quoted=!quoted;
            else throw new Error('CSV-filen har ett ogiltigt citattecken. Exportera filen igen.');
        } else if(char===separator&&!quoted){row.push(cell.trim());cell='';}
        else if((char==='\n'||char==='\r')&&!quoted){row.push(cell.trim());if(row.some(value=>value!==''))rows.push(row);row=[];cell='';}
        else cell+=char;
    }
    if(quoted)throw new Error('CSV-filen verkar vara avklippt. Exportera filen igen.');
    row.push(cell.trim());if(row.some(value=>value!==''))rows.push(row);
    if(rows.some(values=>values.length!==rows[0].length))throw new Error('En rad i CSV-filen saknar uppgifter. Exportera filen igen.');
    return rows;
}
export function csvNumber(value) {
    if(value==null||String(value).trim()==='')return null;
    const clean=String(value).replace(/[ \u00a0\u202f]/g,'').replace(',','.');
    if(!/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(clean))return NaN;
    return Number(clean);
}
export function csvObjects(text,separator) {
    const [header,...rows]=delimitedRows(text,separator);
    if(!header)return [];
    if(new Set(header).size!==header.length)throw new Error('CSV-filen har dubbla kolumnnamn.');
    return rows.map(row=>Object.fromEntries(header.map((name,i)=>[name,row[i]])));
}
