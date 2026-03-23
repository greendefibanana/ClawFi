/* eslint-disable */
import "../src/env/loadDotEnv";
import {
  AccountId,
  Client,
  TopicCreateTransaction,
  TokenCreateTransaction,
  TokenType,
  TokenSupplyType,
  Hbar,
} from "@hashgraph/sdk";
import { parseOperatorPrivateKey } from "../src/hedera/operatorKey";

async function main() {
  const operatorIdStr = process.env.HEDERA_OPERATOR_ID;
  const operatorKeyStr = process.env.HEDERA_OPERATOR_KEY;

  if (!operatorIdStr || !operatorKeyStr) {
    console.error("HEDERA_OPERATOR_ID and HEDERA_OPERATOR_KEY must be set in .env.");
    process.exit(1);
  }

  const network = process.env.HEDERA_NETWORK === "mainnet" ? "mainnet" : "testnet";
  const client = network === "mainnet" ? Client.forMainnet() : Client.forTestnet();
  
  const operatorId = AccountId.fromString(operatorIdStr);
  const operatorKey = parseOperatorPrivateKey(operatorKeyStr);
  client.setOperator(operatorId, operatorKey);

  console.log(`Setting up ClawFi infrastructure on Hedera ${network}...`);

  // 1. Create coordination topics
  console.log("Creating HCS coordination topics...");
  
  const rfpTopicTx = await new TopicCreateTransaction()
    .setTopicMemo("ClawFi RFP Bus (Requests for Proposals)")
    .execute(client);
  const rfpReceipt = await rfpTopicTx.getReceipt(client);
  const rfpTopicId = rfpReceipt.topicId?.toString();
  console.log(`HCS RFP Topic created: ${rfpTopicId}`);

  const bidsTopicTx = await new TopicCreateTransaction()
    .setTopicMemo("ClawFi Bids Bus (Agent Proposals)")
    .execute(client);
  const bidsReceipt = await bidsTopicTx.getReceipt(client);
  const bidsTopicId = bidsReceipt.topicId?.toString();
  console.log(`HCS Bids Topic created: ${bidsTopicId}`);

  const coordTopicTx = await new TopicCreateTransaction()
    .setTopicMemo("ClawFi Coordination Bus (Receipts)")
    .execute(client);
  const coordReceipt = await coordTopicTx.getReceipt(client);
  const coordTopicId = coordReceipt.topicId?.toString();
  console.log(`HCS Coordination Topic created: ${coordTopicId}`);

  // 2. Create ClawRewards HTS token
  console.log("Creating ClawRewards HTS token...");
  const tokenTx = await new TokenCreateTransaction()
    .setTokenName("ClawRewards")
    .setTokenSymbol("CLAW")
    .setTokenType(TokenType.FungibleCommon)
    .setDecimals(2)
    .setInitialSupply(1000000)
    .setTreasuryAccountId(operatorId)
    .setSupplyType(TokenSupplyType.Infinite)
    .setSupplyKey(operatorKey)
    .setAdminKey(operatorKey)
    .setFeeScheduleKey(operatorKey)
    .setWipeKey(operatorKey)
    .setFreezeKey(operatorKey)
    .execute(client);
  const tokenReceipt = await tokenTx.getReceipt(client);
  const tokenId = tokenReceipt.tokenId?.toString();
  console.log(`HTS Token created: ${tokenId}`);

  console.log("\nInfrastructure setup complete.");
  console.log("-------------------------------");
  console.log("Update your .env with these values:");
  console.log(`HEDERA_RFP_TOPIC_ID=${rfpTopicId}`);
  console.log(`HEDERA_BIDS_TOPIC_ID=${bidsTopicId}`);
  console.log(`HEDERA_RECEIPT_TOPIC_ID=${coordTopicId}`);
  console.log(`CLAWFI_REWARD_TOKEN_ID=${tokenId}`);
  console.log("-------------------------------");
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
