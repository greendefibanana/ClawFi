import { afterEach, describe, expect, it } from "vitest";
import { createLiveExecutionAdapterFromEnv } from "../server/liveExecution";

describe("createLiveExecutionAdapterFromEnv", () => {
  afterEach(() => {
    delete process.env.BONZO_LENDING_POOL_EVM_ADDRESS;
    delete process.env.BONZO_WETH_GATEWAY_EVM_ADDRESS;
    delete process.env.CLAWFI_TREASURY_ACCOUNT_ID;
    delete process.env.CLAWFI_TREASURY_EVM_ADDRESS;
    delete process.env.CLAWFI_TREASURY_KEY;
    delete process.env.HEDERA_OPERATOR_ID;
    delete process.env.HEDERA_OPERATOR_KEY;
    delete process.env.HEDERA_NETWORK;
  });

  it("returns null in simulated mode", () => {
    process.env.HEDERA_OPERATOR_ID = "0.0.1001";
    process.env.HEDERA_OPERATOR_KEY = "302e020100300506032b657004220420aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const adapter = createLiveExecutionAdapterFromEnv("simulated");
    expect(adapter).toBeNull();
  });

  it("returns null when real mode credentials are missing", () => {
    const adapter = createLiveExecutionAdapterFromEnv("real_scaffolded");
    expect(adapter).toBeNull();
  });

  it("creates adapter when real mode credentials are present", () => {
    process.env.HEDERA_OPERATOR_ID = "0.0.1001";
    process.env.HEDERA_OPERATOR_KEY = "302e020100300506032b657004220420aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    process.env.HEDERA_NETWORK = "testnet";
    const adapter = createLiveExecutionAdapterFromEnv("real_scaffolded");
    expect(adapter).not.toBeNull();
  });

  it("prefers treasury credentials and current Bonzo testnet defaults", () => {
    process.env.HEDERA_OPERATOR_ID = "0.0.1001";
    process.env.HEDERA_OPERATOR_KEY = "operator-key";
    process.env.CLAWFI_TREASURY_ACCOUNT_ID = "0.0.2002";
    process.env.CLAWFI_TREASURY_KEY = "treasury-key";
    process.env.CLAWFI_TREASURY_EVM_ADDRESS = "0x00000000000000000000000000000000000007d2";
    process.env.HEDERA_NETWORK = "testnet";

    const adapter = createLiveExecutionAdapterFromEnv("real_scaffolded") as unknown as {
      config: {
        operatorId: string;
        operatorKey: string;
        operatorEvmAddress?: string;
        bonzoLendingPoolEvmAddress?: string;
        bonzoWethGatewayEvmAddress?: string;
      };
    };

    expect(adapter.config.operatorId).toBe("0.0.2002");
    expect(adapter.config.operatorKey).toBe("treasury-key");
    expect(adapter.config.operatorEvmAddress).toBe("0x00000000000000000000000000000000000007d2");
    expect(adapter.config.bonzoLendingPoolEvmAddress).toBe("0x7710a96b01e02eD00768C3b39BfA7B4f1c128c62");
    expect(adapter.config.bonzoWethGatewayEvmAddress).toBe("0xA824820e35D6AE4D368153e83b7920B2DC3Cf964");
  });

  it("respects explicit Bonzo contract overrides", () => {
    process.env.HEDERA_OPERATOR_ID = "0.0.1001";
    process.env.HEDERA_OPERATOR_KEY = "operator-key";
    process.env.HEDERA_NETWORK = "testnet";
    process.env.BONZO_LENDING_POOL_EVM_ADDRESS = "0x1111111111111111111111111111111111111111";
    process.env.BONZO_WETH_GATEWAY_EVM_ADDRESS = "0x2222222222222222222222222222222222222222";

    const adapter = createLiveExecutionAdapterFromEnv("real_scaffolded") as unknown as {
      config: {
        bonzoLendingPoolEvmAddress?: string;
        bonzoWethGatewayEvmAddress?: string;
      };
    };

    expect(adapter.config.bonzoLendingPoolEvmAddress).toBe("0x1111111111111111111111111111111111111111");
    expect(adapter.config.bonzoWethGatewayEvmAddress).toBe("0x2222222222222222222222222222222222222222");
  });
});
