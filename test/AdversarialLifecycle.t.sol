// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {BegVaultBase} from "./BegVaultBase.sol";
import {BegVault} from "src/BegVault.sol";
import {OracleAttestation, OracleAttestationConsumer} from "src/OracleAttestation.sol";
import {IIntake} from "src/interfaces/IIntake.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @notice Boundary and rollback cases that complement the original lifecycle tests.
contract AdversarialLifecycleTest is BegVaultBase {
    function testConstructorRejectsAliasedAssetsMissingOracleAndOversizedPrice() public {
        vm.expectRevert(BegVault.InvalidConfiguration.selector);
        new BegVault(address(token), TEAM, address(0), address(imd), vm.addr(SIGNER_KEY), PRICE);
        vm.expectRevert(BegVault.InvalidConfiguration.selector);
        new BegVault(address(token), TEAM, address(intake), address(0), vm.addr(SIGNER_KEY), PRICE);
        vm.expectRevert(BegVault.InvalidConfiguration.selector);
        new BegVault(address(token), TEAM, address(intake), address(token), vm.addr(SIGNER_KEY), PRICE);
        vm.expectRevert(BegVault.InvalidConfiguration.selector);
        new BegVault(
            address(token),
            TEAM,
            address(intake),
            address(imd),
            vm.addr(SIGNER_KEY),
            uint256(type(uint96).max) + 1
        );
    }

    function testUnknownViewsAndTransitionsCannotCreatePhantomBatches() public {
        uint256[3] memory ids = [uint256(0), uint256(1), type(uint256).max];
        for (uint256 i; i < ids.length; ++i) {
            vm.expectRevert(BegVault.UnknownAttempt.selector);
            vault.getAttempt(ids[i]);
            vm.expectRevert(BegVault.UnknownBatch.selector);
            vault.getBatch(ids[i]);
            vm.expectRevert(BegVault.UnknownBatch.selector);
            vault.reveal(ids[i]);
            vm.expectRevert(BegVault.UnknownBatch.selector);
            vault.expireBatch(ids[i]);
        }
        assertEq(vault.nextAttemptId(), 1);
        assertEq(vault.openBatchId(), 1);
        _assertSolvent();
    }

    /// forge-config: default.fuzz.runs = 512
    function testFuzzRejectedPaymentLeavesMessageAndCooldownAvailable(uint96 rawPayment) public {
        uint256 payment = bound(rawPayment, 0, 2 * PRICE);
        if (payment == PRICE) ++payment;
        uint256 beforeETH = address(this).balance;
        vm.expectRevert(BegVault.WrongPayment.selector);
        vault.attempt{value: payment}("Retry the exact same text after a failed payment");
        assertEq(address(this).balance, beforeETH);
        assertFalse(vault.usedMessage(keccak256("Retry the exact same text after a failed payment")));
        assertEq(vault.cooldownUntil(address(this)), 0);
        assertEq(vault.nextAttemptId(), 1);
        vault.attempt{value: PRICE}("Retry the exact same text after a failed payment");
        assertEq(vault.getAttempt(1).player, address(this));
        _assertSolvent();
    }

    function testCooldownOneSecondBeforeAndExactlyAtBoundary() public {
        address player = _player(1);
        _attempt(player, "First request");
        uint256 until = vault.cooldownUntil(player);
        vm.warp(until - 1);
        vm.deal(player, PRICE);
        vm.prank(player);
        vm.expectRevert(abi.encodeWithSelector(BegVault.CooldownActive.selector, until));
        vault.attempt{value: PRICE}("Second request");
        assertFalse(vault.usedMessage(keccak256("Second request")));
        vm.warp(until);
        _attempt(player, "Second request");
        assertEq(vault.getAttempt(2).player, player);
        assertEq(vault.cooldownUntil(player), until + 10 minutes);
    }

    function testOpenTimeoutBoundaryRejectsCloseButPermitsFullRefund() public {
        _attempt(_player(1), "An oracle outage cannot retain my escrow");
        uint256 deadline = uint256(vault.getBatch(1).openedAt) + 30 minutes + 24 hours;
        vm.warp(deadline - 1);
        vm.expectRevert(BegVault.TooEarly.selector);
        vault.expireBatch(1);
        vm.warp(deadline);
        vm.expectRevert(BegVault.BatchTimedOut.selector);
        vault.closeBatch();
        vault.expireBatch(1);
        vm.prank(_player(1));
        vault.refund(1);
        (, uint128 refundCredit) = vault.claimable(_player(1));
        assertEq(refundCredit, PRICE);
        assertEq(intake.requests(), 0);
        vm.expectRevert(BegVault.InvalidBatchState.selector);
        vault.expireBatch(1);
        _assertSolvent();
    }

    function testCallbackAtLastSecondBeforeTimeoutPreventsExpiry() public {
        _batch(2);
        uint256 deadline = uint256(vault.getBatch(1).closedAt) + 24 hours;
        vm.warp(deadline - 1);
        _grade(1, 100);
        vm.warp(deadline);
        vm.expectRevert(BegVault.InvalidBatchState.selector);
        vault.expireBatch(1);
        vm.prank(_player(1));
        vm.expectRevert(BegVault.InvalidBatchState.selector);
        vault.refund(1);
        assertEq(vault.escrowedETH(), 0);
        _assertSolvent();
    }

    function testOldPendingExpiryDoesNotEraseOrAdvanceTheCurrentOpenBatch() public {
        _batch(1);
        uint256 deadline = uint256(vault.getBatch(1).closedAt) + 24 hours;
        vm.warp(deadline - 1);
        _attempt(_player(2), "I am in the fresh batch, not the expired one");
        bytes32 beforeBatch = keccak256(abi.encode(vault.getBatch(2)));
        vm.warp(deadline);
        vault.expireBatch(1);
        assertEq(vault.openBatchId(), 2);
        assertEq(keccak256(abi.encode(vault.getBatch(2))), beforeBatch);
        assertEq(vault.getAttempt(2).message, "I am in the fresh batch, not the expired one");
        vm.prank(_player(1));
        vault.refund(1);
        assertEq(vault.escrowedETH(), PRICE);
        vm.prank(_player(2));
        vm.expectRevert(BegVault.InvalidBatchState.selector);
        vault.refund(2);
        _assertSolvent();
    }

    function testSamePlayerCanRefundSeveralAttemptsSeparatelyAndClaimTheirSum() public {
        address player = _player(1);
        uint256 original = player.balance;
        for (uint256 i; i < 3; ++i) {
            _attempt(player, string.concat("Refundable message ", vm.toString(i)));
            vm.warp(vm.getBlockTimestamp() + 10 minutes);
        }
        vault.closeBatch();
        vm.warp(vm.getBlockTimestamp() + 24 hours);
        vault.expireBatch(1);
        uint256[3] memory order = [uint256(3), uint256(1), uint256(2)];
        for (uint256 i; i < order.length; ++i) {
            vm.prank(player);
            vault.refund(order[i]);
            assertEq(vault.escrowedETH(), (2 - i) * PRICE);
            (, uint128 credit) = vault.claimable(player);
            assertEq(credit, (i + 1) * PRICE);
        }
        assertEq(player.balance, original, "refund must only credit, never push ETH");
        vm.prank(player);
        vault.claim();
        assertEq(player.balance, original + 3 * PRICE);
        _assertSolvent();
    }

    function testRejectingTwentiethRequestCanRetryIdenticalMessageWithoutCooldown() public {
        for (uint256 i = 1; i < 20; ++i) {
            _attempt(_player(i), vm.toString(i));
        }
        intake.setReject(true);
        address lastPlayer = _player(20);
        vm.deal(lastPlayer, PRICE);
        vm.prank(lastPlayer);
        vm.expectRevert("intake unavailable");
        vault.attempt{value: PRICE}("twentieth entry");
        assertEq(lastPlayer.balance, PRICE);
        assertEq(vault.cooldownUntil(lastPlayer), 0);
        assertFalse(vault.usedMessage(keccak256("twentieth entry")));
        assertEq(vault.getBatch(1).size, 19);
        assertEq(vault.nextAttemptId(), 20);
        assertEq(imd.allowance(address(vault), address(intake)), 0);
        intake.setReject(false);
        vm.prank(lastPlayer);
        assertEq(vault.attempt{value: PRICE}("twentieth entry"), 20);
        assertEq(intake.requests(), 1);
        assertEq(vault.getBatch(1).size, 20);
        assertEq(vault.openBatchId(), 2);
        _assertSolvent();
    }

    function testZeroIntakeIdRollsBackOpeningAllowanceAndMessages() public {
        _attempt(_player(1), "Keep this text when Intake returns no id");
        vm.warp(vm.getBlockTimestamp() + 30 minutes);
        vm.mockCall(address(intake), abi.encodePacked(IIntake.request.selector), abi.encode(bytes32(0)));
        vm.expectRevert(BegVault.InvalidQuestionId.selector);
        vault.closeBatch();
        assertEq(vault.getBatch(1).closedAt, 0);
        assertEq(vault.openBatchId(), 1);
        assertEq(vault.escrowedETH(), PRICE);
        assertEq(vault.getAttempt(1).message, "Keep this text when Intake returns no id");
        assertEq(vault.oracleTokenBudget(), 100 ether);
        assertEq(imd.allowance(address(vault), address(intake)), 0);
        vm.clearMockedCalls();
        vault.closeBatch();
        assertEq(intake.requests(), 1);
        _assertSolvent();
    }

    function testUnsoldActionAndETHDonationsCannotPayAnIMDFee() public {
        _attempt(_player(1), "Different assets must never be conflated");
        vm.warp(vm.getBlockTimestamp() + 30 minutes);
        intake.setPrice(0);
        vm.expectRevert(BegVault.OracleUnfunded.selector);
        vault.closeBatch();
        intake.setPrice(100 ether + 1);
        vault.fundOracle{value: 10 ether}();
        vm.expectRevert(BegVault.OracleUnfunded.selector);
        vault.closeBatch();
        assertEq(vault.oracleBudget(), 10 ether);
        imd.mint(address(this), 1);
        vault.fundOracle(1);
        vault.closeBatch();
        assertEq(vault.oracleTokenBudget(), 0);
        assertEq(vault.oracleBudget(), 10 ether);
        assertEq(imd.balanceOf(address(intake)), 100 ether + 1);
        _assertSolvent();
    }

    function testRejectedOracleFundingDoesNotAffectAnyETHLiability() public {
        _attempt(_player(1), "Escrow survives an unrelated failed donation");
        imd.mint(address(this), 1 ether);
        imd.approve(address(vault), 0);
        vm.expectRevert();
        vault.fundOracle(1 ether);
        assertEq(imd.balanceOf(address(this)), 1 ether);
        assertEq(vault.oracleTokenBudget(), 100 ether);
        assertEq(vault.escrowedETH(), PRICE);
        imd.approve(address(vault), 1 ether);
        vm.mockCall(
            address(imd),
            abi.encodeCall(IERC20.transferFrom, (address(this), address(vault), 1 ether)),
            abi.encode(false)
        );
        vm.expectRevert(abi.encodeWithSelector(SafeERC20.SafeERC20FailedOperation.selector, address(imd)));
        vault.fundOracle(1 ether);
        assertEq(vault.oracleTokenBudget(), 100 ether);
        vm.clearMockedCalls();
        vault.fundOracle(1 ether);
        assertEq(vault.oracleTokenBudget(), 101 ether);
        _assertSolvent();
    }

    /// forge-config: default.fuzz.runs = 512
    function testFuzzScoreCountMismatchIsAtomicAndCorrectedAnswerCanSettle(uint8 rawSize, uint8 rawLength)
        public
    {
        uint256 size = bound(rawSize, 1, 20);
        uint256 length = bound(rawLength, 0, 21);
        if (length == size) length = (length + 1) % 22;
        _batch(size);
        BegVault.Batch memory beforeBatch = vault.getBatch(1);
        OracleAttestation.Attestation memory a = _attestation(1, _scores(length, 50));
        bytes memory signature = _sign(a);
        vm.prank(address(intake));
        vm.expectRevert(BegVault.WrongScoreCount.selector);
        vault.onOracleResult(beforeBatch.questionId, a, signature);
        assertFalse(vault.consumed(a.requestId));
        assertEq(keccak256(abi.encode(vault.getBatch(1))), keccak256(abi.encode(beforeBatch)));
        assertEq(vault.escrowedETH(), size * PRICE);
        assertEq(vault.totalClaimableETH(), 0);
        a.answer = abi.encode(_scores(size, 50));
        signature = _sign(a);
        (bool ok,) = intake.deliver(beforeBatch.questionId, a, signature);
        assertTrue(ok, "a rejected callback must not consume the request or UUID");
        assertTrue(vault.consumed(a.requestId));
        _assertSolvent();
    }

    function testSignedFieldsCannotBeChangedAfterSigning() public {
        _batch(1);
        bytes32 questionId = vault.getBatch(1).questionId;
        for (uint256 field; field < 15; ++field) {
            OracleAttestation.Attestation memory a = _attestation(1, _scores(1, 50));
            a.agreed = 5; // Quorum and agreement mutations must still describe valid panels.
            bytes memory signature = _sign(a);
            if (field == 0) a.requestId = keccak256("different UUID");
            if (field == 1) a.chainId = 4663;
            if (field == 2) a.questionHash = keccak256("different question");
            if (field == 3) a.answerType = 4;
            if (field == 4) a.answer = abi.encode(_scores(1, 51));
            if (field == 5) a.figure = 1;
            if (field == 6) ++a.fromBlock;
            if (field == 7) ++a.toBlock;
            if (field == 8) a.blockHash = keccak256("different block");
            if (field == 9) a.panelJobId = keccak256("different panel");
            if (field == 10) ++a.panelSize;
            if (field == 11) ++a.quorum;
            if (field == 12) --a.agreed;
            if (field == 13) ++a.issuedAt;
            if (field == 14) ++a.expiresAt;
            bytes4 errorSelector =
                field == 1 ? BegVault.WrongChain.selector : OracleAttestationConsumer.BadSignature.selector;
            vm.prank(address(intake));
            vm.expectRevert(errorSelector);
            vault.onOracleResult(questionId, a, signature);
            assertFalse(vault.consumed(a.requestId));
        }
        assertEq(vault.escrowedETH(), PRICE);
        _grade(1, 50);
        _assertSolvent();
    }

    function testSignatureForAnotherVaultIsRejectedEvenWithSameImmutableParameters() public {
        _batch(1);
        BegVault other =
            new BegVault(address(token), TEAM, address(intake), address(imd), vm.addr(SIGNER_KEY), PRICE);
        OracleAttestation.Attestation memory a = _attestation(1, _scores(1, 50));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(SIGNER_KEY, other.attestationDigest(a));
        bytes32 questionId = vault.getBatch(1).questionId;
        vm.prank(address(intake));
        vm.expectRevert(OracleAttestationConsumer.BadSignature.selector);
        vault.onOracleResult(questionId, a, abi.encodePacked(r, s, v));
        assertFalse(vault.consumed(a.requestId));
        _grade(1, 50);
    }

    function testAttestationTimeToleranceAndExpiryAreInclusiveAtTheirBoundaries() public {
        _batch(1);
        OracleAttestation.Attestation memory a = _attestation(1, _scores(1, 0));
        a.issuedAt -= 300;
        a.expiresAt = uint64(vm.getBlockTimestamp());
        bytes memory signature = _sign(a);
        (bool ok,) = intake.deliver(vault.getBatch(1).questionId, a, signature);
        assertTrue(ok, "issuance at close minus tolerance and expiry at now are valid");
        _batch(1);
        a = _attestation(2, _scores(1, 100));
        a.issuedAt += 300;
        signature = _sign(a);
        (ok,) = intake.deliver(vault.getBatch(2).questionId, a, signature);
        assertTrue(ok, "issuance at now plus tolerance is valid");
        _assertSolvent();
    }
}
