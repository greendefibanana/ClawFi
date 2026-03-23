import {
  AccountBalanceQuery,
  AccountId,
  AccountInfoQuery,
  Client,
  ContractCallQuery,
  ContractExecuteTransaction,
  ContractId,
  ContractFunctionParameters,
  Hbar,
  Status,
  TokenAssociateTransaction,
  TokenId,
} from "@hashgraph/sdk";
import type { PlannedAction, StrategyConfig, Treasury } from "../src/core/models/schemas";
import { parseTreasuryPrivateKey } from "../src/hedera/operatorKey";
import { readTreasuryAccountId, readTreasuryEvmAddress, readTreasuryKey } from "../src/hedera/runtimeConfig";

const DEFAULT_SAUCERSWAP_ROUTER_CONTRACT_ID = "0.0.19264";
const DEFAULT_SAUCERSWAP_WHBAR_TOKEN_ID = "0.0.15058";
const DEFAULT_BONZO_TESTNET_LENDING_POOL_EVM_ADDRESS = "0x7710a96b01e02eD00768C3b39BfA7B4f1c128c62";
const DEFAULT_BONZO_MAINNET_LENDING_POOL_EVM_ADDRESS = "0x236897c518996163E7b313aD21D1C9fCC7BA1afc";
const DEFAULT_BONZO_TESTNET_WETH_GATEWAY_EVM_ADDRESS = "0xA824820e35D6AE4D368153e83b7920B2DC3Cf964";
const DEFAULT_BONZO_MAINNET_WETH_GATEWAY_EVM_ADDRESS = "0x9a601543e9264255BebB20Cef0E7924e97127105";
const DEFAULT_TRADE_CONTRACT_EXECUTE_MAX_FEE_HBAR = 2;
const DEFAULT_DEFI_CONTRACT_EXECUTE_MAX_FEE_HBAR = 4;
const DEFAULT_TOKEN_ADMIN_MAX_FEE_HBAR = 1;
const DEFAULT_QUERY_PAYMENT_HBAR = 1;
const DEFAULT_CLIENT_REQUEST_TIMEOUT_MS = 30_000;
const DEFAULT_CLIENT_GRPC_DEADLINE_MS = 15_000;
const DEFAULT_CLIENT_MAX_ATTEMPTS = 2;

export type ActionExecutionOutcome = {
  actionId: string;
  actionTitle: string;
  actionType: PlannedAction["actionType"];
  status: "executed" | "skipped" | "failed";
  venue: string;
  mode: "simulated" | "real_scaffolded";
  detail: string;
  transactionId?: string;
  explorerUrl?: string;
  quotedAmountOut?: string;
};

type HederaExecutionConfig = {
  network: "testnet" | "mainnet";
  mirrorNodeBaseUrl: string;
  operatorId: string;
  operatorKey: string;
  operatorEvmAddress?: string;
  enableLiveTrading: boolean;
  enableLiveDefi: boolean;
  saucerRouterContractId: string;
  saucerWhbarTokenId: string;
  saucerTradeGas: number;
  symbolTokenMap: Record<string, string>;
  symbolDecimalsMap: Record<string, number>;
  bonzoLendingPoolContractId?: string;
  bonzoLendingPoolEvmAddress?: string;
  bonzoWethGatewayEvmAddress?: string;
  bonzoAssetTokenId?: string;
  bonzoAssetDecimals: number;
  bonzoAssetPriceUsd: number;
  bonzoDepositGas: number;
};

export function createLiveExecutionAdapterFromEnv(mode: Treasury["mode"]) {
  if (mode !== "real_scaffolded") {
    return null;
  }
  const operatorId = readTreasuryAccountId();
  const operatorKey = readTreasuryKey();
  if (!operatorId || !operatorKey) {
    return null;
  }

  const network = process.env.HEDERA_NETWORK === "mainnet" ? "mainnet" : "testnet";
  const mirrorNodeBaseUrl =
    process.env.HEDERA_MIRROR_NODE_URL ??
    (network === "mainnet" ? "https://mainnet-public.mirrornode.hedera.com" : "https://testnet.mirrornode.hedera.com");

  return new HederaLiveExecutionAdapter({
    network,
    mirrorNodeBaseUrl,
    operatorId,
    operatorKey,
    operatorEvmAddress: readTreasuryEvmAddress(),
    enableLiveTrading: process.env.CLAWFI_ENABLE_LIVE_TRADING === "true",
    enableLiveDefi: process.env.CLAWFI_ENABLE_LIVE_DEFI === "true",
    saucerRouterContractId: process.env.SAUCERSWAP_ROUTER_CONTRACT_ID ?? DEFAULT_SAUCERSWAP_ROUTER_CONTRACT_ID,
    saucerWhbarTokenId: process.env.SAUCERSWAP_WHBAR_TOKEN_ID ?? DEFAULT_SAUCERSWAP_WHBAR_TOKEN_ID,
    saucerTradeGas: parsePositiveInt(process.env.SAUCERSWAP_TRADE_GAS, 1_500_000),
    symbolTokenMap: parseJsonRecord(process.env.SAUCERSWAP_SYMBOL_TOKEN_MAP_JSON, {
      SAUCE: "0.0.1183558",
    }),
    symbolDecimalsMap: parseJsonNumberRecord(process.env.SAUCERSWAP_SYMBOL_DECIMALS_JSON, {
      SAUCE: 6,
      HBAR: 8,
      WHBAR: 8,
    }),
    bonzoLendingPoolContractId: process.env.BONZO_LENDING_POOL_CONTRACT_ID,
    bonzoLendingPoolEvmAddress:
      process.env.BONZO_LENDING_POOL_EVM_ADDRESS ??
      (network === "mainnet"
        ? DEFAULT_BONZO_MAINNET_LENDING_POOL_EVM_ADDRESS
        : DEFAULT_BONZO_TESTNET_LENDING_POOL_EVM_ADDRESS),
    bonzoWethGatewayEvmAddress:
      process.env.BONZO_WETH_GATEWAY_EVM_ADDRESS ??
      (network === "mainnet"
        ? DEFAULT_BONZO_MAINNET_WETH_GATEWAY_EVM_ADDRESS
        : DEFAULT_BONZO_TESTNET_WETH_GATEWAY_EVM_ADDRESS),
    bonzoAssetTokenId: process.env.BONZO_DEFI_ASSET_TOKEN_ID,
    bonzoAssetDecimals: parsePositiveInt(process.env.BONZO_DEFI_ASSET_DECIMALS, 6),
    bonzoAssetPriceUsd: parsePositiveFloat(process.env.BONZO_DEFI_ASSET_PRICE_USD, 1),
    bonzoDepositGas: parsePositiveInt(process.env.BONZO_DEFI_GAS, 1_500_000),
  });
}

export class HederaLiveExecutionAdapter {
  constructor(private readonly config: HederaExecutionConfig) {}

  async executeAction(input: {
    action: PlannedAction;
    treasury: Treasury;
    strategyConfig: StrategyConfig;
  }): Promise<ActionExecutionOutcome> {
    if (input.strategyConfig.simulateOnly) {
      return this.simulatedOutcome(input.action, "Strategy is simulate-only; live action execution is disabled.");
    }

    if (input.action.actionType === "buy_token") {
      return this.executeTokenTrade(input);
    }

    if (input.action.actionType === "allocate_defi") {
      return this.executeDefiAllocation(input);
    }

    return this.simulatedOutcome(input.action, "Action type is not mapped to a live execution connector.");
  }

  private async executeTokenTrade(input: {
    action: PlannedAction;
    treasury: Treasury;
    strategyConfig: StrategyConfig;
  }): Promise<ActionExecutionOutcome> {
    const client = this.createClient();
    try {
      if (!this.config.enableLiveTrading) {
        return this.simulatedOutcome(input.action, "Live trading connector is disabled by CLAWFI_ENABLE_LIVE_TRADING.");
      }

      const tokenOutId = this.config.symbolTokenMap[input.action.assetSymbol];
      if (!tokenOutId) {
        return this.failedOutcome(input.action, `No token mapping configured for symbol ${input.action.assetSymbol}.`);
      }

      const hbarPriceUsd = input.treasury.portfolio.positions.find((position) => position.symbol === "HBAR")?.priceUsd ?? 0.11;
      if (hbarPriceUsd <= 0) {
        return this.failedOutcome(input.action, "Cannot derive HBAR USD reference price from treasury state.");
      }

      const desiredAmountInTinybar = Math.max(1, Math.floor((input.action.targetAllocationUsd / hbarPriceUsd) * 100_000_000));
      const spendableTinybar = maxSpendableTradeTinybars(await this.readAvailableHbarTinybars(client));
      if (spendableTinybar <= 0) {
        return this.failedOutcome(input.action, "Insufficient HBAR balance after reserving operational fees for live execution.");
      }

      const amountInTinybar = Math.min(desiredAmountInTinybar, spendableTinybar);
      const routerContractId = ContractId.fromString(this.config.saucerRouterContractId);
      const whbarAddress = TokenId.fromString(this.config.saucerWhbarTokenId).toSolidityAddress();
      const tokenOutAddress = TokenId.fromString(tokenOutId).toSolidityAddress();

      try {
        await this.associateTokenSafe(client, tokenOutId);
      } catch (error) {
        throw new Error(`Token association step failed: ${formatExecutionError(error)}`);
      }
      const quoteAmountOut = await this.quoteAmountOut(client, routerContractId, amountInTinybar, [whbarAddress, tokenOutAddress]);
      if (quoteAmountOut <= 0) {
        return this.failedOutcome(input.action, "Quote returned zero output for configured swap path.");
      }

      const minOut = Math.floor(quoteAmountOut * ((10_000 - input.strategyConfig.maxSlippageBps) / 10_000));
      const deadlineEpoch = Math.floor(Date.now() / 1000) + 900;
      const params = new ContractFunctionParameters()
        .addUint256(minOut)
        .addAddressArray([whbarAddress, tokenOutAddress])
        .addAddress(this.resolveOperatorSolidityAddress())
        .addUint256(deadlineEpoch);

      const response = await withRetry(
        async () =>
          new ContractExecuteTransaction()
            .setContractId(routerContractId)
            .setMaxTransactionFee(tradeContractExecuteMaxFee())
            .setGas(this.config.saucerTradeGas)
            .setFunction("swapExactETHForTokens", params)
            .setPayableAmount(Hbar.fromTinybars(amountInTinybar))
            .execute(client),
        2,
      );
      const receipt = await response.getReceipt(client);
      if (receipt.status !== Status.Success) {
        return this.failedOutcome(input.action, `Swap transaction failed with status ${receipt.status.toString()}.`);
      }

      return {
        actionId: input.action.id,
        actionTitle: input.action.title,
        actionType: input.action.actionType,
        status: "executed",
        venue: input.action.venue,
        mode: "real_scaffolded",
        detail: `Executed SaucerSwap HBAR->${input.action.assetSymbol} swap.`,
        transactionId: response.transactionId.toString(),
        explorerUrl: hashscanUrl(this.config.network, response.transactionId.toString()),
        quotedAmountOut: String(quoteAmountOut),
      };
    } catch (error) {
      return this.failedOutcome(input.action, formatExecutionError(error));
    } finally {
      client.close();
    }
  }

  private async executeDefiAllocation(input: {
    action: PlannedAction;
    treasury: Treasury;
    strategyConfig: StrategyConfig;
  }): Promise<ActionExecutionOutcome> {
    const client = this.createClient();
    try {
      if (!this.config.enableLiveDefi) {
        return this.simulatedOutcome(input.action, "Live DeFi connector is disabled by CLAWFI_ENABLE_LIVE_DEFI.");
      }
      if (!this.config.bonzoAssetTokenId) {
        return this.failedOutcome(input.action, "BONZO_DEFI_ASSET_TOKEN_ID must be configured for live DeFi allocation.");
      }

      const contractId = await this.resolveBonzoLendingPoolContractId();
      if (!contractId) {
        return this.failedOutcome(input.action, "Could not resolve Bonzo lending pool contract ID from environment configuration.");
      }

      let depositAmountOverride: number | undefined;
      if (this.config.bonzoAssetTokenId === this.config.saucerWhbarTokenId) {
        depositAmountOverride = this.estimateWhbarAmountFromTreasury(input.treasury, input.action.targetAllocationUsd);
        await this.wrapHbarToWhbar(client, depositAmountOverride);
      }

      const tx = await this.executeBonzoTokenAllocation({
        client,
        contractId,
        targetAllocationUsd: input.action.targetAllocationUsd,
        depositAmountOverride,
      });

      return {
        actionId: input.action.id,
        actionTitle: input.action.title,
        actionType: input.action.actionType,
        status: "executed",
        venue: input.action.venue,
        mode: "real_scaffolded",
        detail: `Executed Bonzo deposit for ${input.action.assetSymbol}.`,
        transactionId: tx,
        explorerUrl: hashscanUrl(this.config.network, tx),
      };
    } catch (error) {
      return this.failedOutcome(input.action, formatExecutionError(error));
    } finally {
      client.close();
    }
  }

  private createClient() {
    const client = this.config.network === "mainnet" ? Client.forMainnet() : Client.forTestnet();
    client.setRequestTimeout(DEFAULT_CLIENT_REQUEST_TIMEOUT_MS);
    client.setGrpcDeadline(DEFAULT_CLIENT_GRPC_DEADLINE_MS);
    client.setMaxAttempts(DEFAULT_CLIENT_MAX_ATTEMPTS);
    client.setAllowReceiptNodeFailover(true);
    client.setOperator(AccountId.fromString(this.config.operatorId), parseTreasuryPrivateKey(this.config.operatorKey));
    return client;
  }

  private resolveOperatorSolidityAddress() {
    const evmAddress = this.config.operatorEvmAddress?.trim();
    if (evmAddress) {
      return evmAddress.startsWith("0x") ? evmAddress : `0x${evmAddress}`;
    }
    return this.resolveOperatorAccountSolidityAddress();
  }

  private resolveOperatorAccountSolidityAddress() {
    return AccountId.fromString(this.config.operatorId).toSolidityAddress();
  }

  private async resolveBonzoOperatorAddress(client: Client): Promise<string> {
    try {
      const info = await new AccountInfoQuery()
        .setAccountId(AccountId.fromString(this.config.operatorId))
        .execute(client);
      const evmAddress = readAccountInfoEvmAddress(info)?.trim();
      if (evmAddress && evmAddress !== "0x0000000000000000000000000000000000000000") {
        return evmAddress.startsWith("0x") ? evmAddress : `0x${evmAddress}`;
      }
    } catch {
      // Fall back to the configured operator address when account info lookup fails.
    }
    return this.resolveOperatorSolidityAddress();
  }

  private async quoteAmountOut(client: Client, routerContractId: ContractId, amountIn: number, path: string[]) {
    const result = await new ContractCallQuery()
      .setContractId(routerContractId)
      .setGas(500_000)
      .setQueryPayment(queryPayment())
      .setFunction(
        "getAmountsOut",
        new ContractFunctionParameters().addUint256(amountIn).addAddressArray(path),
      )
      .execute(client);
    const decodedResult = result.getResult(["uint256[]"]) as unknown;
    if (!isUnknownArray(decodedResult) || decodedResult.length === 0) {
      return 0;
    }
    const first = decodedResult[0];
    if (!Array.isArray(first) || first.length === 0) {
      return 0;
    }
    return toSafeNumber(first[first.length - 1]);
  }

  private async executeBonzoDeposit(
    client: Client,
    contractId: ContractId,
    assetAddress: string,
    onBehalfOf: string,
    amount: number,
  ) {
    const depositTx = await withRetry(
      async () =>
        new ContractExecuteTransaction()
          .setContractId(contractId)
          .setMaxTransactionFee(defiContractExecuteMaxFee())
          .setGas(this.config.bonzoDepositGas)
          .setFunctionParameters(encodeBonzoDepositCall(assetAddress, amount, onBehalfOf))
          .execute(client),
      2,
    );
    const depositReceipt = await depositTx.getReceipt(client);
    if (depositReceipt.status !== Status.Success) {
      throw new Error(`Bonzo deposit failed with status ${depositReceipt.status.toString()}.`);
    }
    return depositTx.transactionId.toString();
  }

  private async executeBonzoTokenAllocation(input: {
    client: Client;
    contractId: ContractId;
    targetAllocationUsd: number;
    depositAmountOverride?: number;
  }) {
    const desiredDepositAmount =
      input.depositAmountOverride ??
      Math.max(
        1,
        Math.floor((input.targetAllocationUsd / this.config.bonzoAssetPriceUsd) * 10 ** this.config.bonzoAssetDecimals),
      );
    const tokenId = TokenId.fromString(this.config.bonzoAssetTokenId!);
    try {
      await this.associateTokenSafe(input.client, this.config.bonzoAssetTokenId!);
    } catch (error) {
      throw new Error(`Token association step failed: ${formatExecutionError(error)}`);
    }
    const availableBalance = await this.readAvailableTokenUnits(input.client, tokenId);
    const depositAmount = Math.min(desiredDepositAmount, availableBalance);
    if (depositAmount <= 0) {
      throw new Error(`No available balance for Bonzo asset ${this.config.bonzoAssetTokenId}.`);
    }
    try {
      await this.approveTokenSpender(
        input.client,
        tokenId,
        this.resolveBonzoSpenderAddress(input.contractId),
        depositAmount,
      );
    } catch (error) {
      throw new Error(`Allowance approval step failed: ${formatExecutionError(error)}`);
    }

    const assetAddress = tokenId.toSolidityAddress();
    const onBehalfOf = await this.resolveBonzoOperatorAddress(input.client);
    try {
      return await this.executeBonzoDeposit(input.client, input.contractId, assetAddress, onBehalfOf, depositAmount);
    } catch (error) {
      throw new Error(`Bonzo supply step failed: ${formatExecutionError(error)}`);
    }
  }

  private estimateWhbarAmountFromTreasury(treasury: Treasury, targetAllocationUsd: number) {
    const hbarPriceUsd =
      treasury.portfolio.positions.find((position) => position.symbol === "HBAR")?.priceUsd ??
      this.config.bonzoAssetPriceUsd;
    return Math.max(1, Math.floor((targetAllocationUsd / hbarPriceUsd) * 100_000_000));
  }

  private async wrapHbarToWhbar(client: Client, amountInTinybar: number) {
    if (!this.config.bonzoAssetTokenId) {
      throw new Error("BONZO_DEFI_ASSET_TOKEN_ID must be configured before wrapping HBAR.");
    }

    await this.associateTokenSafe(client, this.config.bonzoAssetTokenId);

    const whbarContractId = contractIdFromEvmAddress(TokenId.fromString(this.config.bonzoAssetTokenId).toSolidityAddress());
    const tx = await withRetry(
      async () =>
        new ContractExecuteTransaction()
          .setContractId(whbarContractId)
          .setMaxTransactionFee(defiContractExecuteMaxFee())
          .setGas(300_000)
          .setFunction("deposit", new ContractFunctionParameters())
          .setPayableAmount(Hbar.fromTinybars(amountInTinybar))
          .execute(client),
      2,
    );
    const receipt = await tx.getReceipt(client);
    if (receipt.status !== Status.Success) {
      throw new Error(`WHBAR wrap failed with status ${receipt.status.toString()}.`);
    }
  }

  private async readAvailableTokenUnits(client: Client, tokenId: TokenId): Promise<number> {
    const balance = await new AccountBalanceQuery()
      .setAccountId(AccountId.fromString(this.config.operatorId))
      .execute(client);

    for (const [ownedTokenId, amount] of balance.tokens) {
      if (ownedTokenId.toString() === tokenId.toString()) {
        return toSafeNumber(amount);
      }
    }
    return 0;
  }

  private async readAvailableHbarTinybars(client: Client): Promise<number> {
    const balance = await new AccountBalanceQuery()
      .setAccountId(AccountId.fromString(this.config.operatorId))
      .execute(client);
    return toSafeNumber(balance.hbars.toTinybars());
  }

  private async approveTokenSpender(
    client: Client,
    tokenId: TokenId,
    spenderEvmAddress: string,
    amount: number,
  ) {
    const allowanceTx = await new ContractExecuteTransaction()
      .setContractId(contractIdFromEvmAddress(tokenId.toSolidityAddress()))
      .setMaxTransactionFee(tokenAdminMaxFee())
      .setGas(1_000_000)
      .setFunctionParameters(encodeErc20ApproveCall(spenderEvmAddress, amount))
      .execute(client);
    const allowanceReceipt = await allowanceTx.getReceipt(client);
    if (allowanceReceipt.status !== Status.Success) {
      throw new Error(`Allowance approval failed with status ${allowanceReceipt.status.toString()}.`);
    }
  }

  private async associateTokenSafe(client: Client, tokenId: string) {
    if (await this.hasTokenRelationship(client, TokenId.fromString(tokenId))) {
      return;
    }
    try {
      const associationTx = await new TokenAssociateTransaction()
        .setAccountId(AccountId.fromString(this.config.operatorId))
        .setTokenIds([TokenId.fromString(tokenId)])
        .setMaxTransactionFee(tokenAdminMaxFee())
        .execute(client);
      const associationReceipt = await associationTx.getReceipt(client);
      if (associationReceipt.status !== Status.Success && associationReceipt.status.toString() !== "TOKEN_ALREADY_ASSOCIATED_TO_ACCOUNT") {
        throw new Error(`Token association failed with status ${associationReceipt.status.toString()}.`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes("TOKEN_ALREADY_ASSOCIATED_TO_ACCOUNT")) {
        throw error;
      }
    }
  }

  private async resolveBonzoLendingPoolContractId() {
    if (this.config.bonzoLendingPoolContractId) {
      return ContractId.fromString(this.config.bonzoLendingPoolContractId);
    }
    if (!this.config.bonzoLendingPoolEvmAddress) {
      return null;
    }
    const normalized = this.config.bonzoLendingPoolEvmAddress.startsWith("0x")
      ? this.config.bonzoLendingPoolEvmAddress.slice(2)
      : this.config.bonzoLendingPoolEvmAddress;
    const response = await fetch(`${this.config.mirrorNodeBaseUrl}/api/v1/contracts/${normalized}`, {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      return null;
    }
    const payload = (await response.json()) as { contract_id?: string };
    return payload.contract_id ? ContractId.fromString(payload.contract_id) : null;
  }

  private resolveBonzoSpenderAddress(contractId: ContractId) {
    const configured = this.config.bonzoLendingPoolEvmAddress?.trim();
    if (configured) {
      return configured.startsWith("0x") ? configured : `0x${configured}`;
    }
    return `0x${contractId.toSolidityAddress()}`;
  }

  private async hasTokenRelationship(client: Client, tokenId: TokenId) {
    const balance = await new AccountBalanceQuery()
      .setAccountId(AccountId.fromString(this.config.operatorId))
      .execute(client);

    for (const [ownedTokenId] of balance.tokens) {
      if (ownedTokenId.toString() === tokenId.toString()) {
        return true;
      }
    }
    return false;
  }

  private simulatedOutcome(action: PlannedAction, detail: string): ActionExecutionOutcome {
    return {
      actionId: action.id,
      actionTitle: action.title,
      actionType: action.actionType,
      status: "skipped",
      venue: action.venue,
      mode: "simulated",
      detail,
    };
  }

  private failedOutcome(action: PlannedAction, detail: string): ActionExecutionOutcome {
    return {
      actionId: action.id,
      actionTitle: action.title,
      actionType: action.actionType,
      status: "failed",
      venue: action.venue,
      mode: "real_scaffolded",
      detail,
    };
  }
}

function parseJsonRecord(raw: string | undefined, fallback: Record<string, string>) {
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

function parseJsonNumberRecord(raw: string | undefined, fallback: Record<string, number>) {
  if (!raw) {
    return fallback;
  }
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed)
        .filter((entry): entry is [string, number] => typeof entry[1] === "number")
        .map(([key, value]) => [key.toUpperCase(), value]),
    );
  } catch {
    return fallback;
  }
}

function parsePositiveInt(raw: string | undefined, fallback: number) {
  if (!raw) {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parsePositiveFloat(raw: string | undefined, fallback: number) {
  if (!raw) {
    return fallback;
  }
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function toSafeNumber(value: unknown) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof value === "bigint") {
    return Number(value);
  }
  if (hasToNumber(value)) {
    const parsed = value.toNumber();
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function hashscanUrl(network: "testnet" | "mainnet", transactionId: string) {
  const segment = network === "mainnet" ? "mainnet" : "testnet";
  return `https://hashscan.io/${segment}/transaction/${transactionId}`;
}

async function withRetry<T>(operation: () => Promise<T>, attempts: number): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (i < attempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }
  }
  throw lastError;
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
  return Buffer.from(`${selector}${words.join("")}`, "hex");
}

function encodeAddressWord(address: string) {
  const normalized = stripHexPrefix(address);
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

function stripHexPrefix(value: string) {
  return value.startsWith("0x") ? value.slice(2) : value;
}

function readAccountInfoEvmAddress(info: unknown) {
  if (!info || typeof info !== "object" || !("evmAddress" in info)) {
    return null;
  }
  const evmAddress = (info as { evmAddress?: unknown }).evmAddress;
  return typeof evmAddress === "string" ? evmAddress : null;
}

function minimumOperationalHbarReserveTinybars() {
  return 5_000_000;
}

function maxLiveTradeSpendRatio() {
  return 0.8;
}

function maxSpendableTradeTinybars(availableTinybars: number) {
  return Math.max(
    0,
    Math.min(
      availableTinybars - minimumOperationalHbarReserveTinybars() - toSafeNumber(tradeContractExecuteMaxFee().toTinybars()),
      Math.floor(availableTinybars * maxLiveTradeSpendRatio()) - toSafeNumber(tradeContractExecuteMaxFee().toTinybars()),
    ),
  );
}

function formatExecutionError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function tradeContractExecuteMaxFee() {
  return new Hbar(DEFAULT_TRADE_CONTRACT_EXECUTE_MAX_FEE_HBAR);
}

function defiContractExecuteMaxFee() {
  return new Hbar(DEFAULT_DEFI_CONTRACT_EXECUTE_MAX_FEE_HBAR);
}

function tokenAdminMaxFee() {
  return new Hbar(DEFAULT_TOKEN_ADMIN_MAX_FEE_HBAR);
}

function queryPayment() {
  return new Hbar(DEFAULT_QUERY_PAYMENT_HBAR);
}

function hasToNumber(value: unknown): value is { toNumber: () => number } {
  return Boolean(
    value &&
      typeof value === "object" &&
      "toNumber" in value &&
      typeof (value as { toNumber?: unknown }).toNumber === "function",
  );
}

function isUnknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}
