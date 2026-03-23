import {
  AccountId,
  ContractExecuteTransaction,
  ContractId,
  ContractFunctionParameters,
  Hbar,
  Status,
  TokenAssociateTransaction,
  TokenId,
  TopicId,
  TopicMessageSubmitTransaction,
  TransferTransaction,
  type Signer,
} from "@hashgraph/sdk";
import type { DAppSigner } from "@hashgraph/hedera-wallet-connect";
import { Buffer } from "buffer";
import type { WorkflowResult } from "../core/models/schemas";

export type WalletActionResult = {
  actionId: string;
  status: "executed" | "failed" | "skipped";
  transactionId?: string;
  explorerUrl?: string;
  detail: string;
};

export type WalletPayoutResult = {
  taskId: string;
  transactionId: string;
};

type NumericLike = {
  toNumber(): number;
};

type TokenBalanceEntryLike = [{ toString(): string }, NumericLike];

type AccountBalanceLike = {
  hbars: {
    toTinybars(): NumericLike;
  };
  tokens?: Iterable<TokenBalanceEntryLike>;
};

export async function executeWalletApproval(input: {
  session: WorkflowResult;
  signer: DAppSigner;
  walletAccountId: string;
}) {
  if (input.session.treasury.accountId !== input.walletAccountId) {
    throw new Error("Connected wallet account does not match the session treasury account.");
  }

  const actionResults: WalletActionResult[] = [];
  const payoutResults: WalletPayoutResult[] = [];
  const receiptTopicId = readStringEnv("VITE_HEDERA_RECEIPT_TOPIC_ID");

  if (receiptTopicId) {
    await submitReceiptAnchor({
      signer: input.signer,
      topicId: receiptTopicId,
      network: input.session.treasury.network,
      payload: {
        eventType: "execution_approved",
        sessionId: input.session.sessionId,
        approvedAt: new Date().toISOString(),
        accountId: input.walletAccountId,
      },
    });
  }

  for (const action of input.session.actionPlan.actions) {
    actionResults.push(
      await executeAction({
        signer: input.signer,
        session: input.session,
        action,
      }),
    );
  }

  for (const task of input.session.tasks.filter((entry) => entry.status === "completed")) {
    const response = await executePayout({
      signer: input.signer,
      session: input.session,
      task,
    });
    payoutResults.push(response);
  }

  return {
    approvedBy: input.walletAccountId,
    walletAccountId: input.walletAccountId,
    actionResults,
    payoutResults,
  };
}

function asSdkSigner(signer: DAppSigner) {
  return signer as unknown as Signer;
}

async function executeAction(input: {
  signer: DAppSigner;
  session: WorkflowResult;
  action: WorkflowResult["actionPlan"]["actions"][number];
}): Promise<WalletActionResult> {
  try {
    if (input.action.actionType === "buy_token") {
      return await executeTokenTrade(input);
    }

    if (input.action.actionType === "allocate_defi") {
      return await executeDefiAllocation(input);
    }

    return {
      actionId: input.action.id,
      status: "skipped",
      detail: `No browser wallet execution route is mapped for ${input.action.actionType}.`,
    };
  } catch (error) {
    return {
      actionId: input.action.id,
      status: "failed",
      detail: error instanceof Error ? error.message : "Wallet execution failed.",
    };
  }
}

async function executeTokenTrade(input: {
  signer: DAppSigner;
  session: WorkflowResult;
  action: WorkflowResult["actionPlan"]["actions"][number];
}): Promise<WalletActionResult> {
  const tokenOutId = readJsonRecordEnv("VITE_SAUCERSWAP_SYMBOL_TOKEN_MAP_JSON", {
    SAUCE: "0.0.1183558",
  })[input.action.assetSymbol.toUpperCase()];
  if (!tokenOutId) {
    throw new Error(`No token mapping configured for symbol ${input.action.assetSymbol}.`);
  }

  await associateTokenSafe(input.signer, tokenOutId);

  const balance = asAccountBalance(await input.signer.getAccountBalance());
  const availableTinybar = balance.hbars.toTinybars().toNumber();
  const hbarPriceUsd =
    input.session.treasury.portfolio.positions.find((position) => position.symbol === "HBAR")?.priceUsd ?? 0.11;
  const desiredAmountInTinybar = Math.max(1, Math.floor((input.action.targetAllocationUsd / hbarPriceUsd) * 100_000_000));
  const amountInTinybar = Math.max(1, Math.min(desiredAmountInTinybar, maxSpendableTradeTinybars(availableTinybar)));
  if (amountInTinybar <= 0) {
    throw new Error("Insufficient HBAR balance for live wallet execution.");
  }

  const routerContractId = ContractId.fromString(readStringEnv("VITE_SAUCERSWAP_ROUTER_CONTRACT_ID") || "0.0.19264");
  const whbarAddress = TokenId.fromString(readStringEnv("VITE_SAUCERSWAP_WHBAR_TOKEN_ID") || "0.0.15058").toSolidityAddress();
  const tokenOutAddress = TokenId.fromString(tokenOutId).toSolidityAddress();
  const deadlineEpoch = Math.floor(Date.now() / 1000) + 900;

  const params = new ContractFunctionParameters()
    .addUint256(1)
    .addAddressArray([whbarAddress, tokenOutAddress])
    .addAddress(AccountId.fromString(input.session.treasury.accountId).toSolidityAddress())
    .addUint256(deadlineEpoch);

  const response = await new ContractExecuteTransaction()
    .setContractId(routerContractId)
    .setGas(readPositiveIntEnv("VITE_SAUCERSWAP_TRADE_GAS", 1_500_000))
    .setFunction("swapExactETHForTokens", params)
    .setPayableAmount(Hbar.fromTinybars(amountInTinybar))
    .freezeWithSigner(asSdkSigner(input.signer))
    .then((tx) => tx.executeWithSigner(asSdkSigner(input.signer)));
  const receipt = await response.getReceiptWithSigner(asSdkSigner(input.signer));
  if (receipt.status !== Status.Success) {
    throw new Error(`Swap transaction failed with status ${receipt.status.toString()}.`);
  }

  return {
    actionId: input.action.id,
    status: "executed",
    transactionId: response.transactionId.toString(),
    explorerUrl: hashscanUrl(input.session.treasury.network, response.transactionId.toString()),
    detail: `Executed SaucerSwap HBAR->${input.action.assetSymbol} swap from the connected wallet.`,
  };
}

async function executeDefiAllocation(input: {
  signer: DAppSigner;
  session: WorkflowResult;
  action: WorkflowResult["actionPlan"]["actions"][number];
}): Promise<WalletActionResult> {
  const bonzoAssetTokenId = readStringEnv("VITE_BONZO_DEFI_ASSET_TOKEN_ID") || readStringEnv("BONZO_DEFI_ASSET_TOKEN_ID");
  if (!bonzoAssetTokenId) {
    throw new Error("BONZO_DEFI_ASSET_TOKEN_ID is not configured for browser wallet execution.");
  }

  const lendingPoolContractId = resolveBonzoLendingPoolContractId();
  if (!lendingPoolContractId) {
    throw new Error("Bonzo lending pool contract is not configured.");
  }

  let depositAmountOverride: number | undefined;
  const whbarTokenId = readStringEnv("VITE_SAUCERSWAP_WHBAR_TOKEN_ID") || "0.0.15058";
  if (bonzoAssetTokenId === whbarTokenId) {
    depositAmountOverride = estimateWhbarAmount({
      session: input.session,
      targetAllocationUsd: input.action.targetAllocationUsd,
      fallbackAssetPriceUsd: readPositiveFloatEnv("VITE_BONZO_DEFI_ASSET_PRICE_USD", 1),
    });
    await wrapHbarToWhbar({
      signer: input.signer,
      whbarTokenId: bonzoAssetTokenId,
      amountInTinybar: depositAmountOverride,
    });
  } else {
    await associateTokenSafe(input.signer, bonzoAssetTokenId);
  }

  const spenderAddress = resolveBonzoSpenderAddress(lendingPoolContractId);
  const balance = asAccountBalance(await input.signer.getAccountBalance());
  const tokenId = TokenId.fromString(bonzoAssetTokenId);
  let availableBalance = 0;
  for (const [ownedTokenId, amount] of getTokenBalances(balance)) {
    if (ownedTokenId.toString() === tokenId.toString()) {
      availableBalance = amount.toNumber();
      break;
    }
  }

  const desiredDepositAmount =
    depositAmountOverride ??
    Math.max(
      1,
      Math.floor(
        (input.action.targetAllocationUsd / readPositiveFloatEnv("VITE_BONZO_DEFI_ASSET_PRICE_USD", 1)) *
          10 ** readPositiveIntEnv("VITE_BONZO_DEFI_ASSET_DECIMALS", 6),
      ),
    );
  const depositAmount = Math.min(desiredDepositAmount, availableBalance);
  if (depositAmount <= 0) {
    throw new Error(`No available balance for Bonzo asset ${bonzoAssetTokenId}.`);
  }

  await approveTokenSpender({
    signer: input.signer,
    tokenId,
    spenderEvmAddress: spenderAddress,
    amount: depositAmount,
  });

  const depositResponse = await new ContractExecuteTransaction()
    .setContractId(lendingPoolContractId)
    .setGas(readPositiveIntEnv("VITE_BONZO_DEFI_GAS", 1_500_000))
    .setFunctionParameters(
      encodeBonzoDepositCall(
        tokenId.toSolidityAddress(),
        depositAmount,
        AccountId.fromString(input.session.treasury.accountId).toSolidityAddress(),
      ),
    )
    .freezeWithSigner(asSdkSigner(input.signer))
    .then((tx) => tx.executeWithSigner(asSdkSigner(input.signer)));
  const depositReceipt = await depositResponse.getReceiptWithSigner(asSdkSigner(input.signer));
  if (depositReceipt.status !== Status.Success) {
    throw new Error(`Bonzo deposit failed with status ${depositReceipt.status.toString()}.`);
  }

  return {
    actionId: input.action.id,
    status: "executed",
    transactionId: depositResponse.transactionId.toString(),
    explorerUrl: hashscanUrl(input.session.treasury.network, depositResponse.transactionId.toString()),
    detail: `Executed Bonzo deposit for ${input.action.assetSymbol} from the connected wallet.`,
  };
}

async function executePayout(input: {
  signer: DAppSigner;
  session: WorkflowResult;
  task: WorkflowResult["tasks"][number];
}) {
  const recipientAccountId = resolveAgentRecipientAccountId(input.task.agentName, input.session.treasury.accountId);
  const hbarPriceUsd =
    input.session.treasury.portfolio.positions.find((position) => position.symbol === "HBAR")?.priceUsd ?? 0.11;
  const rewardUsd = input.session.rewardReservations.find((reservation) => reservation.taskId === input.task.id)?.rewardUsd ?? input.task.rewardUsd;
  const rewardHbar = rewardUsd / hbarPriceUsd;
  const tinybars = Math.max(1, Math.round(rewardHbar * 100_000_000));

  const response = await new TransferTransaction()
    .addHbarTransfer(AccountId.fromString(input.session.treasury.accountId), Hbar.fromTinybars(tinybars).negated())
    .addHbarTransfer(AccountId.fromString(recipientAccountId), Hbar.fromTinybars(tinybars))
    .freezeWithSigner(asSdkSigner(input.signer))
    .then((tx) => tx.executeWithSigner(asSdkSigner(input.signer)));
  const receipt = await response.getReceiptWithSigner(asSdkSigner(input.signer));
  if (receipt.status !== Status.Success) {
    throw new Error(`Reward payout failed for ${input.task.agentName} with status ${receipt.status.toString()}.`);
  }

  return {
    taskId: input.task.id,
    transactionId: response.transactionId.toString(),
  };
}

async function associateTokenSafe(signer: DAppSigner, tokenId: string) {
  const balance = asAccountBalance(await signer.getAccountBalance());
  const targetTokenId = TokenId.fromString(tokenId);
  for (const [ownedTokenId] of getTokenBalances(balance)) {
    if (ownedTokenId.toString() === targetTokenId.toString()) {
      return;
    }
  }

  const response = await new TokenAssociateTransaction()
    .setAccountId(signer.getAccountId().toString())
    .setTokenIds([targetTokenId])
    .freezeWithSigner(asSdkSigner(signer))
    .then((tx) => tx.executeWithSigner(asSdkSigner(signer)));
  const receipt = await response.getReceiptWithSigner(asSdkSigner(signer));
  if (receipt.status !== Status.Success && receipt.status.toString() !== "TOKEN_ALREADY_ASSOCIATED_TO_ACCOUNT") {
    throw new Error(`Token association failed with status ${receipt.status.toString()}.`);
  }
}

async function approveTokenSpender(input: {
  signer: DAppSigner;
  tokenId: TokenId;
  spenderEvmAddress: string;
  amount: number;
}) {
  const response = await new ContractExecuteTransaction()
    .setContractId(contractIdFromEvmAddress(input.tokenId.toSolidityAddress()))
    .setGas(1_000_000)
    .setFunctionParameters(encodeErc20ApproveCall(input.spenderEvmAddress, input.amount))
    .freezeWithSigner(asSdkSigner(input.signer))
    .then((tx) => tx.executeWithSigner(asSdkSigner(input.signer)));
  const receipt = await response.getReceiptWithSigner(asSdkSigner(input.signer));
  if (receipt.status !== Status.Success) {
    throw new Error(`Allowance approval failed with status ${receipt.status.toString()}.`);
  }
}

async function wrapHbarToWhbar(input: {
  signer: DAppSigner;
  whbarTokenId: string;
  amountInTinybar: number;
}) {
  await associateTokenSafe(input.signer, input.whbarTokenId);
  const response = await new ContractExecuteTransaction()
    .setContractId(contractIdFromEvmAddress(TokenId.fromString(input.whbarTokenId).toSolidityAddress()))
    .setGas(300_000)
    .setFunction("deposit", new ContractFunctionParameters())
    .setPayableAmount(Hbar.fromTinybars(input.amountInTinybar))
    .freezeWithSigner(asSdkSigner(input.signer))
    .then((tx) => tx.executeWithSigner(asSdkSigner(input.signer)));
  const receipt = await response.getReceiptWithSigner(asSdkSigner(input.signer));
  if (receipt.status !== Status.Success) {
    throw new Error(`WHBAR wrap failed with status ${receipt.status.toString()}.`);
  }
}

async function submitReceiptAnchor(input: {
  signer: DAppSigner;
  topicId: string;
  network: string;
  payload: Record<string, unknown>;
}) {
  const response = await new TopicMessageSubmitTransaction()
    .setTopicId(TopicId.fromString(input.topicId))
    .setMessage(JSON.stringify(input.payload))
    .freezeWithSigner(asSdkSigner(input.signer))
    .then((tx) => tx.executeWithSigner(asSdkSigner(input.signer)));
  const receipt = await response.getReceiptWithSigner(asSdkSigner(input.signer));
  if (receipt.status !== Status.Success) {
    throw new Error(`Receipt anchoring failed with status ${receipt.status.toString()}.`);
  }
  return {
    transactionId: response.transactionId.toString(),
    explorerUrl: hashscanUrl(input.network, response.transactionId.toString()),
  };
}

function resolveAgentRecipientAccountId(agentName: string, fallbackAccountId: string) {
  const raw = readStringEnv("VITE_CLAWFI_AGENT_RECIPIENTS_JSON");
  if (!raw) {
    return fallbackAccountId;
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const configured = parsed[agentName];
    return typeof configured === "string" && configured.trim() ? configured : fallbackAccountId;
  } catch {
    return fallbackAccountId;
  }
}

function resolveBonzoLendingPoolContractId() {
  const contractId = readStringEnv("VITE_BONZO_LENDING_POOL_CONTRACT_ID");
  if (contractId) {
    return ContractId.fromString(contractId);
  }

  const evmAddress =
    readStringEnv("VITE_BONZO_LENDING_POOL_EVM_ADDRESS") ||
    readStringEnv("BONZO_LENDING_POOL_EVM_ADDRESS") ||
    "7710a96b01e02ed00768c3b39bfa7b4f1c128c62";
  return contractIdFromEvmAddress(evmAddress);
}

function resolveBonzoSpenderAddress(contractId: ContractId) {
  const configured = readStringEnv("VITE_BONZO_LENDING_POOL_EVM_ADDRESS") || readStringEnv("BONZO_LENDING_POOL_EVM_ADDRESS");
  if (configured) {
    return configured.startsWith("0x") ? configured : `0x${configured}`;
  }
  return `0x${contractId.toSolidityAddress()}`;
}

function estimateWhbarAmount(input: {
  session: WorkflowResult;
  targetAllocationUsd: number;
  fallbackAssetPriceUsd: number;
}) {
  const hbarPriceUsd =
    input.session.treasury.portfolio.positions.find((position) => position.symbol === "HBAR")?.priceUsd ??
    input.fallbackAssetPriceUsd;
  return Math.max(1, Math.floor((input.targetAllocationUsd / hbarPriceUsd) * 100_000_000));
}

function readStringEnv(name: string) {
  const viteEnv = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
  return viteEnv?.[name]?.trim() || "";
}

function readPositiveIntEnv(name: string, fallback: number) {
  const raw = readStringEnv(name);
  if (!raw) {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function readPositiveFloatEnv(name: string, fallback: number) {
  const raw = readStringEnv(name);
  if (!raw) {
    return fallback;
  }
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function readJsonRecordEnv(name: string, fallback: Record<string, string>) {
  const raw = readStringEnv(name);
  if (!raw) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed)
        .filter((entry): entry is [string, string] => typeof entry[1] === "string")
        .map(([key, value]) => [key.toUpperCase(), value]),
    );
  } catch {
    return fallback;
  }
}

function maxSpendableTradeTinybars(availableTinybars: number) {
  const feeReserveTinybars = 2 * 100_000_000;
  return Math.max(
    0,
    Math.min(
      availableTinybars - 5_000_000 - feeReserveTinybars,
      Math.floor(availableTinybars * 0.8) - feeReserveTinybars,
    ),
  );
}

function contractIdFromEvmAddress(address: string) {
  const normalized = address.startsWith("0x") ? address.slice(2) : address;
  return ContractId.fromEvmAddress(0, 0, normalized);
}

function encodeErc20ApproveCall(spender: string, amount: number | bigint) {
  return encodeFunctionCall("095ea7b3", [encodeAddressWord(spender), encodeUintWord(amount)]);
}

function encodeBonzoDepositCall(assetAddress: string, amount: number | bigint, onBehalfOf: string) {
  return encodeFunctionCall("e8eda9df", [
    encodeAddressWord(assetAddress),
    encodeUintWord(amount),
    encodeAddressWord(onBehalfOf),
    encodeUintWord(0),
  ]);
}

function encodeFunctionCall(selector: string, words: string[]) {
  return new Uint8Array(Buffer.from(`${selector}${words.join("")}`, "hex"));
}

function encodeAddressWord(address: string) {
  const normalized = address.startsWith("0x") ? address.slice(2) : address;
  if (normalized.length !== 40) {
    throw new Error(`Expected 20-byte EVM address, received ${address}.`);
  }
  return normalized.padStart(64, "0");
}

function encodeUintWord(value: number | bigint) {
  const numeric = typeof value === "bigint" ? value : BigInt(value);
  if (numeric < 0) {
    throw new Error(`Cannot ABI-encode negative integer ${value}.`);
  }
  return numeric.toString(16).padStart(64, "0");
}

function hashscanUrl(network: string, transactionId: string) {
  const segment = network === "mainnet" ? "mainnet" : "testnet";
  return `https://hashscan.io/${segment}/transaction/${transactionId}`;
}

function asAccountBalance(value: unknown): AccountBalanceLike {
  return value as AccountBalanceLike;
}

function getTokenBalances(balance: AccountBalanceLike): Iterable<TokenBalanceEntryLike> {
  return balance.tokens ?? [];
}
