const logger = Moralis.Cloud.getLogger();

const web3Main = Moralis.web3ByChain("0x4"); // Rinkeby Testnet
const web3Side = Moralis.web3ByChain("0x61"); // BSC Testnet

const EthBridge_address = "0x371BC1C8963f7a2d9b09DD3e0ce2491d39eb9eF0";
const BscBridge_address = "0x95c8bc60857d0dc9dF7e33C55Bdd2C140aB291E3";
const mainTokenEth_address = "0x911d73626B880c2f073CcEEE4bD86575a40c5f81";
const mainTokenBsc_address = "0xdEA1817BBF6597E38eBc0D14a4c324844bbD9D4B";
const gateway_address = "0x5B78a48569BF8CD5c894E6823716fb2E48Cd54cA";
const gatewayKey = "2e2f3b2f9c544f6790da66eb1172436f90c814f291353ecebc500ad456c820c7";
const EthBridge_abi = '[{"inputs":[{"internalType":"address","name":"_mainToken","type":"address"},{"internalType":"address","name":"_gateway","type":"address"},{"internalType":"address","name":"_tokenWallet","type":"address"}],"stateMutability":"nonpayable","type":"constructor"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"requester","type":"address"},{"indexed":true,"internalType":"bytes32","name":"sideDepositHash","type":"bytes32"},{"indexed":false,"internalType":"uint256","name":"amount","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"timestamp","type":"uint256"}],"name":"TransferIn","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"requester","type":"address"},{"indexed":true,"internalType":"bytes32","name":"mainDepositHash","type":"bytes32"},{"indexed":false,"internalType":"uint256","name":"amount","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"timestamp","type":"uint256"}],"name":"TransferOut","type":"event"},{"inputs":[{"internalType":"address","name":"_requester","type":"address"},{"internalType":"uint256","name":"_bridgedAmount","type":"uint256"},{"internalType":"bytes32","name":"_sideDepositHash","type":"bytes32"}],"name":"TransferFromBridge","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"_requester","type":"address"},{"internalType":"uint256","name":"_bridgedAmount","type":"uint256"},{"internalType":"bytes32","name":"_mainDepositHash","type":"bytes32"}],"name":"TransferToBridge","outputs":[],"stateMutability":"nonpayable","type":"function"}]';
const BscBridge_abi = '[{"inputs":[{"internalType":"address","name":"_mainToken","type":"address"},{"internalType":"address","name":"_gateway","type":"address"},{"internalType":"address","name":"_tokenWallet","type":"address"}],"stateMutability":"nonpayable","type":"constructor"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"requester","type":"address"},{"indexed":true,"internalType":"bytes32","name":"sideDepositHash","type":"bytes32"},{"indexed":false,"internalType":"uint256","name":"amount","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"timestamp","type":"uint256"}],"name":"TransferIn","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"requester","type":"address"},{"indexed":true,"internalType":"bytes32","name":"mainDepositHash","type":"bytes32"},{"indexed":false,"internalType":"uint256","name":"amount","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"timestamp","type":"uint256"}],"name":"TransferOut","type":"event"},{"inputs":[{"internalType":"address","name":"_requester","type":"address"},{"internalType":"uint256","name":"_bridgedAmount","type":"uint256"},{"internalType":"bytes32","name":"_sideDepositHash","type":"bytes32"}],"name":"TransferFromBridge","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"_requester","type":"address"},{"internalType":"uint256","name":"_bridgedAmount","type":"uint256"},{"internalType":"bytes32","name":"_mainDepositHash","type":"bytes32"}],"name":"TransferToBridge","outputs":[],"stateMutability":"nonpayable","type":"function"}]';
const EthBridge = new web3Main.eth.Contract(JSON.parse(EthBridge_abi),EthBridge_address);
const BscBridge = new web3Side.eth.Contract(JSON.parse(BscBridge_abi),BscBridge_address);

Moralis.Cloud.afterSave("TokenTransferETH", (request) => {
    const data = JSON.parse(JSON.stringify(request.object, ["address", "to", "from","transaction_hash","value", "confirmed"]));
    logger.info(data);
    if (data["address"] == mainTokenEth_address.toLocaleLowerCase() && data["to"] == EthBridge_address.toLocaleLowerCase() && !data["confirmed"]) {
        const txlock = processBridgeRequestLock(data);
        const txbridge = processBridgeRequestBridge(data);
    }
    else{
        logger.info("transaction not related to bridge");
    }
    async function processBridgeRequestLock(data) {
        logger.info("bridging starting locking tokens");
        const functionCall = EthBridge.methods.TransferToBridge(data["from"],data["value"],data["transaction_hash"]).encodeABI();
        const gatewayNonce = web3Main.eth.getTransactionCount(gateway_address);
        const transactionBody = {
            to: EthBridge_address,
            nonce:gatewayNonce,
            data:functionCall,
            gas:400000,
            gasPrice:web3Main.utils.toWei("2", "gwei")
        }
        signedTransaction = await web3Main.eth.accounts.signTransaction(transactionBody,gatewayKey);
        logger.info(signedTransaction.transactionHash);
        fulfillTx = await web3Main.eth.sendSignedTransaction(signedTransaction.rawTransaction);
        logger.info("fulfillTx: " + JSON.stringify(fulfillTx));
    }
    async function processBridgeRequestBridge(data) {
        logger.info("bridging tokens");
        const transferValue = await calculateTokenTransfer(data["value"]);
        const functionCall = BscBridge.methods.TransferFromBridge(data["from"],transferValue,data["transaction_hash"]).encodeABI();
        const gatewayNonce = web3Side.eth.getTransactionCount(gateway_address);
        const transactionBody = {
            to: BscBridge_address,
              nonce:gatewayNonce,
              data:functionCall,
              gas:400000,
              gasPrice:web3Side.utils.toWei("2", "gwei")
        }
        signedTransaction = await web3Side.eth.accounts.signTransaction(transactionBody,gatewayKey);
        logger.info(signedTransaction.transactionHash);
        fulfillTx = await web3Side.eth.sendSignedTransaction(signedTransaction.rawTransaction);
        logger.info("fulfillTx: " + JSON.stringify(fulfillTx))
        return fulfillTx;
    }

    async function calculateTokenTransfer(value) {
        let url = 'https://deep-index.moralis.io/api/v2/erc20/0x50522C769E01EB06c02BD299066509D8f97A69Ae/price?chain=eth';
        let rate = await Moralis.Cloud.httpRequest({
            url: url,
            headers: {
                'accept' : 'application/json',
                'X-API-Key' : 'JdA3OF5iNSpeDPTCGoh9YqdIVYeJpA9mp1k6uCQxW8i3Ep02qjIVToGWqjFa08wn'
            }
        });

        let cost = (parseInt(rate.data.nativePrice.value)) ? parseInt(rate.data.nativePrice.value) : 1;

        return Math.round(parseInt(value) / cost);
    }
});


Moralis.Cloud.afterSave("TokenTransferBsc", (request) => {
    const data = JSON.parse(JSON.stringify(request.object, ["address", "to", "from","transaction_hash","value", "confirmed"]));
    logger.info(data);
    if (data["address"] == mainTokenBsc_address.toLocaleLowerCase() && data["to"] == BscBridge_address.toLocaleLowerCase() && !data["confirmed"]) {
        const txlock = processReturnBurn(data);
        const txbridge = processReturnUnlock(data);
    }
    else{
        logger.info("transaction not related to bridge");
    }
    async function processReturnBurn(data) {
        logger.info("returning tokens burning");
        const functionCall = BscBridge.methods.TransferToBridge(data["from"],data["value"],data["transaction_hash"]).encodeABI();
        const gatewayNonce = web3Side.eth.getTransactionCount(gateway_address);
        const transactionBody = {
            to: BscBridge_address,
              nonce:gatewayNonce,
              data:functionCall,
              gas:400000,
              gasPrice:web3Side.utils.toWei("2", "gwei")
        }
        signedTransaction = await web3Side.eth.accounts.signTransaction(transactionBody,gatewayKey);
        logger.info(signedTransaction.transactionHash);
        fulfillTx = await web3Side.eth.sendSignedTransaction(signedTransaction.rawTransaction);
        logger.info("fulfillTx: " + JSON.stringify(fulfillTx))
        return fulfillTx;
    }
    async function processReturnUnlock(data) {
        logger.info("returning starting unlocking tokens");
        const transferValue = await calculateTokenTransfer(data["value"]);
        const functionCall = EthBridge.methods.TransferFromBridge(data["from"],transferValue,data["transaction_hash"]).encodeABI();
        const gatewayNonce = web3Main.eth.getTransactionCount(gateway_address);
        const transactionBody = {
            to: EthBridge_address,
              nonce:gatewayNonce,
              data:functionCall,
              gas:400000,
              gasPrice:web3Main.utils.toWei("2", "gwei")
        }
        signedTransaction = await web3Main.eth.accounts.signTransaction(transactionBody,gatewayKey);
        logger.info(signedTransaction.transactionHash);
        fulfillTx = await web3Main.eth.sendSignedTransaction(signedTransaction.rawTransaction);
        logger.info("fulfillTx: " + JSON.stringify(fulfillTx));
    }

    async function calculateTokenTransfer(value) {
        let url = 'https://deep-index.moralis.io/api/v2/erc20/0x6526f6Fb59189a2D16D570c201B8e0155f102e18/price?chain=bsc';
        let rate = await Moralis.Cloud.httpRequest({
            url: url,
            headers: {
                'accept' : 'application/json',
                'X-API-Key' : 'JdA3OF5iNSpeDPTCGoh9YqdIVYeJpA9mp1k6uCQxW8i3Ep02qjIVToGWqjFa08wn'
            }
        });

        let cost = (parseInt(rate.data.nativePrice.value)) ? parseInt(rate.data.nativePrice.value) : 1;

        return Math.round(parseInt(value) * cost);
    }
});

