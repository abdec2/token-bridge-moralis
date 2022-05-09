// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

//Remix style import
import { IERC20 } from "@openzeppelin/contracts@4.0.0/token/ERC20/IERC20.sol";

//Brownie style import
// import { IERC20 } from "OpenZeppelin/openzeppelin-contracts@4.0.0/contracts/token/ERC20/IERC20.sol";


contract BscBridge {

    IERC20 private mainToken;

    address gateway;
    address tokenWallet;

    event TransferOut(address indexed requester, bytes32 indexed mainDepositHash, uint amount, uint timestamp);
    event TransferIn(address indexed requester, bytes32 indexed sideDepositHash, uint amount, uint timestamp);

    constructor (address _mainToken, address _gateway, address _tokenWallet) {
        mainToken = IERC20(_mainToken);
        gateway = _gateway;
        tokenWallet = _tokenWallet;
    }

    function TransferOut (address _requester, uint _bridgedAmount, bytes32 _mainDepositHash) onlyGateway external {
        emit TransferOut(_requester, _mainDepositHash, _bridgedAmount, block.timestamp);
    }

    function TransferIn (address _requester, uint _bridgedAmount, bytes32 _sideDepositHash) onlyGateway external {
        mainToken.transferFrom(tokenWallet, _requester, _bridgedAmount);
        emit TransferIn(_requester, _sideDepositHash, _bridgedAmount, block.timestamp);
    }

    modifier onlyGateway {
      require(msg.sender == gateway, "only gateway can execute this function");
      _;
    }
    

}
