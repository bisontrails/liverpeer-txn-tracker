const csv = require('csvtojson');
const fs = require('fs');

const getTxnCsvs = async () => {
    const dir = './data/';
    const files = fs.readdirSync(dir);
    const toprocess = [];
    for(let i=0; i<files.length; i++) {
        const file = files[i];
        if(file.indexOf('.csv') > -1) {
            toprocess.push('./data/' + file);
        }
    }
    console.log(toprocess);

    return await Promise.all(toprocess.map(async (f) => await csv().fromFile(f)));
    //
    // return [
    //     await csv().fromFile('./data/a.csv'),
    //     await csv().fromFile('./data/b.csv'),
    //     await csv().fromFile('./data/c.csv'),
    //     await csv().fromFile('./data/d.csv'),
    //     await csv().fromFile('./data/e.csv')
    // ];
};

const compileTxnHistory = async () => {
    const txnCsvs = await getTxnCsvs();
    const compiledList = [];
    const seenTxn = {};
    for (let i=0; i<txnCsvs.length; i++) {
        const txns = txnCsvs[i];
        console.log('starting file ' + i);
        for (let j=0; j<txns.length; j++) {
            if (!seenTxn[txns[j].Txhash]) {
                seenTxn[txns[j].Txhash] = true;
                compiledList.push(txns[j]);
            }
        }
    }
    console.log('compiled ' + compiledList.length + ' transactions');
    return compiledList;
}

module.exports = compileTxnHistory;