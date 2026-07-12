import { WorkspaceClient } from "@/app/workspace/workspace-client";
import { getCrooRuntimeStatus } from "@/lib/croo/config";
import { liveSpecialistAgentNames } from "@/lib/croo/live-specialists";
import { demoTender } from "@/lib/demo/case";
import { isDemoMode } from "@/lib/utils";

export default function WorkspacePage() {
  const demoMode = isDemoMode();
  const crooStatus = getCrooRuntimeStatus();
  return (
    <WorkspaceClient
      tenderPacket={demoTender}
      demoMode={demoMode}
      envStatus={{
        demoMode,
        liveSpecialistsConfigured: crooStatus.liveSpecialists.size > 0,
        policyLockLiveEnabled: crooStatus.policyLockLiveEnabled,
        bidNormalizerLiveEnabled: crooStatus.bidNormalizerLiveEnabled,
        supplierRiskLiveEnabled: crooStatus.supplierRiskLiveEnabled,
        liveAgentNames: [...crooStatus.liveSpecialists].map((specialist) => liveSpecialistAgentNames[specialist]),
        crooConfigured: crooStatus.crooApiConfigured,
        coordinatorKeyConfigured: crooStatus.coordinatorKeyConfigured,
        policyServiceConfigured: crooStatus.policyServiceConfigured,
        bidNormalizerKeyConfigured: crooStatus.bidNormalizerKeyConfigured,
        bidNormalizerServiceConfigured: crooStatus.bidNormalizerServiceConfigured,
        supplierRiskKeyConfigured: crooStatus.supplierRiskKeyConfigured,
        supplierRiskServiceConfigured: crooStatus.supplierRiskServiceConfigured,
        liveFallbackEnabled: crooStatus.allowLiveFallback,
        openaiConfigured: Boolean(process.env.OPENAI_API_KEY)
      }}
    />
  );
}
