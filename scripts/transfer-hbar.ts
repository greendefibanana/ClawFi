import "../src/env/loadDotEnv";
import { AccountId, Client, Hbar, TransferTransaction } from "@hashgraph/sdk";
import { parseTreasuryPrivateKey } from "../src/hedera/operatorKey";
import { readTreasuryAccountId, readTreasuryKey } from "../src/hedera/runtimeConfig";

const recipient = process.argv[2];
const amountRaw = process.argv[3];

if (!recipient || !amountRaw) {
  console.error("Usage: npx tsx scripts/transfer-hbar.ts <recipientAccountId> <amountHbar>");
  process.exit(1);
}

const network = process.env.HEDERA_NETWORK === "mainnet" ? "mainnet" : "testnet";
const treasuryAccountId = readTreasuryAccountId();
const treasuryKey = readTreasuryKey();
const amountHbar = Number.parseFloat(amountRaw);

if (!treasuryAccountId || !treasuryKey || !Number.isFinite(amountHbar) || amountHbar <= 0) {
  console.error("Missing treasury credentials or invalid amount.");
  process.exit(1);
}

const client = network === "mainnet" ? Client.forMainnet() : Client.forTestnet();
client.setOperator(AccountId.fromString(treasuryAccountId), parseTreasuryPrivateKey(treasuryKey));

const response = await new TransferTransaction()
  .addHbarTransfer(AccountId.fromString(treasuryAccountId), new Hbar(amountHbar).negated())
  .addHbarTransfer(AccountId.fromString(recipient), new Hbar(amountHbar))
  .execute(client);

const receipt = await response.getReceipt(client);
console.log(
  JSON.stringify(
    {
      status: receipt.status.toString(),
      transactionId: response.transactionId.toString(),
      from: treasuryAccountId,
      to: recipient,
      amountHbar,
    },
    null,
    2,
  ),
);

client.close();
