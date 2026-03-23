import { demoAgentAccounts } from "../data/demoScenario";

export function readOptionalEnv(name: string) {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

export function readTreasuryAccountId() {
  return readOptionalEnv("CLAWFI_TREASURY_ACCOUNT_ID") ?? readOptionalEnv("HEDERA_OPERATOR_ID");
}

export function readTreasuryKey() {
  return readOptionalEnv("CLAWFI_TREASURY_KEY") ?? readOptionalEnv("HEDERA_OPERATOR_KEY");
}

export function readTreasuryEvmAddress() {
  return readOptionalEnv("CLAWFI_TREASURY_EVM_ADDRESS") ?? readOptionalEnv("HEDERA_OPERATOR_EVM_ADDRESS");
}

export function readAgentRecipientMap() {
  const raw = readOptionalEnv("CLAWFI_AGENT_RECIPIENTS_JSON");
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].trim().length > 0),
    );
  } catch {
    return null;
  }
}

export function resolveAgentRecipientAccountId(input: {
  agentName: string;
  mode: "simulated" | "real_scaffolded" | "wallet_connected";
  fallbackAccountId: string;
}) {
  if (input.mode === "simulated") {
    return demoAgentAccounts[input.agentName as keyof typeof demoAgentAccounts] ?? input.fallbackAccountId;
  }

  const configured = readAgentRecipientMap();
  if (configured?.[input.agentName]) {
    return configured[input.agentName];
  }

  return input.fallbackAccountId;
}
