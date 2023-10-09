// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "fasset/contracts/fasset/interface/IFAsset.sol";
import "fasset/contracts/userInterfaces/IAssetManager.sol";
import "./interface/ILiquidator.sol";
import "./lib/LiquidatorMath.sol";


enum FlashLoanLock { INACTIVE, INITIATOR_ENTER, RECEIVER_ENTER }

// always assume pool = wrapped native
contract Liquidator is ILiquidator, Ownable {

    // those are initialized once and cannot be changed
    IWNat public immutable wNat;
    IERC3156FlashLender public immutable flashLender;
    IBlazeSwapRouter public immutable blazeswap;

    // takes care of flash loan getting executed exactly once
    // when ran from runArbitrageWithCustomParams
    FlashLoanLock private _status;

    constructor(
        IWNat _wNat,
        IERC3156FlashLender _flashLender,
        IBlazeSwapRouter _blazeSwap
    ) Ownable() {
        wNat = _wNat;
        flashLender = _flashLender;
        blazeswap = _blazeSwap;
    }

    modifier flashLoanInitiatorLock() {
        require(_status == FlashLoanLock.INACTIVE,
            "Liquidator: Reentrancy blocked");
        _status = FlashLoanLock.INITIATOR_ENTER;
        _;
        require(_status == FlashLoanLock.RECEIVER_ENTER,
            "Liquidator: Reentrancy blocked or flash loan receiver not called");
        _status = FlashLoanLock.INACTIVE;
    }

    modifier flashLoanReceiverLock() {
        require(_status == FlashLoanLock.INITIATOR_ENTER,
            "Liquidator: Flash loan with invalid initiator");
        _status = FlashLoanLock.RECEIVER_ENTER;
        _;
    }

    function runArbitrage(
        IIAgentVault _agentVault
    ) external {
        runArbitrageWithCustomParams(_agentVault, flashLender, blazeswap);
    }

    // non-reentrant
    function runArbitrageWithCustomParams(
        IIAgentVault _agentVault,
        IERC3156FlashLender _flashLender,
        IBlazeSwapRouter _blazeSwap
    ) public flashLoanInitiatorLock {
        // extrapolate data
        IAssetManager assetManager = _agentVault.assetManager();
        AssetManagerSettings.Data memory assetManagerSettings = assetManager.getSettings();
        AgentInfo.Info memory agentInfo = assetManager.getAgentInfo(address(_agentVault));
        require(agentInfo.maxLiquidationAmountUBA > 0, "Liquidator: Agent not in liquidation");
        // send vault collateral to owner, to avoid them being stolen by a malicious flash
        // loan contract, and also to ensure that arbitrage fails in case of decreased funds
        IERC20 vaultToken = agentInfo.vaultCollateralToken;
        vaultToken.transfer(owner(), vaultToken.balanceOf(address(this)));
        // get max and optimal vault collateral to flash loan
        uint256 maxVaultFlashLoan = flashLender.maxFlashLoan(address(vaultToken));
        require(maxVaultFlashLoan > 0, "Liquidator: No flash loan available");
        uint256 optimalVaultAmount = LiquidatorMath.getFlashLoanedVaultCollateral(
            address(wNat),
            assetManager,
            _blazeSwap,
            agentInfo,
            assetManagerSettings
        );
        require(optimalVaultAmount > 0, "Liquidator: No profitable arbitrage opportunity");
        // run flash loan
        _flashLender.flashLoan(
            this,
            address(vaultToken),
            Math.min(maxVaultFlashLoan, optimalVaultAmount),
            abi.encode(
                assetManagerSettings.fAsset,
                assetManager,
                _agentVault,
                _blazeSwap
            )
        );
        // send earnings to sender
        vaultToken.transfer(msg.sender, vaultToken.balanceOf(address(this)));
    }

    // dangerous!
    // - cannot reenter due to flashLoanReceiverLock
    // - can only be run once from runArbitrageWithCustomParams call
    // - runArbitrageWithCustomParams: _token is always vault collateral
    // - runArbitrageWithCustomParams: contract vault balance at each call is 0
    function onFlashLoan(
        address /* _initiator */,
        address _token,
        uint256 _amount,
        uint256 _fee,
        bytes calldata _data
    ) external flashLoanReceiverLock returns (bytes32) {
        // check that starting contract vault collateral balance
        // is correct (note that anyone can call onFlashLoan)
        uint256 balance = IERC20(_token).balanceOf(address(this));
        require(balance == _amount, "Liquidator: Incorrect flash loan amount");
        // execute arbitrage
        (
            IFAsset _fAsset,
            IAssetManager _assetManager,
            IIAgentVault _agentVault,
            IBlazeSwapRouter _blazeSwap
        ) = abi.decode(_data, (
            IFAsset,
            IAssetManager,
            IIAgentVault,
            IBlazeSwapRouter
        ));
        _executeArbitrage(
            IERC20(_token),
            _fAsset,
            _assetManager,
            _agentVault,
            _blazeSwap,
            _amount
        );
        // approve flash loan spending to flash lender
        IERC20(_token).approve(address(msg.sender), _amount + _fee);
        return keccak256("ERC3156FlashBorrower.onFlashLoan");
    }

    function _executeArbitrage(
        IERC20 _vaultToken,
        IFAsset _fAsset,
        IAssetManager _assetManager,
        IAgentVault _agentVault,
        IBlazeSwapRouter _blazeSwap,
        uint256 _vaultAmount
    ) internal {
        uint256[] memory amountsRecv;
        // swap vault collateral for f-asset
        _vaultToken.approve(address(_blazeSwap), _vaultAmount);
        (, amountsRecv) = _blazeSwap.swapExactTokensForTokens(
            _vaultAmount,
            0,
            toDynamicArray(address(_vaultToken), address(_fAsset)),
            address(this),
            block.timestamp
        );
        _vaultToken.approve(address(_blazeSwap), 0);
        // liquidate obtained f-asset
        (,, uint256 obtainedPool) = _assetManager.liquidate(
            address(_agentVault),
            amountsRecv[1]
        );
        // swap pool for vault collateral
        if (obtainedPool > 0) {
            IERC20 _poolToken = wNat; // gas savings
            _poolToken.approve(address(_blazeSwap), obtainedPool);
            (, amountsRecv) = _blazeSwap.swapExactTokensForTokens(
                obtainedPool,
                0,
                toDynamicArray(address(_poolToken), address(_vaultToken)),
                address(this),
                block.timestamp
            );
            _poolToken.approve(address(_blazeSwap), 0);
        }
    }

    function withdrawToken(IERC20 token) external onlyOwner {
        token.transfer(owner(), token.balanceOf(address(this)));
    }

    function withderawNat() external onlyOwner {
        payable(owner()).transfer(address(this).balance);
    }

    function toDynamicArray(
        address _x,
        address _y
    ) private pure returns (address[] memory) {
        address[] memory _arr = new address[](2);
        _arr[0] = _x;
        _arr[1] = _y;
        return _arr;
    }
}
