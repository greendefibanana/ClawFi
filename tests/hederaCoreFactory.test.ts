import { describe, expect, it } from "vitest";
import { createHederaCore } from "../src/hedera/adapters/createHederaCore";
import { RealConsensusAdapter } from "../src/hedera/consensus/realConsensusAdapter";
import { SimulatedConsensusAdapter } from "../src/hedera/consensus/simulatedConsensusAdapter";
import { buildDemoTreasury, demoStrategyConfig } from "../src/data/demoScenario";
import { SimulatedHederaTreasuryAdapter } from "../src/hedera/simulatedHederaAdapter";
import { RealScheduleAdapter } from "../src/hedera/schedule/realScheduleAdapter";
import { SimulatedScheduleAdapter } from "../src/hedera/schedule/simulatedScheduleAdapter";

describe("createHederaCore", () => {
  it("creates simulated adapters in simulated mode", () => {
    const treasuryState = buildDemoTreasury(demoStrategyConfig);
    const treasuryAdapter = new SimulatedHederaTreasuryAdapter(treasuryState.portfolio.positions);

    const core = createHederaCore({
      mode: "simulated",
      treasury: treasuryAdapter,
      treasuryState,
    });

    expect(core.consensus).toBeInstanceOf(SimulatedConsensusAdapter);
    expect(core.schedule).toBeInstanceOf(SimulatedScheduleAdapter);
  });

  it("creates real scaffold adapters in real_scaffolded mode", () => {
    process.env.HEDERA_OPERATOR_ID = "0.0.123456";
    // Valid 32-byte hex for ED25519
    process.env.HEDERA_OPERATOR_KEY = "302e020100300506032b657004220420" + "0".repeat(64);
    
    const treasuryState = buildDemoTreasury(demoStrategyConfig);
    const treasuryAdapter = new SimulatedHederaTreasuryAdapter(treasuryState.portfolio.positions);

    const core = createHederaCore({
      mode: "real_scaffolded",
      treasury: treasuryAdapter,
      treasuryState,
    });

    expect(core.consensus).toBeInstanceOf(RealConsensusAdapter);
    expect(core.schedule).toBeInstanceOf(RealScheduleAdapter);
  });
});

