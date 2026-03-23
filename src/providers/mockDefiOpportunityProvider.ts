import { seededDefiOpportunities } from "../data/demoScenario";
import type { DefiOpportunity } from "../domain/schemas";
import type { DefiOpportunityProvider } from "./interfaces";

export class MockDefiOpportunityProvider implements DefiOpportunityProvider {
  listOpportunities(): Promise<DefiOpportunity[]> {
    return Promise.resolve(seededDefiOpportunities);
  }
}
