// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @notice Lossless JSON string encoding. Validation excludes malformed UTF-8, not player instructions.
library MessageJson {
    error InvalidUTF8();

    /// @return escapedLength Bytes inside JSON quotes, including escape sequences.
    function validate(bytes calldata text) internal pure returns (uint256 escapedLength) {
        bool valid = true;
        // A bounded calldata scan avoids allocating/copying player text or repeated array bounds checks.
        // Lead bytes, continuation bytes, shortest form, surrogates and U+10FFFF are all checked.
        assembly ("memory-safe") {
            function equalByteMask(word, repeatedByte) -> result {
                let lowBits := 0x7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f
                let x := xor(word, repeatedByte)
                result := not(or(or(add(and(x, lowBits), lowBits), x), lowBits))
            }
            function countHighBits(mask) -> count {
                count := byte(
                    0,
                    mul(shr(7, mask), 0x0101010101010101010101010101010101010101010101010101010101010101)
                )
            }
            let cursor := text.offset
            let end := add(cursor, text.length)
            let nextWord := cursor
            for {} lt(cursor, end) {} {
                // Process 32 ASCII bytes together. Each per-byte sum stays below 256, so no
                // carry crosses byte boundaries. The final byte of the product is a popcount.
                if iszero(lt(cursor, nextWord)) {
                    nextWord := add(cursor, 32)
                    if iszero(gt(nextWord, end)) {
                        let word := calldataload(cursor)
                        let highBits := 0x8080808080808080808080808080808080808080808080808080808080808080
                        if iszero(and(word, highBits)) {
                            let controls :=
                                and(
                                    not(
                                        add(
                                            word,
                                            0x6060606060606060606060606060606060606060606060606060606060606060
                                        )
                                    ),
                                    highBits
                                )
                            let quotes :=
                                equalByteMask(
                                    word,
                                    0x2222222222222222222222222222222222222222222222222222222222222222
                                )
                            let slashes :=
                                equalByteMask(
                                    word,
                                    0x5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c
                                )
                            escapedLength := add(
                                escapedLength,
                                add(
                                    32,
                                    add(mul(5, countHighBits(controls)), countHighBits(or(quotes, slashes)))
                                )
                            )
                            cursor := add(cursor, 32)
                            continue
                        }
                    }
                }
                let c := byte(0, calldataload(cursor))
                switch lt(c, 0x80)
                case 1 {
                    // Mixed text often has long ASCII runs inside a word containing a Unicode scalar.
                    // An eight-byte fast path keeps those runs from falling back to a bytewise scan.
                    if iszero(gt(add(cursor, 8), end)) {
                        let topEight := 0xffffffffffffffff000000000000000000000000000000000000000000000000
                        let highBits := 0x8080808080808080000000000000000000000000000000000000000000000000
                        let word := and(calldataload(cursor), topEight)
                        if iszero(and(word, highBits)) {
                            let controls :=
                                and(
                                    not(
                                        add(
                                            word,
                                            0x6060606060606060000000000000000000000000000000000000000000000000
                                        )
                                    ),
                                    highBits
                                )
                            let quotes :=
                                and(
                                    equalByteMask(
                                        word,
                                        0x2222222222222222222222222222222222222222222222222222222222222222
                                    ),
                                    topEight
                                )
                            let slashes :=
                                and(
                                    equalByteMask(
                                        word,
                                        0x5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c
                                    ),
                                    topEight
                                )
                            escapedLength := add(
                                escapedLength,
                                add(
                                    8,
                                    add(mul(5, countHighBits(controls)), countHighBits(or(quotes, slashes)))
                                )
                            )
                            cursor := add(cursor, 8)
                            continue
                        }
                    }
                    let cost := 1
                    if or(eq(c, 34), eq(c, 92)) { cost := 2 }
                    if lt(c, 32) { cost := 6 }
                    escapedLength := add(escapedLength, cost)
                    cursor := add(cursor, 1)
                }
                default {
                    // Two-byte scalars have no surrogate/range special cases beyond their lead byte.
                    if lt(c, 0xe0) {
                        if or(lt(c, 0xc2), iszero(lt(add(cursor, 1), end))) {
                            valid := 0
                            break
                        }
                        if iszero(eq(and(byte(0, calldataload(add(cursor, 1))), 0xc0), 0x80)) {
                            valid := 0
                            break
                        }
                        escapedLength := add(escapedLength, 2)
                        cursor := add(cursor, 2)
                        continue
                    }
                    let word := calldataload(cursor)
                    let second := byte(1, word)
                    switch lt(c, 0xf0)
                    case 1 {
                        if gt(add(cursor, 3), end) {
                            valid := 0
                            break
                        }
                        if iszero(eq(and(shr(232, word), 0xc0c0), 0x8080)) {
                            valid := 0
                            break
                        }
                        if or(and(eq(c, 0xe0), lt(second, 0xa0)), and(eq(c, 0xed), gt(second, 0x9f))) {
                            valid := 0
                            break
                        }
                        escapedLength := add(escapedLength, 3)
                        cursor := add(cursor, 3)
                    }
                    default {
                        if or(gt(c, 0xf4), gt(add(cursor, 4), end)) {
                            valid := 0
                            break
                        }
                        if iszero(eq(and(shr(224, word), 0xc0c0c0), 0x808080)) {
                            valid := 0
                            break
                        }
                        if or(and(eq(c, 0xf0), lt(second, 0x90)), and(eq(c, 0xf4), gt(second, 0x8f))) {
                            valid := 0
                            break
                        }
                        escapedLength := add(escapedLength, 4)
                        cursor := add(cursor, 4)
                    }
                }
            }
        }
        if (!valid) revert InvalidUTF8();
    }

    function quote(bytes memory text) internal pure returns (bytes memory out) {
        bytes16 hexDigits = "0123456789abcdef";
        out = new bytes(text.length * 6 + 2);
        uint256 cursor = 1;
        out[0] = '"';
        for (uint256 i; i < text.length; ++i) {
            uint8 c = uint8(text[i]);
            if (c == 34 || c == 92) {
                out[cursor++] = "\\";
                out[cursor++] = bytes1(c);
            } else if (c < 32) {
                out[cursor++] = "\\";
                out[cursor++] = "u";
                out[cursor++] = "0";
                out[cursor++] = "0";
                out[cursor++] = hexDigits[c >> 4];
                out[cursor++] = hexDigits[c & 15];
            } else {
                out[cursor++] = bytes1(c);
            }
        }
        out[cursor++] = '"';
        assembly ("memory-safe") { mstore(out, cursor) }
    }
}
