import {
  AccountId,
  ContractExecuteTransaction,
  ContractId,
  ContractFunctionParameters,
  Hbar,
  TokenId,
} from "@hashgraph/sdk";
import type { ExecutionPreview, StrategyConfig, Treasury } from "../domain/schemas";
import { readOptionalEnv, readTreasuryAccountId, readTreasuryEvmAddress } from "../hedera/runtimeConfig";
import type { ExecutionSimulatorProvider } from "./interfaces";

const DEFAULT_SAUCERSWAP_ROUTER_CONTRACT_ID = "0.0.19264";
const DEFAULT_SAUCERSWAP_WHBAR_TOKEN_ID = "0.0.15058";
const DEFAULT_BONZO_TESTNET_LENDING_POOL_EVM_ADDRESS = "0x7710a96b01e02eD00768C3b39BfA7B4f1c128c62";
const DEFAULT_BONZO_MAINNET_LENDING_POOL_EVM_ADDRESS = "0x236897c518996163E7b313aD21D1C9fCC7BA1afc";
const DEFAULT_BONZO_TESTNET_WETH_GATEWAY_EVM_ADDRESS = "0xA824820e35D6AE4D368153e83b7920B2DC3Cf964";
const DEFAULT_BONZO_MAINNET_WETH_GATEWAY_EVM_ADDRESS = "0x9a601543e9264255BebB20Cef0E7924e97127105";

export class RealExecutionProvider implements ExecutionSimulatorProvider {
  private config: {
    network: "testnet" | "mainnet";
    treasuryAccountId: string;
    treasuryEvmAddress?: string;
    saucerRouterContractId: string;
    saucerWhbarTokenId: string;
    saucerTradeGas: number;
    symbolTokenMap: Record<string, string>;
    bonzoLendingPoolContractId?: string;
    bonzoLendingPoolEvmAddress?: string;
    bonzoWethGatewayEvmAddress?: string;
    bonzoAssetTokenId?: string;
    bonzoAssetDecimals: number;
    bonzoAssetPriceUsd: number;
    bonzoDepositGas: number;
  };

  constructor(config?: Partial<RealExecutionProvider["config"]>) {
    const network = process.env.HEDERA_NETWORK === "mainnet" ? "mainnet" : "testnet";
    this.config = {
      network,
      treasuryAccountId: readTreasuryAccountId() ?? process.env.HEDERA_OPERATOR_ID ?? "0.0.1001",
      treasuryEvmAddress: readTreasuryEvmAddress(),
      saucerRouterContractId: process.env.SAUCERSWAP_ROUTER_CONTRACT_ID ?? DEFAULT_SAUCERSWAP_ROUTER_CONTRACT_ID,
      saucerWhbarTokenId: process.env.SAUCERSWAP_WHBAR_TOKEN_ID ?? DEFAULT_SAUCERSWAP_WHBAR_TOKEN_ID,
      saucerTradeGas: parsePositiveInt(process.env.SAUCERSWAP_TRADE_GAS, 1_500_000),
      symbolTokenMap: {
        SAUCE: "0.0.1183558", // Testnet SAUCE
        DOVU: "0.0.3716059", // Testnet DOVU
        ...config?.symbolTokenMap,
      },
      bonzoLendingPoolContractId: readOptionalEnv("BONZO_LENDING_POOL_CONTRACT_ID"),
      bonzoLendingPoolEvmAddress:
        readOptionalEnv("BONZO_LENDING_POOL_EVM_ADDRESS") ??
        (network === "mainnet"
          ? DEFAULT_BONZO_MAINNET_LENDING_POOL_EVM_ADDRESS
          : DEFAULT_BONZO_TESTNET_LENDING_POOL_EVM_ADDRESS),
      bonzoWethGatewayEvmAddress:
        readOptionalEnv("BONZO_WETH_GATEWAY_EVM_ADDRESS") ??
        (network === "mainnet"
          ? DEFAULT_BONZO_MAINNET_WETH_GATEWAY_EVM_ADDRESS
          : DEFAULT_BONZO_TESTNET_WETH_GATEWAY_EVM_ADDRESS),
      bonzoAssetTokenId: readOptionalEnv("BONZO_DEFI_ASSET_TOKEN_ID") ?? "0.0.4355325", // Testnet USDC
      bonzoAssetDecimals: parsePositiveInt(process.env.BONZO_DEFI_ASSET_DECIMALS, 6),
      bonzoAssetPriceUsd: parsePositiveFloat(process.env.BONZO_DEFI_ASSET_PRICE_USD, 1),
      bonzoDepositGas: parsePositiveInt(process.env.BONZO_DEFI_GAS, 1_500_000),
      ...config,
    };
  }

  simulate(input: {
    treasury: Treasury;
    actionPlanActions: Array<{ title: string; amountUsd: number; expectedReturnPercent: number }>;
  }): Promise<{ projectedMonthlyYieldUsd: number; projectedMonthlyPnLRangeUsd: [number, number]; stressScenarioDrawdownUsd: number; liquidityCoveragePercent: number }> {
    // We defer to the standard math simulation for the high-level PnL projections,
    // just like the Mock provider, because real live execution hasn't happened yet.
    let projectedMonthlyYieldUsd = 0;
    input.actionPlanActions.forEach((action) => {
      projectedMonthlyYieldUsd += (action.amountUsd * action.expectedReturnPercent) / 1200;
    });

    const totalAllocatedUsd = input.actionPlanActions.reduce((sum, a) => sum + a.amountUsd, 0);
    const liquidityCoveragePercent = Math.max(
      0,
      ((input.treasury.portfolio.totalValueUsd - totalAllocatedUsd) / input.treasury.portfolio.totalValueUsd) * 100,
    );

    return Promise.resolve({
      projectedMonthlyYieldUsd,
      projectedMonthlyPnLRangeUsd: [
        projectedMonthlyYieldUsd * 0.5,
        projectedMonthlyYieldUsd * 1.5,
      ] as [number, number],
      stressScenarioDrawdownUsd: totalAllocatedUsd * 0.25,
      liquidityCoveragePercent,
    });
  }

  preview(input: {
    actions: Array<{ title: string; amountUsd: number; venue: string; requiresApproval: boolean; actionType: string; assetSymbol: string; }>;
    config: StrategyConfig;
    treasury: Treasury;
  }): Promise<ExecutionPreview> {
    const steps = input.actions.map((action) => {
        let innerTx: ContractExecuteTransaction | undefined = undefined;

        try {
          if (action.actionType === "buy_token") {
             innerTx = this.buildTradeTransaction(action, input.treasury);
          } else if (action.actionType === "allocate_defi") {
             innerTx = this.buildDefiTransaction(action, input.treasury);
          }
        } catch (error) {
           console.warn(`Failed to build live payload for ${action.title}:`, error);
        }

        return {
          id: action.title,
          title: action.title,
          detail: "Live smart contract execution payload built.",
          estimatedCostUsd: 0.05,
          status: "prepared" as const,
          requiresApproval: action.requiresApproval,
          innerTx, // Attach the built ContractExecuteTransaction!
        };
      });

    return Promise.resolve({
      mode: "prepared",
      settlementPath: "Hedera Smart Contract -> ScheduleCreateTransaction",
      estimatedNetworkFeesUsd: steps.length * 0.05,
      estimatedSlippageUsd: 0,
      steps,
    });
  }

  private buildTradeTransaction(action: { assetSymbol: string; amountUsd: number }, treasury: Treasury) {
    const tokenOutId = this.config.symbolTokenMap[action.assetSymbol];
    if (!tokenOutId) throw new Error(`Unknown token mapping for ${action.assetSymbol}`);

    const hbarPriceUsd = treasury.portfolio.positions.find((p) => p.symbol === "HBAR")?.priceUsd ?? 0.11;
    const availableHbarTinybar = Math.max(
      0,
      Math.floor((treasury.portfolio.positions.find((p) => p.symbol === "HBAR")?.quantity ?? 0) * 100_000_000),
    );
    const desiredAmountInTinybar = Math.max(1, Math.floor((action.amountUsd / hbarPriceUsd) * 100_000_000));
    const amountInTinybar = Math.max(1, Math.min(desiredAmountInTinybar, maxSpendableTradeTinybars(availableHbarTinybar)));

    const routerContractId = ContractId.fromString(this.config.saucerRouterContractId);
    const whbarAddress = TokenId.fromString(this.config.saucerWhbarTokenId).toSolidityAddress();
    const tokenOutAddress = TokenId.fromString(tokenOutId).toSolidityAddress();

    // Use a static slippage estimate for the builder so we don't need to do a live query here
    // In a full production app, you'd do a live getAmountsOut query
    const minOut = 1; // 1 lowest denomination to guarantee execution during testing
    const deadlineEpoch = Math.floor(Date.now() / 1000) + 3600; // 1 hour deadline

    const params = new ContractFunctionParameters()
      .addUint256(minOut)
      .addAddressArray([whbarAddress, tokenOutAddress])
      .addAddress(this.resolveTreasurySolidityAddress())
      .addUint256(deadlineEpoch);

    return new ContractExecuteTransaction()
      .setContractId(routerContractId)
      .setGas(this.config.saucerTradeGas)
      .setFunction("swapExactETHForTokens", params)
      .setPayableAmount(Hbar.fromTinybars(amountInTinybar));
  }

  private buildDefiTransaction(action: { amountUsd: number }, treasury: Treasury) {
    if ((!this.config.bonzoLendingPoolContractId && !this.config.bonzoLendingPoolEvmAddress) || !this.config.bonzoAssetTokenId) {
      throw new Error("Bonzo Defi configured incorrectly.");
    }

    const lendingPoolContractId = this.config.bonzoLendingPoolContractId
      ? ContractId.fromString(this.config.bonzoLendingPoolContractId)
      : contractIdFromEvmAddress(this.config.bonzoLendingPoolEvmAddress!);

    if (this.config.bonzoAssetTokenId === this.config.saucerWhbarTokenId) {
      if (!this.config.bonzoWethGatewayEvmAddress) {
        throw new Error("Bonzo WETH gateway is not configured for WHBAR deposits.");
      }
      const hbarPriceUsd =
        treasury.portfolio.positions.find((position) => position.symbol === "HBAR")?.priceUsd ??
        this.config.bonzoAssetPriceUsd;
      const amountInTinybar = Math.max(1, Math.floor((action.amountUsd / hbarPriceUsd) * 100_000_000));
      const params = new ContractFunctionParameters()
        .addAddress(lendingPoolContractId.toSolidityAddress())
        .addAddress(this.resolveTreasurySolidityAddress())
        .addUint16(0);

      return new ContractExecuteTransaction()
        .setContractId(contractIdFromEvmAddress(this.config.bonzoWethGatewayEvmAddress))
        .setGas(this.config.bonzoDepositGas)
        .setFunction("depositETH", params)
        .setPayableAmount(Hbar.fromTinybars(amountInTinybar));
    }

    const depositAmount = Math.max(
      1,
      Math.floor((action.amountUsd / this.config.bonzoAssetPriceUsd) * 10 ** this.config.bonzoAssetDecimals),
    );
    
    const assetAddress = TokenId.fromString(this.config.bonzoAssetTokenId).toSolidityAddress();
    const onBehalfOf = this.resolveTreasuryBonzoAddress();

    return new ContractExecuteTransaction()
      .setContractId(lendingPoolContractId)
      .setGas(this.config.bonzoDepositGas)
      .setFunctionParameters(encodeBonzoDepositCall(assetAddress, depositAmount, onBehalfOf));
  }

  private resolveTreasurySolidityAddress() {
    const evmAddress = this.config.treasuryEvmAddress?.trim();
    if (evmAddress) {
      return evmAddress.startsWith("0x") ? evmAddress : `0x${evmAddress}`;
    }
    return this.resolveTreasuryAccountSolidityAddress();
  }

  private resolveTreasuryBonzoAddress() {
    return this.resolveTreasurySolidityAddress();
  }

  private resolveTreasuryAccountSolidityAddress() {
    return AccountId.fromString(this.config.treasuryAccountId).toSolidityAddress();
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

function minimumOperationalHbarReserveTinybars() {
  return 5_000_000;
}

function maxLiveTradeSpendRatio() {
  return 0.8;
}

function maxSpendableTradeTinybars(availableTinybars: number) {
  const feeReserveTinybars = 2 * 100_000_000;
  return Math.max(
    0,
    Math.min(
      availableTinybars - minimumOperationalHbarReserveTinybars() - feeReserveTinybars,
      Math.floor(availableTinybars * maxLiveTradeSpendRatio()) - feeReserveTinybars,
    ),
  );
}

function contractIdFromEvmAddress(address: string) {
  const normalized = address.startsWith("0x") ? address.slice(2) : address;
  return ContractId.fromEvmAddress(0, 0, normalized);
}
