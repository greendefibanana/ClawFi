import "../src/env/loadDotEnv";
import {
  AccountBalanceQuery,
  AccountCreateTransaction,
  AccountId,
  Client,
  Hbar,
  PrivateKey,
  TokenAssociateTransaction,
  TokenId,
  TransferTransaction,
} from "@hashgraph/sdk";
import { parseOperatorPrivateKey } from "../src/hedera/operatorKey";

const agentNames = ["Coordinator", "Token Research", "DeFi Strategy", "Risk", "Execution", "Reporter"] as const;

async function main() {
  const operatorId = process.env.HEDERA_OPERATOR_ID;
  const operatorKey = process.env.HEDERA_OPERATOR_KEY;
  if (!operatorId || !operatorKey) {
    throw new Error("HEDERA_OPERATOR_ID and HEDERA_OPERATOR_KEY must be set.");
  }

  const network = process.env.HEDERA_NETWORK === "mainnet" ? "mainnet" : "testnet";
  const client = network === "mainnet" ? Client.forMainnet() : Client.forTestnet();
  client.setOperator(AccountId.fromString(operatorId), parseOperatorPrivateKey(operatorKey));

  const treasuryInitialHbar = Number.parseFloat(process.env.CLAWFI_PROVISION_TREASURY_HBAR ?? "50");
  const recipientInitialHbar = Number.parseFloat(process.env.CLAWFI_PROVISION_RECIPIENT_HBAR ?? "2");
  const treasuryTokenBaseUnits = parseBigIntRecord(process.env.CLAWFI_PROVISION_TREASURY_TOKEN_BASE_UNITS_JSON);
  const tokenIdsToAssociate = Array.from(
    new Set([
      ...Object.keys(treasuryTokenBaseUnits),
      process.env.BONZO_DEFI_ASSET_TOKEN_ID?.trim() ?? "",
      ...Object.values(parseJsonRecord(process.env.SAUCERSWAP_SYMBOL_TOKEN_MAP_JSON)),
    ].filter((entry) => entry.length > 0)),
  );

  const treasuryKey = PrivateKey.generateECDSA();
  const treasuryAccountId = await createAccount({
    client,
    key: treasuryKey,
    initialBalanceHbar: treasuryInitialHbar,
  });
  await associateTokens({
    client,
    accountId: treasuryAccountId,
    key: treasuryKey,
    tokenIds: tokenIdsToAssociate,
    network,
  });
  await seedTokens({
    client,
    operatorId,
    treasuryAccountId,
    tokenAmounts: treasuryTokenBaseUnits,
  });

  const agentRecipients: Record<string, string> = {};
  for (const agentName of agentNames) {
    const key = PrivateKey.generateECDSA();
    const accountId = await createAccount({
      client,
      key,
      initialBalanceHbar: recipientInitialHbar,
    });
    agentRecipients[agentName] = accountId.toString();
  }

  const treasuryBalance = await new AccountBalanceQuery().setAccountId(treasuryAccountId).execute(client);
  console.log(JSON.stringify({
    treasuryAccountId: treasuryAccountId.toString(),
    treasuryEvmAddress: treasuryAccountId.toSolidityAddress(),
    treasuryHbar: treasuryBalance.hbars.toString(),
    associatedTokenIds: tokenIdsToAssociate,
    agentRecipients,
    env: {
      CLAWFI_TREASURY_ACCOUNT_ID: treasuryAccountId.toString(),
      CLAWFI_TREASURY_EVM_ADDRESS: `0x${treasuryAccountId.toSolidityAddress()}`,
      CLAWFI_TREASURY_KEY: treasuryKey.toStringRaw(),
      CLAWFI_TREASURY_KEY_TYPE: "ecdsa",
      CLAWFI_AGENT_RECIPIENTS_JSON: JSON.stringify(agentRecipients),
    },
  }, null, 2));
  client.close();
}

async function createAccount(input: {
  client: Client;
  key: PrivateKey;
  initialBalanceHbar: number;
}) {
  const response = await new AccountCreateTransaction()
    .setKey(input.key.publicKey)
    .setInitialBalance(new Hbar(input.initialBalanceHbar))
    .execute(input.client);
  const receipt = await response.getReceipt(input.client);
  if (!receipt.accountId) {
    throw new Error("AccountCreateTransaction did not return an account ID.");
  }
  return receipt.accountId;
}

async function associateTokens(input: {
  client: Client;
  accountId: AccountId;
  key: PrivateKey;
  tokenIds: string[];
  network: "testnet" | "mainnet";
}) {
  if (input.tokenIds.length === 0) {
    return;
  }

  const treasuryClient = input.network === "mainnet" ? Client.forMainnet() : Client.forTestnet();
  try {
    treasuryClient.setOperator(input.accountId, input.key);
    const response = await new TokenAssociateTransaction()
      .setAccountId(input.accountId)
      .setTokenIds(input.tokenIds.map((entry) => TokenId.fromString(entry)))
      .execute(treasuryClient);
    await response.getReceipt(treasuryClient);
  } finally {
    treasuryClient.close();
  }
}

async function seedTokens(input: {
  client: Client;
  operatorId: string;
  treasuryAccountId: AccountId;
  tokenAmounts: Record<string, bigint>;
}) {
  for (const [tokenId, amount] of Object.entries(input.tokenAmounts)) {
    if (amount <= 0n) {
      continue;
    }
    const response = await new TransferTransaction()
      .addTokenTransfer(TokenId.fromString(tokenId), AccountId.fromString(input.operatorId), -Number(amount))
      .addTokenTransfer(TokenId.fromString(tokenId), input.treasuryAccountId, Number(amount))
      .execute(input.client);
    await response.getReceipt(input.client);
  }
}

function parseJsonRecord(raw: string | undefined) {
  if (!raw) {
    return {};
  }
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
    );
  } catch {
    return {};
  }
}

function parseBigIntRecord(raw: string | undefined) {
  if (!raw) {
    return {} as Record<string, bigint>;
  }
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed)
        .filter((entry): entry is [string, string | number] => typeof entry[1] === "string" || typeof entry[1] === "number")
        .map(([key, value]) => [key, BigInt(value)]),
    ) as Record<string, bigint>;
  } catch {
    return {} as Record<string, bigint>;
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
