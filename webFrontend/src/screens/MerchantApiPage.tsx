import { PageTransition } from '../components/ui/PageTransition'
import { MerchantApiIntegrationPanel } from '../components/integrations/MerchantApiIntegrationPanel'
import { useAuth } from '../features/auth/AuthContext'

export function MerchantApiPage() {
  const { currentOrganization } = useAuth()
  const businessId = currentOrganization?.id

  return (
    <PageTransition>
      <MerchantApiIntegrationPanel businessId={businessId} allowMutations />
    </PageTransition>
  )
}
