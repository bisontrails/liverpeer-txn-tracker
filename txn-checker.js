require('dotenv').config();

const LivepeerSDK = require('@livepeer/sdk');
const Web3 = require('web3');
const SolidityCoder = require("./../web3.js/lib/solidity/coder.js");


const web3 = new Web3(new Web3.providers.HttpProvider('https://mainnet.infura.io'));

const LIVEPEER_CONTRACT = '0x511Bc4556D823Ae99630aE8de28b9B80Df90eA2e';

const TRANSFER_LOG_FN_CALL_SIG = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const REWARD_LOG_FN_CALL_SIG = '0x619caafabdd75649b302ba8419e48cccf64f37f1983ac4727cfb38b57703ffc9'.toLowerCase();
const BOND_LOG_FN_CALL_SIG = '0x926f98e4b543897a75b3e34b7494ba68a47829d3aa39ffd9c478ccc51bfbfb44';
const BOND_FN_CALL_SIG_2 = '0xe5917769f276ddca9f2ee7c6b0b33e1d1e1b61008010ce622c632dd20d168a23'.toLowerCase();
const REBOND_FN_CALL_SIG = '0x9f5b64cc71e1e26ff178caaa7877a04d8ce66fde989251870e80e6fbee690c17';
const UNBOND_FN_CALL_SIG = '0x2d5d98d189bee5496a08db2a5948cb7e5e786f09d17d0c3f228eb41776c24a06';

const BN_DIVIDE_BY = new web3.utils.BN(100000000000000);
const DIVIDE_BY_2 = 100000000;



const main = async () => {
    const livepeerSdk  = await LivepeerSDK.default();
    const { rpc } = livepeerSdk;

    const txHash = '0x7866dff777070cddbe5b1fe5862516b729ce6a407117d77f60ed149657b6ee68';
    console.log('fetching txn', txHash);
    try {
        // const txn = await web3.eth.getTransaction(txHash);
        const txnReceipt = await web3.eth.getTransactionReceipt(txHash);
        const fromAddress = txnReceipt.from;
        const blockNumber = txnReceipt.blockNumber;
        for(let j=0; j<txnReceipt.logs.length; j++) {
            const topics = txnReceipt.logs[j].topics;
            //TODO: claimEarnings
            //TODO: unbond
            //TODO: how to see if bonder switched transcoders... (this might require tracking the address that has bonded)
            if (topics[0].toString().toLowerCase() == REWARD_LOG_FN_CALL_SIG) {
                const rewardFloat = lptHexToNum(txnReceipt.logs[j].data);
                const blockInfo = await web3.eth.getBlock(blockNumber);
                const timestamp = blockInfo.timestamp;
                console.log('[reward] ' + fromAddress + ' called Reward, received ' + rewardFloat + ' LPT at block number ' + blockNumber + ' at ' + timestamp);
            } else if (topics[0].toString().toLowerCase() == BOND_FN_CALL_SIG_2) {
                const stripped0x = topics[1].substr(2, topics[1].length - 2);
                const transcoderAddress = SolidityCoder.decodeParam('address', stripped0x);
                console.log(transcoderAddress == '0x4ff088ac5422f994486663ff903b040692797168');
                const amountA = txnReceipt.logs[j].data.substr(2, 66);
                const amountB = txnReceipt.logs[j].data.substr(66, 64);

                const newBondAmount = lptBNToFloat(SolidityCoder.decodeParam('uint', amountA))/10000000000.0;
                const newTotalBondAmount = lptBNToFloat(SolidityCoder.decodeParam('uint', amountB))/10000000000.0;

                console.log('[bond] ' + fromAddress + ' bonded ' + newBondAmount + ' LPT to ' + transcoderAddress + ' total: ' + newTotalBondAmount + ' LPT');
            } else if (topics[0].toString().toLowerCase() == REBOND_FN_CALL_SIG) {
                const stripped0x = topics[1].substr(2, topics[1].length - 2);
                const transcoderAddress = SolidityCoder.decodeParam('address', stripped0x);
                // const amountA = txnReceipt.logs[j].data.substr(2, 66);
                const amountB = txnReceipt.logs[j].data.substr(66, 64);
                // const dunno = lptBNToFloat(SolidityCoder.decodeParam('uint', amountA))/10000000000.0;
                const amount = lptBNToFloat(SolidityCoder.decodeParam('uint', amountB))/10000000000.0;

                console.log('[rebond] ' + fromAddress + ' rebonded ' + amount + ' LPT to ' + transcoderAddress);

            } else if (topics[0].toString().toLowerCase() == UNBOND_FN_CALL_SIG) {
                console.log('unbond', txHash);
                console.log(txnReceipt.logs[j].data);
                console.log(topics);
            } else if (topics[0].toString().toLowerCase() == BOND_LOG_FN_CALL_SIG) {
                console.log('old bond i guess');
            } else {
                console.log(topics);
            }
        }
    } catch (ex) {
        console.log('faild');
    }

};

const lptHexToNum = (hex) => {
    const reward = new web3.utils.BN(web3.utils.hexToNumberString(hex));
    return lptBNToFloat(reward);
};

lptBNToFloat = (bn) => {
    const tmpBN = bn.div(BN_DIVIDE_BY);
    return parseFloat(bn.toString())/(DIVIDE_BY_2);
}

main();
