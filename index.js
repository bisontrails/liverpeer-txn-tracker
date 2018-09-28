require('dotenv').config();
const redis = require("redis");
const bluebird = require("bluebird");
bluebird.promisifyAll(redis);

const LivepeerSDK = require('@livepeer/sdk');
const Web3 = require('web3');
const SolidityCoder = require("./../web3.js/lib/solidity/coder.js");

const compileTxnHistory = require('./combine-txns-history.js');
const web3 = new Web3(new Web3.providers.HttpProvider('http://localhost:8545'));

const Json2csvParser = require('json2csv').Parser;
const fs = require("fs");

const RDS_TXN_PRE = 'eth_txn_receipt.';
const RDS_BLOCK_PRE = 'eth_block.';


const LIVEPEER_CONTRACT = '0x511Bc4556D823Ae99630aE8de28b9B80Df90eA2e';
const VALIDATOR_ADDRESS ='0x5340fdE146C4fEf52558FE0943A23605CE160AF9'.toLowerCase();

const TRANSFER_LOG_FN_CALL_SIG = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const REWARD_LOG_FN_CALL_SIG = '0x619caafabdd75649b302ba8419e48cccf64f37f1983ac4727cfb38b57703ffc9'.toLowerCase();
const BOND_LOG_FN_CALL_SIG = '0x926f98e4b543897a75b3e34b7494ba68a47829d3aa39ffd9c478ccc51bfbfb44';
const REBOND_FN_CALL_SIG = '0x9f5b64cc71e1e26ff178caaa7877a04d8ce66fde989251870e80e6fbee690c17';
const UNBOND_FN_CALL_SIG = '0x2d5d98d189bee5496a08db2a5948cb7e5e786f09d17d0c3f228eb41776c24a06';
const BOND_FN_CALL_SIG_2 = '0xe5917769f276ddca9f2ee7c6b0b33e1d1e1b61008010ce622c632dd20d168a23'.toLowerCase();


const E_REWARD = 'REWARD';
const E_BOND = 'BOND';
const E_UNBOND = 'UNBOND';
const E_REBOND = 'REBOND';
const E_MOVE_BOND = 'MOVE_BOND';

const BN_DIVIDE_BY = new web3.utils.BN(100000000000000);
const DIVIDE_BY_2 = 100000000;

const redisClient = redis.createClient();

const main = async () => {

    //const livepeerSdk  = await LivepeerSDK.default();
    // const { rpc } = livepeerSdk;
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

    const acctTxns = await compileTxnHistory();

    const bondedAccounts = [];
    const bondedAccountsAmount = {};
    const transcoderTracker = [];
    const data = {
        totalBonded: 0.0,
        totalBondAmount: []
    };

    for(let i=0; i<acctTxns.length; i++) {
        const txHash = acctTxns[i].Txhash;
        // const txHash = '0xc738398fed8efa17ee69aca44c5bfa08c2fc85aeb8664fe6723f169f30b77407';
        // const txHash = '0xb1dab7ebb7c8e1fe8adf35671270b5f92dab40bc34dce2c7415ee064f40da1de';
        // console.log('fetching txn', txHash);
        try {
            // const txn = await web3.eth.getTransaction(txHash);
            if (txHash) {
                const txnReceipt = await getEthTransactionReceipt(txHash);
                const fromAddress = txnReceipt.from;
                const toAddress = txnReceipt.to;
                const blockNumber = txnReceipt.blockNumber;
                const info = {};
                for (let j = 0; j < txnReceipt.logs.length; j++) {
                    const topics = txnReceipt.logs[j].topics;
                    //TODO: claimEarnings
                    //TODO: how to see if bonder switched transcoders... (this might require tracking the address that has bonded)
                    if (topics[0].toString().toLowerCase() == REWARD_LOG_FN_CALL_SIG) {
                        const rewardFloat = lptHexToNum(txnReceipt.logs[j].data) / 10000000000.0;
                        if (fromAddress == VALIDATOR_ADDRESS) {
                            const blockInfo = await getEthBlock(blockNumber);
                            const timestamp = blockInfo.timestamp;
                            // console.log('[reward] ' + fromAddress + ' called Reward, received ' + rewardFloat + ' LPT at block number ' + blockNumber + ' at ' + timestamp) + ' [' + txHash + ']';
                            if (rewardFloat) {
                                data.totalBonded += rewardFloat;
                            }
                            await trackEvent(txHash, E_REWARD, fromAddress, toAddress, rewardFloat, blockNumber, transcoderTracker);
                        }
                        // console.log('for address', SolidityCoder.decodeParam('address', topics[1]));
                    } else if (topics[0].toString().toLowerCase() == BOND_FN_CALL_SIG_2) {
                        const stripped0x = topics[1].substr(2, topics[1].length - 2);
                        const transcoderAddress = SolidityCoder.decodeParam('address', stripped0x);

                        const amountA = txnReceipt.logs[j].data.substr(2, 66);
                        const amountB = txnReceipt.logs[j].data.substr(66, 64);

                        const newBondAmount = lptBNToFloat(SolidityCoder.decodeParam('uint', amountA)) / 10000000000.0;
                        const newTotalBondAmount = lptBNToFloat(SolidityCoder.decodeParam('uint', amountB)) / 10000000000.0;

                        let addedBond = 0.0;
                        if (newBondAmount) {
                            addedBond = newBondAmount;
                        } else if (bondedAccountsAmount[fromAddress]) {
                            addedBond = bondedAccountsAmount[fromAddress];
                        }

                        if (transcoderAddress.toLowerCase() == VALIDATOR_ADDRESS) {
                            data.totalBondAmount.push(newTotalBondAmount);
                            data.totalBonded += addedBond;
                            console.log('[bond] ' + fromAddress + ' bonded ' + addedBond + ' LPT to ' + transcoderAddress + ' total: ' + newTotalBondAmount + ' LPT' + ' [' + txHash + ']');
                            await trackEvent(txHash, E_BOND, fromAddress, toAddress, addedBond, blockNumber, transcoderTracker);
                            addToBondedAccounts(fromAddress, newBondAmount, bondedAccounts, bondedAccountsAmount);
                        } else if (transcoderAddress.toLowerCase() != VALIDATOR_ADDRESS && bondedAccounts.indexOf(fromAddress) > -1) {
                            const blockInfo = await getEthBlock(blockNumber);
                            console.log(fromAddress + ' went somewhere else!!! ' + txHash);
                            const amountMoving = bondedAccountsAmount[fromAddress];
                            data.totalBonded -= amountMoving;
                            bondedAccounts.splice(bondedAccounts.indexOf(fromAddress), 1);
                            await trackEvent(txHash, E_MOVE_BOND, fromAddress, toAddress, -amountMoving, blockNumber, transcoderTracker);
                        }
                        addToBondedAccountsAmount(fromAddress, newBondAmount, bondedAccountsAmount);
                    } else if (topics[0].toString().toLowerCase() == REBOND_FN_CALL_SIG) {
                        const stripped0x = topics[1].substr(2, topics[1].length - 2);
                        const transcoderAddress = SolidityCoder.decodeParam('address', stripped0x);
                        if (transcoderAddress.toLowerCase() == VALIDATOR_ADDRESS) {
                            const amountHex = txnReceipt.logs[j].data.substr(66, 64);
                            const amount = lptBNToFloat(SolidityCoder.decodeParam('uint', amountHex)) / 10000000000.0;
                            console.log('[rebond] ' + fromAddress + ' rebonded ' + amount + ' LPT to ' + transcoderAddress + ' [' + txHash + ']');
                            addToBondedAccounts(fromAddress, amount, bondedAccounts, bondedAccountsAmount);
                            if (amount) {
                                data.totalBonded += amount;
                                await trackEvent(txHash, E_REBOND, fromAddress, toAddress, amount, blockNumber, transcoderTracker);
                            }
                        }
                    } else if (topics[0].toString().toLowerCase() == UNBOND_FN_CALL_SIG) {
                        //todo: figure out how withdraw round affects things here
                        const stripped0x = topics[1].substr(2, topics[1].length - 2);
                        const transcoderAddress = SolidityCoder.decodeParam('address', stripped0x);
                        if (bondedAccounts.indexOf(fromAddress) > -1) {
                            if (transcoderAddress == VALIDATOR_ADDRESS) {
                                const amountHex = txnReceipt.logs[j].data.substr(66, 64);
                                const amount = lptBNToFloat(SolidityCoder.decodeParam('uint', amountHex)) / 10000000000.0;
                                console.log('[unbond] ' + fromAddress + ' unbonded ' + amount + ' LPT from ' + transcoderAddress + ' [' + txHash + ']');
                                bondedAccounts.splice(bondedAccounts.indexOf(fromAddress), 1);
                                if (amount) {
                                    data.totalBonded -= amount;
                                }
                                await trackEvent(txHash, E_UNBOND, fromAddress, toAddress, -amount, blockNumber, transcoderTracker);
                            }
                        }
                    } else if (topics[0].toString().toLowerCase() == BOND_LOG_FN_CALL_SIG) {
                        const stripped0x = topics[1].substr(2, topics[1].length - 2);
                        const transcoderAddress = SolidityCoder.decodeParam('address', stripped0x);
                        if (transcoderAddress.toLowerCase() == VALIDATOR_ADDRESS) {

                            let addedBond = 0.0;
                            if (info.transferAmount) {
                                addedBond += info.transferAmount;
                            } else if (bondedAccountsAmount[fromAddress]) {
                                addedBond += bondedAccountsAmount[fromAddress];
                            }
                            data.totalBonded += addedBond;
                            await trackEvent(txHash, E_BOND, fromAddress, toAddress, addedBond, blockNumber, transcoderTracker);
                            addToBondedAccounts(fromAddress, info.transferAmount, bondedAccounts, bondedAccountsAmount);
                            console.log('[bond] ' + fromAddress + ' bonded ' + addedBond + ' LPT to ' + transcoderAddress + ' [' + txHash + ']');

                        } else if (transcoderAddress.toLowerCase() != VALIDATOR_ADDRESS && bondedAccounts.indexOf(fromAddress) > -1) {
                            console.log(fromAddress + ' went somewhere else!!! ' + txHash);
                            const amountMoving = bondedAccountsAmount[fromAddress];
                            data.totalBonded -= amountMoving;
                            await trackEvent(txHash, E_MOVE_BOND, fromAddress, toAddress, -amountMoving, blockNumber, transcoderTracker);
                        }
                        addToBondedAccountsAmount(fromAddress, info.transferAmount, bondedAccountsAmount);
                    } else if (topics[0].toString().toLowerCase() == TRANSFER_LOG_FN_CALL_SIG) {
                        // const stripped0x = topics[1].substr(2, topics[1].length - 2);
                        // const transcoderAddress = SolidityCoder.decodeParam('address', stripped0x);
                        info.transferAmount = lptHexToNum(txnReceipt.logs[j].data) / 10000000000.0;

                    }
                }
            }
        } catch (ex) {
            console.log('faild: ' + ex.toString().substr(0, 30));
            console.log(ex);
            console.log(txHash);
            if (ex.toString().indexOf("Invalid JSON RPC") > -1) {
                //do a pause in case we are being rate limited
                await timeout(1000);
            }
        }

    }

    console.log('Transcoder ' + VALIDATOR_ADDRESS + ' has ' + data.totalBonded + ' LPT bonded.');

    const fields = ['txHash', 'type', 'fromAddress', 'toAddress', 'amount', 'date', 'time'];
    const opts = { fields };

    //write csv file
    try {
        const parser = new Json2csvParser(opts);
        const csv = parser.parse(transcoderTracker);
        fs.writeFile("./output/" + VALIDATOR_ADDRESS + ".csv", csv, (err) => {
            if (err) {
                console.error(err);
                return;
            };
            console.log("File has been created");
        });

    } catch (err) {
        console.error(err);
    }
};


const timeout = (ms) => new Promise(res => setTimeout(res, ms));

const getEthTransactionReceipt = async (txnHash) => {
    const key = RDS_TXN_PRE + txnHash;
    const receiptRds = await redisClient.getAsync(key);
    if (receiptRds != null && receiptRds !== 'null') {
        return JSON.parse(receiptRds);
    }
    const receipt = await web3.eth.getTransactionReceipt(txnHash);
    redisClient.set(key, JSON.stringify(receipt));
    return receipt;
};

const getEthBlock = async (blockNum) => {
    const key = RDS_BLOCK_PRE + blockNum;
    const blockRds = await redisClient.getAsync(key);
    if (blockRds != null) {
        return JSON.parse(blockRds);
    }
    const block = await web3.eth.getBlock(blockNum);
    redisClient.set(key, JSON.stringify(block));
    return block;
};

const lptHexToNum = (hex) => {
    const reward = new web3.utils.BN(web3.utils.hexToNumberString(hex));
    return lptBNToFloat(reward);
};

const lptBNToFloat = (bn) => {
    const tmpBN = bn.div(BN_DIVIDE_BY);
    return parseFloat(bn.toString())/(DIVIDE_BY_2);
}

const addToBondedAccounts = (address, amount, bondedAccounts) => {
    if (bondedAccounts.indexOf(address) == -1) {
        bondedAccounts.push(address);
    }
}

const trackEvent = async (txHash, type, fromAddress, toAddress, amount, blockNumber, tracker) => {
    const blockInfo = await getEthBlock(blockNumber);
    tracker.push({
        txHash,
        type,
        fromAddress,
        toAddress,
        amount,
        date: new Date(blockInfo.timestamp*1000),
        time: blockInfo.timestamp
    });
}

const addToBondedAccountsAmount = (address, amount, bondedAccountsAmount) => {
    if (!bondedAccountsAmount[address]) {
        bondedAccountsAmount[address] = 0.0;
    }
    if (amount) bondedAccountsAmount[address] += amount;
}

main();
