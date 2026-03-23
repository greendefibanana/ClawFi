import { PrivateKey } from "@hashgraph/sdk";

export type HederaOperatorKeyType = "ecdsa" | "ed25519";

export function readOperatorKeyType(value = process.env.HEDERA_OPERATOR_KEY_TYPE): HederaOperatorKeyType {
  return value === "ed25519" ? "ed25519" : "ecdsa";
}

export function readTreasuryKeyType(
  value = process.env.CLAWFI_TREASURY_KEY_TYPE ?? process.env.HEDERA_OPERATOR_KEY_TYPE,
): HederaOperatorKeyType {
  return value === "ed25519" ? "ed25519" : "ecdsa";
}

export function parseHederaPrivateKey(raw: string, keyType: HederaOperatorKeyType): PrivateKey {
  return keyType === "ed25519" ? PrivateKey.fromStringED25519(raw) : PrivateKey.fromStringECDSA(raw);
}

export function parseOperatorPrivateKey(raw: string, keyType = readOperatorKeyType()): PrivateKey {
  return parseHederaPrivateKey(raw, keyType);
}

export function parseTreasuryPrivateKey(raw: string, keyType = readTreasuryKeyType()): PrivateKey {
  return parseHederaPrivateKey(raw, keyType);
}
