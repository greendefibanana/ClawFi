import { seededTokenOpportunities } from "../data/demoScenario";
import type { TokenOpportunity } from "../domain/schemas";
import type { TokenMarketProvider } from "./interfaces";

export class MockTokenMarketProvider implements TokenMarketProvider {
  listOpportunities(): Promise<TokenOpportunity[]> {
    return Promise.resolve(seededTokenOpportunities);
  }
}
