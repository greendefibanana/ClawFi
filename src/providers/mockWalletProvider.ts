import { buildDemoTreasury } from "../data/demoScenario";
import type { StrategyConfig, Treasury } from "../domain/schemas";
import type { WalletProvider } from "./interfaces";

export class MockWalletProvider implements WalletProvider {
  readTreasury(config: StrategyConfig): Promise<Treasury> {
    return Promise.resolve(buildDemoTreasury(config));
  }
}
