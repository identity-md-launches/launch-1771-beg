// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {BegVaultBase} from "./BegVaultBase.sol";
import {BegVault} from "src/BegVault.sol";
import {LaunchToken} from "src/LaunchToken.sol";
import {OracleAttestation, OracleAttestationConsumer} from "src/OracleAttestation.sol";
import {MockIntake, MockIMD} from "./mocks/MockIntake.sol";

/// @dev Test-only actors, keys and funding. No privileged production operation is introduced.
/// The model changes only after a checked successful call. Expected failures check their errors;
/// unexpected reverts are never swallowed. Entries/credits are recorded independently of vault totals.
contract IndependentLedgerHandler is Test {
    struct Entry {
        address player;
        uint256 batch;
        bytes32 messageHash;
        uint8 score;
        bool refunded;
    }

    struct BatchModel {
        uint256 firstId;
        uint256 size;
        uint256 openedAt;
        uint256 closedAt;
        BegVault.Status status;
        bytes32 terminalDigest;
    }

    uint256 private constant PRICE = 0.005 ether;
    uint256 private constant BOUNTY = 0.001 ether;
    uint256 public constant ACTORS = 24;
    BegVault public immutable vault;
    LaunchToken public immutable token;
    MockIMD public immutable imd;
    MockIntake public immutable intake;
    uint256 private immutable signerKey;
    address[24] public actors;
    Entry[] private entries;
    mapping(uint256 => BatchModel) private batches;
    mapping(address => uint256) public expectedTokens;
    mapping(address => uint256) public expectedETH;
    mapping(address => uint256) private expectedCooldown;

    uint256 public expectedOpen = 1;
    uint256 public expectedEscrow;
    uint256 public expectedBank;
    uint256 public expectedBudget;
    uint256 public expectedTokenCredits;
    uint256 public expectedETHCredits;
    uint256 public expectedFree = 800_000_000 ether;
    uint256 public entryETH;
    uint256 public donatedETH;
    uint256 public forcedETH;
    uint256 public paidETH;
    uint256 public paidTokens;
    uint256 public fundedIMD = 100 ether;
    uint256 public spentIMD;
    uint256 public donatedTokens;
    uint256 public grades;
    uint256 public reveals;
    uint256 public refunds;
    uint256 private nonce;

    constructor(BegVault vault_, LaunchToken token_, MockIMD imd_, MockIntake intake_, uint256 key_) {
        vault = vault_;
        token = token_;
        imd = imd_;
        intake = intake_;
        signerKey = key_;
        actors[0] = vault_.team(); // Beneficiary, player and revealer roles deliberately overlap.
        for (uint256 i = 1; i < ACTORS; ++i) {
            actors[i] = address(uint160(uint256(keccak256(abi.encode("ledger actor", i)))));
        }
    }

    function enter(uint256 actorSeed, uint8 rawCount) public {
        uint256 count = bound(rawCount, 1, 20);
        for (uint256 i; i < count; ++i) {
            BatchModel storage b = batches[expectedOpen];
            if (b.size != 0 && vm.getBlockTimestamp() >= b.openedAt + 30 minutes) return;
            address player = actors[(actorSeed % ACTORS + i) % ACTORS];
            if (vm.getBlockTimestamp() < expectedCooldown[player]) continue;
            string memory message = string.concat("Independent ledger message ", vm.toString(++nonce));
            bytes32 hash = keccak256(bytes(message));
            vm.deal(player, player.balance + PRICE);
            bool closing = b.size == 19;
            bytes memory failure = closing ? _closeFailure() : bytes("");
            if (failure.length != 0) {
                uint256 beforeBalance = player.balance;
                vm.prank(player);
                vm.expectRevert(failure);
                vault.attempt{value: PRICE}(message);
                assertEq(player.balance, beforeBalance);
                assertFalse(vault.usedMessage(hash));
                assertEq(vault.cooldownUntil(player), expectedCooldown[player]);
                return;
            }
            uint256 batchId = expectedOpen;
            vm.prank(player);
            uint256 id = vault.attempt{value: PRICE}(message);
            assertEq(id, entries.length + 1);
            if (b.size == 0) {
                b.firstId = id;
                b.openedAt = vm.getBlockTimestamp();
            }
            ++b.size;
            entries.push(Entry(player, batchId, hash, 0, false));
            expectedCooldown[player] = vm.getBlockTimestamp() + 10 minutes;
            entryETH += PRICE;
            expectedEscrow += PRICE;
            if (closing) _recordClose();
        }
    }

    function close() public {
        BatchModel storage b = batches[expectedOpen];
        if (b.size == 0 || vm.getBlockTimestamp() < b.openedAt + 30 minutes) {
            vm.expectRevert(BegVault.BatchNotReady.selector);
            vault.closeBatch();
            return;
        }
        if (vm.getBlockTimestamp() >= b.openedAt + 30 minutes + 24 hours) {
            vm.expectRevert(BegVault.BatchTimedOut.selector);
            vault.closeBatch();
            return;
        }
        bytes memory failure = _closeFailure();
        if (failure.length != 0) {
            vm.expectRevert(failure);
            vault.closeBatch();
            return;
        }
        vault.closeBatch();
        _recordClose();
    }

    function configureOracle(uint8 mode) external {
        uint256 choice = mode % 5;
        intake.setReject(choice == 1);
        intake.setPrice(choice == 2 ? 0 : choice == 3 ? imd.balanceOf(address(vault)) + 1 : 0.5 ether);
    }

    function fund(uint256 actorSeed, uint96 rawAmount, uint8 assetKind) external {
        address actor = actors[actorSeed % ACTORS];
        uint256 amount = bound(rawAmount, 0, 2 ether);
        if (assetKind % 3 == 0) {
            vm.deal(actor, actor.balance + amount);
            vm.prank(actor);
            vault.fundOracle{value: amount}();
            donatedETH += amount;
            expectedBudget += amount;
        } else if (assetKind % 3 == 1) {
            imd.mint(actor, amount);
            vm.prank(actor);
            imd.approve(address(vault), amount);
            vm.prank(actor);
            vault.fundOracle(amount);
            fundedIMD += amount;
        } else {
            amount = bound(rawAmount, 0, token.balanceOf(address(this)));
            token.transfer(address(vault), amount);
            donatedTokens += amount;
            expectedFree += amount;
        }
    }

    function forceETH(uint96 rawAmount) external {
        uint256 amount = bound(rawAmount, 0, 1 ether);
        // Models unsolicited ETH (e.g. a coinbase payment). This is surplus, never oracle funding.
        vm.deal(address(vault), address(vault).balance + amount);
        forcedETH += amount;
    }

    function advance(uint32 rawDelta, uint8 mode) external {
        if (mode % 4 == 0) {
            vm.roll(vm.getBlockNumber() + bound(rawDelta, 1, 300));
        } else {
            uint256 limit = mode % 4 == 1 ? 10 minutes : mode % 4 == 2 ? 30 minutes : 26 hours;
            vm.warp(vm.getBlockTimestamp() + bound(rawDelta, 1, limit));
        }
    }

    function grade(uint256 seed, bytes32 entropy, bool badSignature) public {
        uint256 id = 1 + seed % expectedOpen;
        BatchModel storage model = batches[id];
        if (model.size == 0 || model.status != BegVault.Status.Pending) return;
        BegVault.Batch memory b = vault.getBatch(id);
        bytes32[] memory scores = new bytes32[](model.size);
        for (uint256 i; i < model.size; ++i) {
            scores[i] = bytes32(uint256(keccak256(abi.encode(entropy, i))) % 201);
        }
        OracleAttestation.Attestation memory a;
        a.requestId = keccak256(abi.encode("independent ledger UUID", id));
        a.chainId = 1;
        a.answerType = 5;
        a.answer = abi.encode(scores);
        a.panelSize = 5;
        a.quorum = 3;
        a.agreed = 3;
        a.issuedAt = uint64(vm.getBlockTimestamp());
        a.expiresAt = a.issuedAt + 1 hours;
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerKey, vault.attestationDigest(a));
        bytes memory signature = badSignature ? bytes(hex"00") : abi.encodePacked(r, s, v);
        vm.cool(address(vault));
        (bool ok, bytes memory result) = intake.deliver(b.questionId, a, signature);
        if (vm.getBlockTimestamp() >= model.closedAt + 24 hours) {
            assertTrue(ok, "late callback must not trap a refund");
            model.status = BegVault.Status.Expired;
            model.terminalDigest = keccak256(abi.encode(vault.getBatch(id)));
            assertFalse(vault.consumed(a.requestId));
        } else if (badSignature) {
            assertFalse(ok, "unsigned grade was accepted");
            assertEq(result, abi.encodeWithSelector(OracleAttestationConsumer.BadSignature.selector));
            assertFalse(vault.consumed(a.requestId));
        } else {
            assertTrue(ok, "eligible callback must succeed under Intake's 200,000 gas stipend");
            model.status = BegVault.Status.Graded;
            uint256 gross = model.size * PRICE;
            expectedEscrow -= gross;
            expectedBank += gross * 8 / 10;
            expectedBudget += gross / 10;
            _credit(actors[0], 0, gross / 10);
            for (uint256 i; i < model.size; ++i) {
                entries[model.firstId - 1 + i].score =
                    uint8(uint256(scores[i]) > 100 ? 100 : uint256(scores[i]));
            }
            assertTrue(vault.consumed(a.requestId));
            assertEq(vault.getBatch(id).rollBlock, vm.getBlockNumber() + 2);
            ++grades;
        }
    }

    function expire(uint256 seed) public {
        _expire(1 + seed % expectedOpen);
    }

    function _expire(uint256 id) private {
        BatchModel storage model = batches[id];
        if (model.size == 0) return;
        if (model.status != BegVault.Status.Pending && model.status != BegVault.Status.Open) {
            vm.expectRevert(BegVault.InvalidBatchState.selector);
            vault.expireBatch(id);
            return;
        }
        uint256 deadline = model.status == BegVault.Status.Open
            ? model.openedAt + 30 minutes + 24 hours
            : model.closedAt + 24 hours;
        if (vm.getBlockTimestamp() < deadline) {
            vm.expectRevert(BegVault.TooEarly.selector);
            vault.expireBatch(id);
            return;
        }
        vault.expireBatch(id);
        if (model.status == BegVault.Status.Open) ++expectedOpen;
        model.status = BegVault.Status.Expired;
        model.terminalDigest = keccak256(abi.encode(vault.getBatch(id)));
    }

    function reveal(uint256 seed, uint256 actorSeed, bytes32 entropy, bool missWindow) public {
        _reveal(1 + seed % expectedOpen, actors[actorSeed % ACTORS], entropy, missWindow);
    }

    function _reveal(uint256 id, address actor, bytes32 entropy, bool missWindow) private {
        BatchModel storage model = batches[id];
        if (model.size == 0 || model.status != BegVault.Status.Graded) return;
        BegVault.Batch memory beforeBatch = vault.getBatch(id);
        uint256 nextBlock = uint256(beforeBatch.rollBlock) + (missWindow ? 257 : 1);
        if (nextBlock > vm.getBlockNumber()) vm.roll(nextBlock);
        bool available = vm.getBlockNumber() <= uint256(beforeBatch.rollBlock) + 256;
        bytes32 hash = keccak256(abi.encode("ledger block", entropy));
        if (available) vm.setBlockhash(beforeBatch.rollBlock, hash);
        uint256 beforeETH = address(vault).balance;
        uint256 beforeTokens = token.balanceOf(address(vault));
        vm.prank(actor);
        vault.reveal(id);
        assertEq(address(vault).balance, beforeETH, "reveal transferred ETH");
        assertEq(token.balanceOf(address(vault)), beforeTokens, "reveal transferred tokens");
        BegVault.Batch memory afterBatch = vault.getBatch(id);
        if (!available) {
            assertEq(afterBatch.rollBlock, vm.getBlockNumber() + 2);
            assertEq(afterBatch.scores, beforeBatch.scores);
            assertEq(afterBatch.prevrandao, beforeBatch.prevrandao);
            assertEq(afterBatch.seed, bytes32(0));
            return;
        }
        assertEq(afterBatch.seed, keccak256(abi.encode(hash, beforeBatch.prevrandao, id, address(vault))));
        for (uint256 i; i < model.size; ++i) {
            uint256 attemptId = model.firstId + i;
            BegVault.AttemptView memory a = vault.getAttempt(attemptId);
            assertEq(a.score, entries[attemptId - 1].score);
            uint256 denominator;
            if (a.tier == BegVault.Tier.Common) denominator = 50_000;
            if (a.tier == BegVault.Tier.Rare) denominator = 10_000;
            if (a.tier == BegVault.Tier.Epic) denominator = 2_000;
            if (a.tier == BegVault.Tier.Jackpot) denominator = 100;
            if (denominator == 0) {
                assertEq(a.tokenAmount, 0);
            } else {
                // A floor division is characterized by these bounds, including sub-unit balances.
                assertLe(uint256(a.tokenAmount) * denominator, expectedFree);
                assertLt(expectedFree, (uint256(a.tokenAmount) + 1) * denominator);
            }
            if (a.tier == BegVault.Tier.Jackpot) {
                assertLe(uint256(a.ethAmount) * 2, expectedBank);
                assertLt(expectedBank, (uint256(a.ethAmount) + 1) * 2);
            } else {
                assertEq(a.ethAmount, 0);
            }
            expectedFree -= a.tokenAmount;
            expectedBank -= a.ethAmount;
            _credit(entries[attemptId - 1].player, a.tokenAmount, a.ethAmount);
        }
        if (expectedBudget >= BOUNTY) {
            expectedBudget -= BOUNTY;
            _credit(actor, 0, BOUNTY);
        }
        model.status = BegVault.Status.Revealed;
        model.terminalDigest = keccak256(abi.encode(afterBatch));
        ++reveals;
    }

    function refund(uint256 seed, bool wrongPlayer) public {
        if (entries.length == 0) return;
        uint256 id = 1 + seed % entries.length;
        Entry storage a = entries[id - 1];
        if (wrongPlayer) {
            address stranger = a.player == actors[0] ? actors[1] : actors[0];
            vm.prank(stranger);
            vm.expectRevert(BegVault.NotPlayer.selector);
            vault.refund(id);
            return;
        }
        _refund(id);
    }

    function _refund(uint256 id) private {
        Entry storage a = entries[id - 1];
        vm.prank(a.player);
        if (batches[a.batch].status != BegVault.Status.Expired) {
            vm.expectRevert(BegVault.InvalidBatchState.selector);
            vault.refund(id);
        } else if (a.refunded) {
            vm.expectRevert(BegVault.AlreadyRefunded.selector);
            vault.refund(id);
        } else {
            uint256 beforeBalance = address(vault).balance;
            vault.refund(id);
            assertEq(address(vault).balance, beforeBalance, "refund must create a pull credit");
            a.refunded = true;
            expectedEscrow -= PRICE;
            _credit(a.player, 0, PRICE);
            ++refunds;
        }
    }

    function claim(uint256 seed) public {
        address player = actors[seed % ACTORS];
        uint256 tokens = expectedTokens[player];
        uint256 eth = expectedETH[player];
        uint256 beforeETH = player.balance;
        uint256 beforeTokens = token.balanceOf(player);
        vm.prank(player);
        if (tokens == 0 && eth == 0) {
            vm.expectRevert(BegVault.NothingToClaim.selector);
            vault.claim();
        } else {
            vault.claim();
            assertEq(player.balance - beforeETH, eth);
            assertEq(token.balanceOf(player) - beforeTokens, tokens);
            expectedTokens[player] = 0;
            expectedETH[player] = 0;
            expectedTokenCredits -= tokens;
            expectedETHCredits -= eth;
            paidETH += eth;
            paidTokens += tokens;
            assertEq(vault.vaultFreeBalance(), expectedFree, "claims must preserve all unreserved tokens");
        }
    }

    function _credit(address actor, uint256 tokens, uint256 eth) private {
        expectedTokens[actor] += tokens;
        expectedETH[actor] += eth;
        expectedTokenCredits += tokens;
        expectedETHCredits += eth;
    }

    function _closeFailure() private view returns (bytes memory) {
        if (intake.price() == 0 || fundedIMD - spentIMD < intake.price()) {
            return abi.encodeWithSelector(BegVault.OracleUnfunded.selector);
        }
        if (intake.rejectRequests()) return abi.encodeWithSignature("Error(string)", "intake unavailable");
        return bytes("");
    }

    function _recordClose() private {
        BatchModel storage b = batches[expectedOpen];
        b.status = BegVault.Status.Pending;
        b.closedAt = vm.getBlockTimestamp();
        spentIMD += intake.price();
        ++expectedOpen;
    }

    function assertAssetsAndCredits() external view {
        assertEq(address(vault).balance + paidETH, entryETH + donatedETH + forcedETH);
        assertEq(vault.escrowedETH(), expectedEscrow);
        assertEq(vault.jackpotBank(), expectedBank);
        assertEq(vault.oracleBudget(), expectedBudget);
        assertEq(vault.totalClaimableTokens(), expectedTokenCredits);
        assertEq(vault.totalClaimableETH(), expectedETHCredits);
        assertEq(vault.vaultFreeBalance(), expectedFree);
        assertEq(
            address(vault).balance,
            expectedEscrow + expectedBank + expectedBudget + expectedETHCredits + forcedETH
        );
        assertEq(token.balanceOf(address(vault)) + paidTokens, 800_000_000 ether + donatedTokens);
        uint256 supply = token.balanceOf(address(vault)) + token.balanceOf(address(this));
        for (uint256 i; i < ACTORS; ++i) {
            (uint128 t, uint128 e) = vault.claimable(actors[i]);
            assertEq(t, expectedTokens[actors[i]]);
            assertEq(e, expectedETH[actors[i]]);
            assertEq(vault.cooldownUntil(actors[i]), expectedCooldown[actors[i]]);
            supply += token.balanceOf(actors[i]);
        }
        assertEq(token.totalSupply(), 1_000_000_000 ether);
        assertEq(supply, token.totalSupply());
    }

    function assertOracleFunding() external view {
        assertEq(vault.oracleTokenBudget(), fundedIMD - spentIMD);
        assertEq(imd.balanceOf(address(intake)), spentIMD);
        assertEq(imd.allowance(address(vault), address(intake)), 0);
        assertEq(imd.totalSupply(), fundedIMD);
    }

    function assertLifecycle() external view {
        assertEq(vault.openBatchId(), expectedOpen);
        assertEq(vault.nextAttemptId(), entries.length + 1);
        uint256 sizeSum;
        for (uint256 id = 1; id <= expectedOpen; ++id) {
            BatchModel storage model = batches[id];
            if (model.size == 0) continue;
            BegVault.Batch memory b = vault.getBatch(id);
            assertEq(uint256(b.status), uint256(model.status));
            assertEq(b.firstAttemptId, model.firstId);
            assertEq(b.size, model.size);
            assertEq(b.openedAt, model.openedAt);
            assertEq(b.closedAt, model.closedAt);
            assertLe(b.size, 20);
            sizeSum += b.size;
            if (model.terminalDigest != bytes32(0)) assertEq(keccak256(abi.encode(b)), model.terminalDigest);
            if (b.questionId != bytes32(0)) assertEq(vault.questionBatch(b.questionId), id);
        }
        assertEq(sizeSum, entries.length);
        for (uint256 i; i < entries.length; ++i) {
            Entry storage model = entries[i];
            BegVault.AttemptView memory a = vault.getAttempt(i + 1);
            assertEq(a.player, model.player);
            assertEq(a.batchId, model.batch);
            assertEq(a.index, i + 1 - batches[model.batch].firstId);
            assertEq(a.score, model.score);
            assertEq(a.refunded, model.refunded);
            assertTrue(vault.usedMessage(model.messageHash), "a message must never become reusable");
            if (batches[model.batch].status == BegVault.Status.Open) {
                assertEq(keccak256(bytes(a.message)), model.messageHash);
            } else {
                assertEq(bytes(a.message).length, 0);
            }
        }
    }

    /// @notice Every campaign must finish by making ALL credits withdrawable, even during an outage.
    function settleAndExit() external {
        vm.warp(vm.getBlockTimestamp() + 26 hours);
        uint256 last = expectedOpen;
        for (uint256 id = 1; id <= last; ++id) {
            if (batches[id].size == 0) continue;
            BegVault.Status status = batches[id].status;
            if (status == BegVault.Status.Pending || status == BegVault.Status.Open) _expire(id);
            if (status == BegVault.Status.Graded) {
                _reveal(id, actors[0], keccak256(abi.encode(id)), false);
                if (batches[id].status == BegVault.Status.Graded) {
                    _reveal(id, actors[0], keccak256(abi.encode(id)), false);
                }
            }
        }
        for (uint256 i; i < entries.length; ++i) {
            if (batches[entries[i].batch].status == BegVault.Status.Expired && !entries[i].refunded) {
                _refund(i + 1);
            }
        }
        for (uint256 i; i < ACTORS; ++i) {
            claim(i);
        }
        assertEq(vault.totalClaimableTokens(), 0);
        assertEq(vault.totalClaimableETH(), 0);
        assertEq(vault.escrowedETH(), 0);
        assertGt(grades, 0);
        assertGt(reveals, 0);
        assertGt(refunds, 0);
    }
}

/// forge-config: default.invariant.runs = 256
/// forge-config: default.invariant.depth = 96
/// forge-config: default.invariant.fail-on-revert = true
contract IndependentLedgerInvariantTest is BegVaultBase {
    IndependentLedgerHandler internal handler;

    function setUp() public override {
        super.setUp();
        intake.setRecordBody(false);
        handler = new IndependentLedgerHandler(vault, token, imd, intake, SIGNER_KEY);
        token.transfer(address(handler), token.balanceOf(address(this)));
        // Realistic initial states ensure every random sequence has meaningful liabilities.
        handler.enter(0, 20); // Full batch, automatic close.
        handler.grade(0, keccak256("initial grade"), false);
        vm.warp(vm.getBlockTimestamp() + 10 minutes);
        handler.enter(1, 3);
        vm.warp(vm.getBlockTimestamp() + 30 minutes);
        handler.close(); // Keep a separate request pending.
        handler.enter(4, 2);
        vm.warp(vm.getBlockTimestamp() + 30 minutes + 24 hours);
        handler.expire(2); // Explicitly seed a refundable batch; keep the first graded.
        handler.enter(6, 2); // And leave current message storage occupied.

        bytes4[] memory selectors = new bytes4[](11);
        selectors[0] = handler.enter.selector;
        selectors[1] = handler.close.selector;
        selectors[2] = handler.configureOracle.selector;
        selectors[3] = handler.fund.selector;
        selectors[4] = handler.forceETH.selector;
        selectors[5] = handler.advance.selector;
        selectors[6] = handler.grade.selector;
        selectors[7] = handler.expire.selector;
        selectors[8] = handler.reveal.selector;
        selectors[9] = handler.refund.selector;
        selectors[10] = handler.claim.selector;
        targetSelector(FuzzSelector(address(handler), selectors));
        targetContract(address(handler));
    }

    function invariantAssetsAndCreditsMatchIndependentCashFlows() public view {
        handler.assertAssetsAndCredits();
    }

    function invariantOracleFeesNeverConsumeETHOrLeaveAllowance() public view {
        handler.assertOracleFunding();
    }

    function invariantTerminalStatesMessagesAndAttemptOrderRemainConsistent() public view {
        handler.assertLifecycle();
    }

    function testHandlerExercisesOutageRecoveryRearmingDonationsAndExit() public {
        handler.refund(23, false);
        handler.refund(24, true);
        handler.claim(4);
        handler.configureOracle(3);
        vm.warp(vm.getBlockTimestamp() + 30 minutes);
        handler.close(); // Precisely expected OracleUnfunded; escrow stays recoverable.
        handler.fund(3, 1 ether, 1);
        handler.configureOracle(0);
        handler.close();
        handler.grade(3, keccak256("bad signature"), true);
        handler.grade(3, keccak256("valid signature"), false);
        handler.reveal(3, 0, keccak256("missed window"), true);
        handler.reveal(3, 0, keccak256("rearmed window"), false);
        handler.fund(1, 0.001 ether, 0);
        handler.fund(2, 123 ether, 2);
        handler.forceETH(17);
        handler.assertAssetsAndCredits();
        handler.assertOracleFunding();
        handler.assertLifecycle();
        afterInvariant();
    }

    function afterInvariant() public {
        handler.settleAndExit();
        handler.assertAssetsAndCredits();
        handler.assertOracleFunding();
        handler.assertLifecycle();
    }
}
