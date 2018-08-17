const LivepeerSDK = require('@livepeer/sdk');
const Web3 = require('web3');
const csv = require('csvtojson');



const LIVEPEER_CONTRACT = '0x511Bc4556D823Ae99630aE8de28b9B80Df90eA2e';

const TRANSFER_LOG_FN_CALL_SIG = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const REWARD_LOG_FN_CALL_SIG = '0x619caafabdd75649b302ba8419e48cccf64f37f1983ac4727cfb38b57703ffc9';
const BOND_LOG_FN_CALL_SIG = '0x926f98e4b543897a75b3e34b7494ba68a47829d3aa39ffd9c478ccc51bfbfb44';


const main = async () => {
    const web3 = new Web3(new Web3.providers.HttpProvider('https://mainnet.infura.io'));

    const livepeerSdk  = await LivepeerSDK.default();
    const { rpc } = livepeerSdk;
    // const tokens = await rpc.getTokenTotalSupply();
    //
    // console.log('total supply', tokens);
    //
    // const status = await rpc.getDelegatorStatus('');
    // console.log('status', status);
    //
    // const delegator = await rpc.getDelegator('');
    // console.log('delegator', delegator);
    //
    // const transcoder  = await rpc.getTranscoder('');
    // console.log('transcoder', transcoder);

    //const acctTxns = await csv().fromFile('./data/export-.csv');
    //for(let i=0; i<acctTxns.length; i++) {
        //const txHash = acctTxns[i].Txhash;
        const txHash = '';
        console.log('fetching txn',txHash)
        const txn = await web3.eth.getTransaction(txHash);
        const txnReceipt = await web3.eth.getTransactionReceipt(txHash);
        console.log(txnReceipt);
        for(let j=0; j<txnReceipt.logs.length; j++) {
            console.log(txnReceipt.logs[j].topics)
        }

    // }

};

main();


