// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "fasset/contracts/stateConnector/interface/ISCProofVerifier.sol";


interface IChallenger {

    function illegalPaymentChallenge(
        BalanceDecreasingTransaction.Proof calldata _transaction,
        address _agentVault
    ) external;

    function doublePaymentChallenge(
        BalanceDecreasingTransaction.Proof calldata _payment1,
        BalanceDecreasingTransaction.Proof calldata _payment2,
        address _agentVault
    ) external;

    function freeBalanceNegativeChallenge(
        BalanceDecreasingTransaction.Proof[] calldata _payments,
        address _agentVault
    ) external;

}