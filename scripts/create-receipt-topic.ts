import "../src/env/loadDotEnv";
import { AccountId, Client, PrivateKey, TopicCreateTransaction } from "@hashgraph/sdk";

function readRequiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} must be set.`);
  }
  return value;
}

function readOperatorKey(raw: string) {
  const normalized = raw.startsWith("0x") ? raw.slice(2) : raw;
  try {
    return PrivateKey.fromStringECDSA(raw);
  } catch {
    return PrivateKey.fromStringECDSA(normalized);
  }
}

async function main() {
  const network = process.env.HEDERA_NETWORK === "mainnet" ? "mainnet" : "testnet";
  const operatorId = AccountId.fromString(readRequiredEnv("HEDERA_OPERATOR_ID"));
  const operatorKey = readOperatorKey(readRequiredEnv("HEDERA_OPERATOR_KEY"));
  const client = network === "mainnet" ? Client.forMainnet() : Client.forTestnet();
  client.setOperator(operatorId, operatorKey);
  client.setRequestTimeout(30_000);
  client.setMaxNodeAttempts(1);

  try {
    console.error(`Creating receipt topic on ${network} for operator ${operatorId.toString()}...`);
    const tx = await new TopicCreateTransaction()
      .setTopicMemo("ClawFi Coordination Bus (Receipts)")
      .execute(client);
    console.error(`Submitted topic create transaction ${tx.transactionId.toString()}. Waiting for receipt...`);
    const receipt = await tx.getReceipt(client);

    console.log(
      JSON.stringify(
        {
          topicId: receipt.topicId?.toString() ?? null,
          transactionId: tx.transactionId.toString(),
          network,
        },
        null,
        2,
      ),
    );
  } finally {
    client.close();
  }
}

await main();
