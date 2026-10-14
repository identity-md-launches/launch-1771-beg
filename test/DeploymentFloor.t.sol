// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {BegVaultBase} from "./BegVaultBase.sol";
import {BegVault} from "../src/BegVault.sol";
import {LaunchToken} from "../src/LaunchToken.sol";

contract DeploymentFloorTest is BegVaultBase {
    function testRuntimeFitsAndHasNoEscapeOpcodes() public view {
        _checkCode(address(token).code);
        _checkCode(address(vault).code);
    }

    function testApplicationConstructorPreservesFactorySupply() public {
        LaunchToken launchToken = new LaunchToken();
        uint256 supply = launchToken.totalSupply();
        BegVault app = new BegVault(
            address(launchToken), TEAM, address(intake), address(imd), vm.addr(SIGNER_KEY), PRICE
        );
        assertEq(launchToken.balanceOf(address(this)), supply);
        assertEq(launchToken.balanceOf(address(app)), 0);
        assertEq(launchToken.totalSupply(), 1_000_000_000 ether);
    }

    function testClosingActuallyErasesMessageStorageWords() public {
        bytes memory text = new bytes(280);
        for (uint256 i; i < text.length; ++i) {
            text[i] = 0x61;
        }
        vm.record();
        vault.attempt{value: PRICE}(string(text));
        (, bytes32[] memory slots) = vm.accesses(address(vault));
        bool[] memory messageSlot = new bool[](slots.length);
        bytes32 fullWord = 0x6161616161616161616161616161616161616161616161616161616161616161;
        bytes32 tailWord = fullWord & bytes32(type(uint256).max << 64);
        uint256 count;
        for (uint256 i; i < slots.length; ++i) {
            bytes32 value = vm.load(address(vault), slots[i]);
            if (value == fullWord || value == tailWord) {
                messageSlot[i] = true;
                ++count;
            }
        }
        assertEq(count, 9);
        vm.warp(vm.getBlockTimestamp() + 30 minutes);
        vault.closeBatch();
        for (uint256 i; i < slots.length; ++i) {
            if (messageSlot[i]) assertEq(vm.load(address(vault), slots[i]), bytes32(uint256(1)));
        }
    }

    function _checkCode(bytes memory code) private pure {
        assertGt(code.length, 0);
        assertLe(code.length, 24_576);
        for (uint256 i; i < code.length; ++i) {
            uint8 op = uint8(code[i]);
            if (op >= 0x60 && op <= 0x7f) {
                i += op - 0x5f;
                continue;
            }
            assertTrue(op != 0xf4 && op != 0xf2 && op != 0xff, "forbidden escape opcode");
        }
    }
}
